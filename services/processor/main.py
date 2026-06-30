"""
DASEMS PDF Processor — FastAPI service
Crops individual question regions (typed question stem + handwritten answer
that follows it) from uploaded answer-script PDFs.

KEY DIFFERENCE FROM THE OLD VERSION:
  Pages mix computer-typed question text with handwritten (image-only) answers
  of variable height. A handwritten region has NO extractable text, so relying
  only on pdfplumber's text layer to find "Q2." means: if Q2's number happens to
  sit in/near a region that pdfplumber doesn't expose as words (rare, but also
  happens on pages that are partially scanned/flattened), you silently lose a
  question boundary - and lose the entire handwritten answer that should have
  been cropped with it.

  Fix: two-tier detection per page.
    Tier 1 (fast, accurate): pdfplumber.extract_words() — works great for pages
      where the PDF still has a real text layer for the typed parts.
    Tier 2 (fallback): render the page to an image and run pytesseract with
      bounding boxes (image_to_data) to locate "Q<n>." stems when Tier 1 finds
      nothing on that page, or finds fewer questions than expected.

  Cropping logic is unchanged in spirit: a question's image band runs from its
  own detected y-position down to the y-position of the NEXT detected question
  (or page bottom). Since we crop pixels, the handwritten answer that visually
  sits between Q_n's text and Q_(n+1)'s text is automatically included - that
  part of the original design was already correct, it just needed boundary
  detection that doesn't go blind on handwritten-heavy pages.

Install:
    pip install fastapi uvicorn pdfplumber Pillow pytesseract
Run:
    uvicorn main:app --reload --port 5001
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import base64, io, os, re, difflib

app = FastAPI(title="DASEMS PDF Processor")


# ── Subject config ─────────────────────────────────────────────────────────────
SUBJECT_ORDER   = ["Chemistry", "Physics", "Mathematics", "English"]
SUBJECT_Q_COUNT = {"Chemistry": 10, "Physics": 10, "Mathematics": 10, "English": 5}
SUBJECT_PAT     = re.compile(r"^(Chemistry|Physics|Mathematics|English)\b", re.I)

# "1." / "1)" / "Q1." / "Q1)" followed by a real character (not just whitespace)
Q_PAT = re.compile(r"^(?:Q\.?\s*)?(\d{1,2})[\.\)]\s*\S")

COVER_PAGES    = 2      # pages to skip (cover + instructions)
BOTTOM_MARGIN  = 30     # pts from page bottom
RENDER_DPI     = 150
X_MARGIN_FRAC  = 0.03

# Minimum vertical gap (in rendered px) between a detected Q-start and the
# previous one. Prevents a stray OCR mis-read ("1." inside handwriting) from
# being treated as a brand new question a few pixels below the real one.
MIN_Q_GAP_PT = 25

_PNG_MAGIC = b"\x89PNG"


# ── Models ─────────────────────────────────────────────────────────────────────
class ProcessRequest(BaseModel):
    pdfPath: str
    questionNumbers: list[int]

class CropResult(BaseModel):
    questionNumber:      int
    subject:             str
    localQuestionNumber: int
    pageNumber:          int
    imageBase64:         str
    boundingBox:         dict
    resolution:          dict
    detectionMethod:     str = "text"   # "text" | "ocr" — useful for debugging/QA

class ProcessResponse(BaseModel):
    crops:  list[CropResult]
    errors: list[str] = []

class OcrRequest(BaseModel):
    imageBase64: str

class OcrResponse(BaseModel):
    text: str

class SuggestRequest(BaseModel):
    imageBase64:  str
    questionText: str | None = None
    modelAnswer:  str | None = None
    rubric:       str | None = None
    maxMarks:     int

class SuggestResponse(BaseModel):
    suggestedMark: float
    confidence:    float
    ocrText:       str


# ── Global question map ────────────────────────────────────────────────────────
def _build_global_map() -> dict[int, tuple[str, int]]:
    m: dict[int, tuple[str, int]] = {}
    g = 1
    for subj in SUBJECT_ORDER:
        for ql in range(1, SUBJECT_Q_COUNT[subj] + 1):
            m[g] = (subj, ql)
            g += 1
    return m

GLOBAL_MAP = _build_global_map()


# ── Placeholder ────────────────────────────────────────────────────────────────
def placeholder_png(label: str = "Not found") -> bytes:
    from PIL import Image, ImageDraw
    img  = Image.new("RGB", (1100, 300), (245, 245, 245))
    draw = ImageDraw.Draw(img)
    draw.rectangle([10, 10, 1089, 289], outline=(180, 180, 180), width=2)
    draw.text((550, 150), f"[Placeholder — {label}]", fill=(100, 100, 100), anchor="mm")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data = buf.getvalue()
    assert data[:4] == _PNG_MAGIC
    return data


# ── Tier 1: text-layer boundary detection (per page) ───────────────────────────
def _text_layer_hits(page, page_idx: int, current_subject: str | None) -> tuple[list[dict], str | None]:
    """
    Scan one page's extracted words for subject headers and 'Q<n>.' question
    stems. Returns (hits, updated_subject). Each hit only records WHERE a
    question starts (top y in PDF points) — the handwritten answer that
    follows has no text and is intentionally not represented here; it gets
    swept into the crop band by the boundary-to-boundary cropping step later.
    """
    hits: list[dict] = []
    words = page.extract_words()
    if not words:
        return hits, current_subject

    lines: dict[int, dict] = {}
    for w in words:
        bucket = (round(w["top"]) // 3) * 3
        if bucket not in lines:
            lines[bucket] = {"y": w["top"], "words": []}
        lines[bucket]["words"].append(w["text"])

    for bucket in sorted(lines):
        y        = lines[bucket]["y"]
        line_txt = " ".join(lines[bucket]["words"]).strip()

        sm = SUBJECT_PAT.match(line_txt)
        if sm:
            current_subject = sm.group(1).capitalize()
            continue
        if not current_subject:
            continue

        qm = Q_PAT.match(line_txt)
        if qm:
            q_local = int(qm.group(1))
            if 1 <= q_local <= SUBJECT_Q_COUNT.get(current_subject, 10):
                hits.append({
                    "page_idx": page_idx,
                    "y":        float(y),
                    "q_local":  q_local,
                    "subject":  current_subject,
                    "method":   "text",
                })

    return hits, current_subject


# ── Tier 2: OCR fallback boundary detection (per page) ─────────────────────────
def _ocr_layer_hits(page, page_idx: int, current_subject: str | None) -> tuple[list[dict], str | None]:
    """
    Used only when a page's native text layer is empty or unreliable (e.g. the
    page was flattened/rasterized, common when scripts get scanned back in
    after handwriting is added). Renders the page and runs pytesseract with
    word-level bounding boxes, then reconstructs lines the same way Tier 1
    does, but converts pixel y-coordinates back to PDF points so downstream
    cropping math (which works in PDF points) stays consistent.
    """
    try:
        import pytesseract
    except ImportError:
        return [], current_subject

    pil_img = page.to_image(resolution=RENDER_DPI).original
    img_h   = pil_img.size[1]
    page_h  = page.height
    scale_y = img_h / page_h  # px per pt

    data = pytesseract.image_to_data(pil_img, output_type=pytesseract.Output.DICT)

    lines: dict[tuple[int, int, int], dict] = {}
    n = len(data["text"])
    for i in range(n):
        txt = data["text"][i].strip()
        if not txt:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        top_px = data["top"][i]
        if key not in lines:
            lines[key] = {"top_px": top_px, "words": []}
        lines[key]["words"].append(txt)
        lines[key]["top_px"] = min(lines[key]["top_px"], top_px)

    hits: list[dict] = []
    for key in sorted(lines, key=lambda k: lines[k]["top_px"]):
        line_txt = " ".join(lines[key]["words"]).strip()
        y_pt     = lines[key]["top_px"] / scale_y

        sm = SUBJECT_PAT.match(line_txt)
        if sm:
            current_subject = sm.group(1).capitalize()
            continue
        if not current_subject:
            continue

        qm = Q_PAT.match(line_txt)
        if qm:
            q_local = int(qm.group(1))
            if 1 <= q_local <= SUBJECT_Q_COUNT.get(current_subject, 10):
                hits.append({
                    "page_idx": page_idx,
                    "y":        y_pt,
                    "q_local":  q_local,
                    "subject":  current_subject,
                    "method":   "ocr",
                })

    return hits, current_subject


# ── Combined boundary detection across the whole document ──────────────────────
def find_question_boundaries(pdf) -> list[dict]:
    """
    Per page: try Tier 1 (text layer). If it yields nothing for that page,
    fall back to Tier 2 (OCR) for that page only — this keeps the fast path
    fast for the (usual) case where the typed question stems still have a
    real text layer, while still catching pages where they don't.

    Subject tracking carries across pages/tiers so a subject header that
    appeared on an earlier page (in whichever tier found it) still applies.

    After per-page hits are collected, hits within MIN_Q_GAP_PT points of an
    already-accepted hit for a DIFFERENT q_local but the same subject are
    treated as noise (e.g. a "1." OCR'd out of handwriting ink) and dropped,
    rather than silently overwriting a correct boundary.
    """
    current_subject: str | None = None
    raw: list[dict] = []

    for page_idx, page in enumerate(pdf.pages):
        if page_idx < COVER_PAGES:
            continue

        text_hits, current_subject = _text_layer_hits(page, page_idx, current_subject)

        if text_hits:
            raw.extend(text_hits)
            continue

        # Tier 1 found nothing usable on this page — try OCR fallback.
        print(f"[processor] page {page_idx+1}: no text-layer hits, trying OCR fallback")
        ocr_hits, current_subject = _ocr_layer_hits(page, page_idx, current_subject)
        if ocr_hits:
            print(f"[processor] page {page_idx+1}: OCR fallback found {len(ocr_hits)} question(s)")
        raw.extend(ocr_hits)

    # Deduplicate by (subject, q_local), preferring text-tier hits over OCR
    # hits if both somehow fired for the same question (text is more reliable).
    best: dict[tuple[str, int], dict] = {}
    for r in raw:
        key = (r["subject"], r["q_local"])
        if key not in best or (best[key]["method"] == "ocr" and r["method"] == "text"):
            best[key] = r

    unique = sorted(
        best.values(),
        key=lambda r: (SUBJECT_ORDER.index(r["subject"]), r["q_local"]),
    )

    # Drop near-duplicate noise: if two consecutive accepted hits land on the
    # same page within MIN_Q_GAP_PT of each other but aren't the expected
    # n, n+1 sequence for that subject, keep the first (more likely the real
    # question stem; the second is likely an OCR mis-read inside handwriting).
    cleaned: list[dict] = []
    for r in unique:
        if cleaned:
            prev = cleaned[-1]
            same_page = prev["page_idx"] == r["page_idx"]
            same_subj = prev["subject"] == r["subject"]
            sequential = r["q_local"] == prev["q_local"] + 1
            if same_page and same_subj and not sequential and (r["y"] - prev["y"]) < MIN_Q_GAP_PT:
                print(f"[processor] WARN: dropping suspicious boundary "
                      f"{r['subject']} Q{r['q_local']} (too close to Q{prev['q_local']}, "
                      f"likely OCR noise)")
                continue
        cleaned.append(r)

    # Compute y_end for each boundary = start of next boundary (same page) or
    # bottom margin (different/last page). This band — from one question's
    # text down to the next question's text — is exactly where the
    # handwritten answer for THIS question lives, so it gets cropped together
    # with the question stem automatically.
    result: list[dict] = []
    for i, r in enumerate(cleaned):
        page_h = pdf.pages[r["page_idx"]].height
        if i + 1 < len(cleaned):
            nxt   = cleaned[i + 1]
            y_end = (nxt["y"] - 4
                     if nxt["page_idx"] == r["page_idx"]
                     else page_h - BOTTOM_MARGIN)
        else:
            y_end = page_h - BOTTOM_MARGIN
        result.append({**r, "y_end": y_end})

    return result


# ── Single question crop ───────────────────────────────────────────────────────
def crop_question(page, y_start: float, y_end: float) -> tuple[bytes, dict, dict]:
    """
    Render page at RENDER_DPI. Convert PDF-point Y coords to pixel coords.
    Crop the band and return (png_bytes, bbox, resolution).
    The band always spans from the question's own text line to the next
    question's text line (or page bottom), so any handwritten answer in
    between is included in the crop — this is unchanged from before and is
    the correct behavior; only boundary DETECTION needed to be fixed.
    """
    page_h = page.height
    page_w = page.width

    pil_img      = page.to_image(resolution=RENDER_DPI).original
    img_w, img_h = pil_img.size

    scale_y = img_h / page_h
    scale_x = img_w / page_w
    pad_px  = int(6 * (RENDER_DPI / 72))

    x1 = int(page_w * X_MARGIN_FRAC       * scale_x)
    x2 = int(page_w * (1 - X_MARGIN_FRAC) * scale_x)
    y1 = max(0,     int(y_start * scale_y) - pad_px)
    y2 = min(img_h, int(y_end   * scale_y) + pad_px)

    if y2 <= y1 or x2 <= x1:
        raise ValueError(f"Degenerate crop box ({x1},{y1})→({x2},{y2})")

    cropped   = pil_img.crop((x1, y1, x2, y2))
    buf       = io.BytesIO()
    cropped.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    if png_bytes[:4] != _PNG_MAGIC:
        raise RuntimeError("Pillow produced non-PNG bytes")

    cw, ch = cropped.size
    return (
        png_bytes,
        {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
        {"width": cw, "height": ch},
    )


# ── Main processing ────────────────────────────────────────────────────────────
def process_pdf_file(
    pdf_path: str,
    question_numbers: list[int],
) -> tuple[list[CropResult], list[str]]:
    """
    Open PDF, detect all question boundaries (text-layer first, OCR fallback
    per page), then crop each requested question. Returns (crops, errors).
    Never raises — all failures become placeholder crops with error messages.
    """
    import pdfplumber

    crops:  list[CropResult] = []
    errors: list[str]        = []

    try:
        pdf_handle = pdfplumber.open(pdf_path)
    except Exception as exc:
        msg = f"Cannot open PDF at '{pdf_path}': {exc}"
        errors.append(msg)
        print(f"[processor] ERROR: {msg}")
        for g_num in question_numbers:
            subj, ql = GLOBAL_MAP.get(g_num, ("Unknown", g_num))
            crops.append(_make_placeholder(g_num, subj, ql, 0))
        return crops, errors

    with pdf_handle as pdf:
        try:
            boundaries = find_question_boundaries(pdf)
            n_text = sum(1 for b in boundaries if b["method"] == "text")
            n_ocr  = sum(1 for b in boundaries if b["method"] == "ocr")
            total_expected = sum(SUBJECT_Q_COUNT.values())
            print(f"[processor] Detected {len(boundaries)}/{total_expected} "
                  f"question boundaries ({n_text} via text, {n_ocr} via OCR fallback)")
        except Exception as exc:
            msg = f"Boundary detection failed: {exc}"
            errors.append(msg)
            print(f"[processor] ERROR: {msg}")
            boundaries = []

        if not boundaries:
            errors.append(
                "No question boundaries found via text layer or OCR fallback. "
                "Check that the PDF contains subject headers "
                "(Chemistry/Physics/Mathematics/English) and numbered questions, "
                "and that pytesseract is installed for the OCR fallback path."
            )

        bmap: dict[tuple[str, int], dict] = {
            (b["subject"], b["q_local"]): b for b in boundaries
        }

        for g_num in question_numbers:
            subj, q_local = GLOBAL_MAP.get(g_num, ("Unknown", g_num))
            label         = f"{subj} Q{q_local} (global #{g_num})"
            key           = (subj, q_local)

            if key not in bmap:
                msg = f"{label}: not detected in PDF"
                errors.append(msg)
                print(f"[processor] WARN: {msg}")
                crops.append(_make_placeholder(g_num, subj, q_local, 0))
                continue

            b = bmap[key]
            try:
                page      = pdf.pages[b["page_idx"]]
                png, bbox, res = crop_question(page, b["y"], b["y_end"])
                crops.append(CropResult(
                    questionNumber      = g_num,
                    subject             = subj,
                    localQuestionNumber = q_local,
                    pageNumber          = b["page_idx"] + 1,
                    imageBase64         = base64.b64encode(png).decode(),
                    boundingBox         = bbox,
                    resolution          = res,
                    detectionMethod     = b["method"],
                ))
                print(f"[processor] ✓ {label} → page {b['page_idx']+1} "
                      f"{res} (via {b['method']})")
            except Exception as exc:
                msg = f"{label}: crop failed — {exc}"
                errors.append(msg)
                print(f"[processor] ERROR: {msg}")
                crops.append(_make_placeholder(g_num, subj, q_local, b["page_idx"] + 1))

    return crops, errors


def _make_placeholder(g_num: int, subj: str, ql: int, page_num: int) -> CropResult:
    png = placeholder_png(f"{subj} Q{ql}")
    return CropResult(
        questionNumber      = g_num,
        subject             = subj,
        localQuestionNumber = ql,
        pageNumber          = page_num,
        imageBase64         = base64.b64encode(png).decode(),
        boundingBox         = {"x": 0, "y": 0, "width": 1100, "height": 300},
        resolution          = {"width": 1100, "height": 300},
        detectionMethod     = "none",
    )


# ── API endpoints ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    deps: dict[str, str] = {}
    for pkg, name in [("pdfplumber","pdfplumber"),("PIL","pillow"),("pytesseract","pytesseract")]:
        try:
            __import__(pkg)
            deps[name] = "ok"
        except ImportError:
            deps[name] = "MISSING"
    ok = deps.get("pdfplumber") == "ok" and deps.get("pillow") == "ok"
    return {"status": "ok" if ok else "degraded", "service": "DASEMS Processor", "deps": deps}


@app.get("/debug/path")
def debug_path(path: str):
    return {
        "path":          path,
        "exists":        os.path.exists(path),
        "is_file":       os.path.isfile(path) if os.path.exists(path) else False,
        "size_bytes":    os.path.getsize(path) if os.path.isfile(path) else None,
        "cwd":           os.getcwd(),
        "env_UPLOADS":   os.environ.get("UPLOADS_DIR", "not set"),
    }


@app.get("/debug/boundaries")
def debug_boundaries(path: str):
    """
    Inspect detected question boundaries for a PDF without cropping anything.
    Useful for diagnosing why a particular question wasn't found, and for
    confirming whether a hit came from the text layer or the OCR fallback.
        GET /debug/boundaries?path=/app/uploads/some-file.pdf
    """
    import pdfplumber
    if not os.path.exists(path):
        raise HTTPException(status_code=400, detail=f"PDF not found at '{path}'")
    with pdfplumber.open(path) as pdf:
        boundaries = find_question_boundaries(pdf)
    return {
        "count": len(boundaries),
        "boundaries": [
            {
                "subject": b["subject"],
                "questionLocal": b["q_local"],
                "page": b["page_idx"] + 1,
                "y": round(b["y"], 1),
                "yEnd": round(b["y_end"], 1),
                "method": b["method"],
            }
            for b in boundaries
        ],
    }


@app.post("/process", response_model=ProcessResponse)
def process_endpoint(req: ProcessRequest):
    print(f"[processor] /process  pdfPath={req.pdfPath}  questions={req.questionNumbers}")

    if not os.path.exists(req.pdfPath):
        raise HTTPException(
            status_code=400,
            detail=(
                f"PDF not found at '{req.pdfPath}' on the processor container. "
                f"Use GET /debug/path?path={req.pdfPath} to diagnose. "
                f"Check that the uploads volume is mounted at the same path in "
                f"both the API and processor containers."
            ),
        )

    crops, errors = process_pdf_file(req.pdfPath, req.questionNumbers)
    return ProcessResponse(crops=crops, errors=errors)


@app.post("/ocr", response_model=OcrResponse)
def ocr_image(req: OcrRequest):
    try:
        from PIL import Image
        import pytesseract
        img  = Image.open(io.BytesIO(base64.b64decode(req.imageBase64)))
        text = pytesseract.image_to_string(img)
        return OcrResponse(text=text)
    except ImportError:
        raise HTTPException(status_code=503, detail="pytesseract not installed")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/suggest-score", response_model=SuggestResponse)
def suggest_score(req: SuggestRequest):
    try:
        from PIL import Image
        import pytesseract
        img      = Image.open(io.BytesIO(base64.b64decode(req.imageBase64)))
        ocr_text = pytesseract.image_to_string(img)
    except Exception:
        ocr_text = ""

    keywords = (
        [w.lower() for w in re.findall(r"\w+", req.modelAnswer) if len(w) > 3]
        if req.modelAnswer else []
    )
    if keywords:
        ocr_lower   = ocr_text.lower()
        match_count = sum(1 for k in set(keywords) if k in ocr_lower)
        ratio       = match_count / len(set(keywords))
        suggested   = round(req.maxMarks * ratio, 2)
        confidence  = min(1.0, 0.5 + ratio * 0.5)
    elif req.modelAnswer:
        ratio      = difflib.SequenceMatcher(None, ocr_text or "", req.modelAnswer).quick_ratio()
        suggested  = round(req.maxMarks * ratio, 2)
        confidence = min(1.0, 0.4 + ratio * 0.6)
    else:
        suggested = confidence = 0.0

    return SuggestResponse(suggestedMark=suggested, confidence=confidence, ocrText=ocr_text)