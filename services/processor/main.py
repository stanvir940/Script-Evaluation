"""
DASEMS PDF Processor — FastAPI service
Crops individual question images from uploaded answer-script PDFs.

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
Q_PAT           = re.compile(r"^(\d{1,2})\.\s+\S")   # "1. Word…"

COVER_PAGES    = 2      # pages to skip (cover + instructions)
BOTTOM_MARGIN  = 30     # pts from page bottom
RENDER_DPI     = 150
X_MARGIN_FRAC  = 0.03

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


# ── Question boundary detection ────────────────────────────────────────────────
def find_question_boundaries(pdf) -> list[dict]:
    """
    Scan every page (skipping COVER_PAGES) and return sorted list of:
        { subject, q_local, page_idx, y, y_end }
    Uses text positions — works for both question papers and answer scripts
    (as long as question numbers are printed on the page).
    """
    current_subject: str | None = None
    raw: list[dict] = []

    for page_idx, page in enumerate(pdf.pages):
        if page_idx < COVER_PAGES:
            continue
        words = page.extract_words()
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
                    raw.append({
                        "page_idx": page_idx,
                        "y":        float(y),
                        "q_local":  q_local,
                        "subject":  current_subject,
                    })

    # Deduplicate
    seen: set   = set()
    unique: list = []
    for r in raw:
        key = (r["subject"], r["q_local"])
        if key not in seen:
            seen.add(key)
            unique.append(r)

    unique.sort(key=lambda r: (SUBJECT_ORDER.index(r["subject"]), r["q_local"]))

    result: list[dict] = []
    for i, r in enumerate(unique):
        page_h = pdf.pages[r["page_idx"]].height
        if i + 1 < len(unique):
            nxt   = unique[i + 1]
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
    """
    page_h = page.height
    page_w = page.width

    pil_img      = page.to_image(resolution=RENDER_DPI).original
    img_w, img_h = pil_img.size

    # Scale: PDF points → pixels
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
    Open PDF, detect all question boundaries by text position,
    then crop each requested question. Returns (crops, errors).
    Never raises — all failures become placeholder crops with error messages.
    """
    import pdfplumber

    crops:  list[CropResult] = []
    errors: list[str]        = []

    # ── open PDF ──────────────────────────────────────────────────────────────
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
        # ── detect question boundaries ────────────────────────────────────────
        try:
            boundaries = find_question_boundaries(pdf)
            print(f"[processor] Detected {len(boundaries)}/35 question boundaries")
        except Exception as exc:
            msg = f"Boundary detection failed: {exc}"
            errors.append(msg)
            print(f"[processor] ERROR: {msg}")
            boundaries = []

        if not boundaries:
            errors.append(
                "No question boundaries found. Check that the PDF contains subject "
                "headers (Chemistry/Physics/Mathematics/English) and numbered questions."
            )

        bmap: dict[tuple[str, int], dict] = {
            (b["subject"], b["q_local"]): b for b in boundaries
        }

        # ── crop each question ────────────────────────────────────────────────
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
                ))
                print(f"[processor] ✓ {label} → page {b['page_idx']+1} {res}")
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
    """
    Check whether a file path is accessible from the processor container.
    Call this from your browser or curl to diagnose path issues:
        GET /debug/path?path=/app/uploads/some-file.pdf
    """
    return {
        "path":          path,
        "exists":        os.path.exists(path),
        "is_file":       os.path.isfile(path) if os.path.exists(path) else False,
        "size_bytes":    os.path.getsize(path) if os.path.isfile(path) else None,
        "cwd":           os.getcwd(),
        "env_UPLOADS":   os.environ.get("UPLOADS_DIR", "not set"),
    }


@app.post("/process", response_model=ProcessResponse)
def process_endpoint(req: ProcessRequest):
    """
    Crop all requested question images from a student answer-script PDF.

    pdfPath must be the absolute path as seen by THIS processor container.
    If Node.js and the processor run in separate Docker containers, the path
    must point to a shared volume mount, not the Node.js host path.

    Common mistake:
        Node.js stores file at:  /app/uploads/abc.pdf
        Processor sees it at:    /uploads/abc.pdf   (volume mounted differently)
    Fix: set UPLOADS_DIR in both containers to the same mount point,
         or use /debug/path to check what the processor can see.
    """
    print(f"[processor] /process  pdfPath={req.pdfPath}  questions={req.questionNumbers}")

    # Explicit path check with a clear error message
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