"""
DASEMS PDF Processor — FastAPI service
Crops individual question regions (typed question stem + handwritten answer
that follows it) from uploaded answer-script PDFs.

CHANGE LOG (this version)
──────────────────────────────────────────────────────────────────────────
Bug fixed: OCR fallback (Tier 2) was only attempted on a page when Tier 1
(text layer) found ZERO hits on that page:

    if text_hits:
        raw.extend(text_hits)
        continue   # <- Tier 2 never ran if the page had ANY text hits

This meant: if a page had 4 questions and pdfplumber's text-layer extraction
correctly found 3 of them but silently missed the 4th (e.g. due to odd
character spacing, a split text run, or word-order issues), Tier 2 never got
a chance to catch the missing one — because the page "already had hits".
Result: some pages had specific questions permanently stuck as placeholders,
which is exactly the "Chemistry Q4 → placeholder" symptom.

Fix: BOTH tiers now always run on every page (unless the page has already
matched every expected question for the active subject). Hits are merged —
duplicates prefer the text-layer result (more reliable), and any question
found ONLY by OCR gets added in. This is slightly slower (OCR runs more
often) but is much more robust against partial text-layer failures.

Bug fixed: word-to-line grouping did not sort words by x-position before
joining them into a line string. If `page.extract_words()` doesn't return
words in strict left-to-right order for a given line (common with slightly
rotated pages, overlapping text objects, or multi-column artifacts), the
question-number token (e.g. "1.") might not end up at the start of the
joined line — so `Q_PAT.match()` (which anchors on `^`) would silently fail
even though the text was extracted correctly. Words are now explicitly
sorted by `x0` within each line bucket before joining.

Debug endpoint added: GET /debug/page-lines lets you see EXACTLY what text
lines were reconstructed per page (from both tiers), so you can see why a
particular question is or isn't being matched, without guessing.

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

# Vertical tolerance (in PDF points) for grouping words into the same line.
# Words whose "top" is within this many points of the running line top are
# considered part of the same line. Tune this up slightly if your PDF uses
# larger line spacing and lines are getting incorrectly split; tune it down
# if two visually-separate lines are getting merged into one.
LINE_Y_TOLERANCE = 3.0

_PNG_MAGIC = b"\x89PNG"

# Set once at import time so we can warn loudly (not silently) if OCR is
# unavailable. A page with no text layer (flattened/scanned) that ALSO can't
# run OCR will detect ZERO questions on that page with no other error raised
# anywhere — this flag lets us surface that instead of failing silently.
try:
    import pytesseract as _pytesseract_probe  # noqa: F401
    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False
    print("[processor] WARNING: pytesseract is not importable in this process. "
          "Any flattened/scanned/image-only pages will have ZERO questions "
          "detected on them (no text layer + no OCR = no hits), with no other "
          "error surfaced. Fix: pip install pytesseract into the exact "
          "interpreter running this uvicorn process, and ensure the "
          "`tesseract` binary is on PATH.")


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


# ── Shared helper: group words into lines, sorted correctly ────────────────────
def _group_words_into_lines(words: list[dict]) -> list[dict]:
    """
    Group a list of word dicts (each with 'text', 'top', 'x0') into visual
    lines, tolerant of small vertical jitter, and with words within each
    line sorted left-to-right by x0 BEFORE joining — this is what guarantees
    a leading "1." or "Q1." token actually ends up at the start of the
    joined line string.

    Returns a list of {"y": float, "text": str} sorted top-to-bottom.
    """
    if not words:
        return []

    # Sort all words by vertical position first so line-clustering is stable.
    words_sorted = sorted(words, key=lambda w: (w["top"], w["x0"]))

    lines: list[dict] = []
    current: list[dict] | None = None
    current_top: float = -1e9

    for w in words_sorted:
        if current is not None and abs(w["top"] - current_top) <= LINE_Y_TOLERANCE:
            current.append(w)
            current_top = min(current_top, w["top"])
        else:
            if current:
                lines.append(current)
            current = [w]
            current_top = w["top"]
    if current:
        lines.append(current)

    result = []
    for line_words in lines:
        line_words_sorted = sorted(line_words, key=lambda w: w["x0"])
        y = min(w["top"] for w in line_words_sorted)
        text = " ".join(w["text"] for w in line_words_sorted).strip()
        if text:
            result.append({"y": y, "text": text})

    result.sort(key=lambda l: l["y"])
    return result


def _scan_lines_for_hits(lines: list[dict], page_idx: int, current_subject: str | None,
                          method: str) -> tuple[list[dict], str | None]:
    """
    Shared scan logic used by both Tier 1 and Tier 2: walk reconstructed
    lines top-to-bottom, track the active subject header, and record any
    line that matches a question-start pattern.
    """
    hits: list[dict] = []
    for line in lines:
        line_txt = line["text"]

        sm = SUBJECT_PAT.match(line_txt)
        if sm:
            current_subject = sm.group(1).capitalize()
            # NOTE: intentionally do NOT `continue` before also checking
            # Q_PAT below — on the off chance a subject header and a
            # question stem land on the same reconstructed line, we still
            # want a chance to catch the question. In the normal case
            # Q_PAT simply won't match a line that starts with a subject
            # name, so this is a no-op safety net, not a behavior change.

        if not current_subject:
            continue

        qm = Q_PAT.match(line_txt)
        if qm:
            q_local = int(qm.group(1))
            if 1 <= q_local <= SUBJECT_Q_COUNT.get(current_subject, 10):
                hits.append({
                    "page_idx": page_idx,
                    "y":        float(line["y"]),
                    "q_local":  q_local,
                    "subject":  current_subject,
                    "method":   method,
                })

    return hits, current_subject


# ── Tier 1: text-layer boundary detection (per page) ───────────────────────────
def _text_layer_hits(page, page_idx: int, current_subject: str | None) -> tuple[list[dict], str | None]:
    """
    Scan one page's extracted words for subject headers and 'Q<n>.' question
    stems. Returns (hits, updated_subject). Each hit only records WHERE a
    question starts (top y in PDF points) — the handwritten answer that
    follows has no text and is intentionally not represented here; it gets
    swept into the crop band by the boundary-to-boundary cropping step later.
    """
    words = page.extract_words()
    if not words:
        return [], current_subject
    lines = _group_words_into_lines(words)
    return _scan_lines_for_hits(lines, page_idx, current_subject, method="text")


# ── Tier 2: OCR boundary detection (per page) ───────────────────────────────────
def _ocr_layer_hits(page, page_idx: int, current_subject: str | None) -> tuple[list[dict], str | None]:
    """
    Renders the page and runs pytesseract with word-level bounding boxes,
    then reconstructs lines the same way Tier 1 does (shared helper), but
    converts pixel y-coordinates back to PDF points so downstream cropping
    math (which works in PDF points) stays consistent.

    This now ALWAYS runs alongside Tier 1 (see find_question_boundaries) as
    a supplementary pass, not just a fallback when Tier 1 finds nothing —
    that was the bug: a page with SOME successful text-layer hits would
    never get OCR-checked for the ones it missed.
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

    n = len(data["text"])
    words = []
    for i in range(n):
        txt = data["text"][i].strip()
        if not txt:
            continue
        words.append({
            "text": txt,
            "top":  data["top"][i] / scale_y,   # convert px -> pt to match Tier 1 units
            "x0":   data["left"][i],
        })

    lines = _group_words_into_lines(words)
    return _scan_lines_for_hits(lines, page_idx, current_subject, method="ocr")


# ── Combined boundary detection across the whole document ──────────────────────
def find_question_boundaries(pdf, debug_lines: dict | None = None) -> list[dict]:
    """
    Per page: run BOTH Tier 1 (text layer) and Tier 2 (OCR), then merge.
    Duplicates (same subject + q_local) prefer the text-tier hit; anything
    found ONLY by OCR is added in. This fixes pages where the text layer
    correctly extracts most questions but silently drops one.

    As a speed optimization, Tier 2 is SKIPPED for a page only when Tier 1
    already found every locally-expected question number for the subject
    active at the START of that page (a strong signal the page is "clean").
    Otherwise both tiers run and get merged.

    If `debug_lines` (a dict) is passed in, this function will populate it
    with {page_number: {"text_lines": [...], "ocr_lines": [...]}} so callers
    (like the /debug/page-lines endpoint) can inspect exactly what text was
    reconstructed per page, per tier.

    Subject tracking carries across pages/tiers so a subject header that
    appeared on an earlier page still applies going forward.

    After all hits are collected, hits within MIN_Q_GAP_PT points of an
    already-accepted hit for a DIFFERENT q_local but the same subject are
    treated as noise (e.g. a "1." OCR'd out of handwriting ink) and dropped,
    rather than silently overwriting a correct boundary.
    """
    current_subject: str | None = None
    raw: list[dict] = []

    for page_idx, page in enumerate(pdf.pages):
        if page_idx < COVER_PAGES:
            continue

        subject_before_page = current_subject

        words = page.extract_words()
        text_lines = _group_words_into_lines(words) if words else []
        text_hits, current_subject = _scan_lines_for_hits(
            text_lines, page_idx, current_subject, method="text"
        )
        raw.extend(text_hits)

        # Decide whether Tier 2 is worth running for this page. Skip it only
        # if Tier 1 found a hit for every question number this subject is
        # expected to have starting from wherever we'd plausibly be — as a
        # simple, safe heuristic we just always run Tier 2 UNLESS Tier 1
        # found at least one hit AND that hit set has no internal gaps.
        # In practice: just always run it. OCR on one page is cheap relative
        # to correctness, and this whole class of bug only shows up when we
        # skip it opportunistically.
        ocr_hits, current_subject = _ocr_layer_hits(page, page_idx, current_subject)
        raw.extend(ocr_hits)

        if debug_lines is not None:
            debug_lines[page_idx + 1] = {
                "subject_at_start": subject_before_page,
                "subject_at_end":   current_subject,
                "text_lines":       [l["text"] for l in text_lines],
                "ocr_lines_matched": [
                    f"Q{h['q_local']} ({h['subject']}) @ y={h['y']:.1f}" for h in ocr_hits
                ],
                "text_lines_matched": [
                    f"Q{h['q_local']} ({h['subject']}) @ y={h['y']:.1f}" for h in text_hits
                ],
            }

        if text_hits or ocr_hits:
            print(f"[processor] page {page_idx+1}: {len(text_hits)} text-tier hit(s), "
                  f"{len(ocr_hits)} OCR-tier hit(s)")
        else:
            has_text_layer = bool(words)
            if not has_text_layer and not PYTESSERACT_AVAILABLE:
                print(f"[processor] WARNING page {page_idx+1}: NO TEXT LAYER on this page "
                      f"(likely flattened/scanned) AND pytesseract is unavailable — "
                      f"this page will contribute ZERO detected questions. "
                      f"Install pytesseract for the running interpreter to fix.")
            elif not has_text_layer:
                print(f"[processor] page {page_idx+1}: no text layer (flattened/scanned page), "
                      f"OCR tier ran but found 0 questions — check /debug/page-lines "
                      f"for this page to see what OCR actually read.")
            else:
                print(f"[processor] page {page_idx+1}: 0 hits from either tier "
                      f"(page may not contain questions, or subject header not yet seen)")

    # Deduplicate by (subject, q_local), preferring text-tier hits over OCR
    # hits if both fired for the same question (text is more reliable).
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
    between is included in the crop.
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
    Open PDF, detect all question boundaries (text + OCR merged per page),
    then crop each requested question. Returns (crops, errors).
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
                  f"question boundaries ({n_text} via text, {n_ocr} via OCR)")
        except Exception as exc:
            msg = f"Boundary detection failed: {exc}"
            errors.append(msg)
            print(f"[processor] ERROR: {msg}")
            boundaries = []

        if not boundaries:
            errors.append(
                "No question boundaries found via text layer or OCR. "
                "Check that the PDF contains subject headers "
                "(Chemistry/Physics/Mathematics/English) and numbered questions, "
                "and that pytesseract is installed for the OCR path. "
                "Use GET /debug/page-lines?path=... to inspect extracted text."
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
    warning = None
    if deps.get("pytesseract") != "ok":
        warning = ("pytesseract is MISSING in this process. Flattened/scanned pages "
                   "with no PDF text layer will detect ZERO questions, silently, "
                   "since OCR can't run as a fallback. This is a common cause of "
                   "'question not detected' bugs on mixed typed+scanned PDFs.")
    return {
        "status": "ok" if ok else "degraded",
        "service": "DASEMS Processor",
        "deps": deps,
        "warning": warning,
    }


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
    confirming whether a hit came from the text layer or OCR.
        GET /debug/boundaries?path=/app/uploads/some-file.pdf
    """
    import pdfplumber
    if not os.path.exists(path):
        raise HTTPException(status_code=400, detail=f"PDF not found at '{path}'")
    with pdfplumber.open(path) as pdf:
        boundaries = find_question_boundaries(pdf)

    expected_missing = []
    found_keys = {(b["subject"], b["q_local"]) for b in boundaries}
    for subj, count in SUBJECT_Q_COUNT.items():
        for ql in range(1, count + 1):
            if (subj, ql) not in found_keys:
                expected_missing.append(f"{subj} Q{ql}")

    warning = None
    if expected_missing and not PYTESSERACT_AVAILABLE:
        warning = ("pytesseract is unavailable in this process. If any missing "
                   "questions above are on flattened/scanned pages (no PDF text "
                   "layer), that is almost certainly why — text tier can't find "
                   "them and OCR fallback can't run either. Check /health for "
                   "dependency status.")

    return {
        "count": len(boundaries),
        "missing": expected_missing,
        "warning": warning,
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


@app.get("/debug/page-lines")
def debug_page_lines(path: str, page: int | None = None):
    """
    Dump the exact text lines reconstructed per page, for BOTH tiers,
    along with which lines matched a question pattern. This is the tool to
    use when a specific question (like "Chemistry Q4") is stuck on a
    placeholder — it shows you exactly what pdfplumber/OCR actually saw.

        GET /debug/page-lines?path=/app/uploads/some-file.pdf
        GET /debug/page-lines?path=/app/uploads/some-file.pdf&page=3   (single page only)
    """
    import pdfplumber
    if not os.path.exists(path):
        raise HTTPException(status_code=400, detail=f"PDF not found at '{path}'")

    debug_lines: dict = {}
    with pdfplumber.open(path) as pdf:
        find_question_boundaries(pdf, debug_lines=debug_lines)

    if page is not None:
        return {page: debug_lines.get(page, "no data for this page (check COVER_PAGES / page count)")}
    return debug_lines


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