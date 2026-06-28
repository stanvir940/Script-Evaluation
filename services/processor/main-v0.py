from fastapi import FastAPI
from pydantic import BaseModel
import base64
import io
import os
import difflib

app = FastAPI(title="DASEMS PDF Processor")

class ProcessRequest(BaseModel):
    pdfPath: str
    questionNumbers: list[int]

class CropResult(BaseModel):
    questionNumber: int
    pageNumber: int
    imageBase64: str
    boundingBox: dict
    resolution: dict

class ProcessResponse(BaseModel):
    crops: list[CropResult]

def generate_placeholder_png(question_number: int) -> bytes:
    try:
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new("RGB", (800, 400), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        draw.rectangle([20, 20, 780, 380], outline=(200, 200, 200), width=2)
        draw.text((400, 190), f"Answer Q{question_number}", fill=(50, 50, 50), anchor="mm")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except ImportError:
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#fff"/><text x="400" y="200" text-anchor="middle" font-size="24">Q{question_number}</text></svg>'
        return svg.encode()

def question_page_index(position: int) -> int:
    return position // 10

def crop_question_image(page_png: bytes, question_index_on_page: int, questions_on_page: int) -> tuple[bytes, dict, dict]:
    from PIL import Image

    with Image.open(io.BytesIO(page_png)) as image:
        width, height = image.size
        top_margin = int(height * 0.04)
        bottom_margin = int(height * 0.03)
        usable_height = max(1, height - top_margin - bottom_margin)
        crop_height = max(1, usable_height // questions_on_page)
        y1 = top_margin + question_index_on_page * crop_height
        y2 = height - bottom_margin if question_index_on_page == questions_on_page - 1 else y1 + crop_height
        x1 = int(width * 0.03)
        x2 = int(width * 0.97)
        cropped = image.crop((x1, y1, x2, y2))
        output = io.BytesIO()
        cropped.save(output, format="PNG")
        crop_width, cropped_height = cropped.size
        return (
            output.getvalue(),
            {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
            {"width": crop_width, "height": cropped_height},
        )

def process_with_pymupdf(pdf_path: str, question_numbers: list[int]) -> list[CropResult]:
    import fitz  # PyMuPDF

    doc = fitz.open(pdf_path)
    page_cache: dict[int, bytes] = {}
    page_question_counts: dict[int, int] = {}

    for index, _question_number in enumerate(question_numbers):
        page_index = min(question_page_index(index), len(doc) - 1)
        page_question_counts[page_index] = page_question_counts.get(page_index, 0) + 1

    crops = []
    page_offsets: dict[int, int] = {}

    for index, question_number in enumerate(question_numbers):
        page_index = min(question_page_index(index), len(doc) - 1)
        if page_index not in page_cache:
            page = doc[page_index]
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            page_cache[page_index] = pix.tobytes("png")

        question_index_on_page = page_offsets.get(page_index, 0)
        page_offsets[page_index] = question_index_on_page + 1
        image_bytes, bounding_box, resolution = crop_question_image(
            page_cache[page_index],
            question_index_on_page,
            page_question_counts[page_index],
        )

        crops.append(
            CropResult(
                questionNumber=question_number,
                pageNumber=page_index + 1,
                imageBase64=base64.b64encode(image_bytes).decode(),
                boundingBox=bounding_box,
                resolution=resolution,
            )
        )

    doc.close()
    return crops


class OcrRequest(BaseModel):
    imageBase64: str


class OcrResponse(BaseModel):
    text: str


@app.post("/ocr", response_model=OcrResponse)
def ocr_image(req: OcrRequest):
    try:
        from PIL import Image
        import pytesseract

        img_data = base64.b64decode(req.imageBase64)
        img = Image.open(io.BytesIO(img_data))
        text = pytesseract.image_to_string(img)
        return OcrResponse(text=text)
    except Exception:
        return OcrResponse(text="")


class SuggestRequest(BaseModel):
    imageBase64: str
    questionText: str | None = None
    modelAnswer: str | None = None
    rubric: str | None = None
    maxMarks: int


class SuggestResponse(BaseModel):
    suggestedMark: float
    confidence: float
    ocrText: str


@app.post("/suggest-score", response_model=SuggestResponse)
def suggest_score(req: SuggestRequest):
    # Run OCR first
    try:
        from PIL import Image
        import pytesseract

        img_data = base64.b64decode(req.imageBase64)
        img = Image.open(io.BytesIO(img_data))
        ocr_text = pytesseract.image_to_string(img)
    except Exception:
        ocr_text = ""

    # Heuristic scoring: keyword overlap
    keywords = []
    if req.modelAnswer:
        # simple split on non-word characters
        import re

        keywords = [w.lower() for w in re.findall(r"\w+", req.modelAnswer) if len(w) > 3]

    match_count = 0
    if keywords:
        ocr_lower = ocr_text.lower()
        for k in set(keywords):
            if k in ocr_lower:
                match_count += 1
        ratio = match_count / len(set(keywords)) if keywords else 0
        suggested = round(req.maxMarks * ratio, 2)
        confidence = min(1.0, 0.5 + ratio * 0.5)
    else:
        # fallback to fuzzy similarity between OCR text and modelAnswer
        if req.modelAnswer:
            seq = difflib.SequenceMatcher(None, (ocr_text or ""), req.modelAnswer)
            ratio = seq.quick_ratio()
            suggested = round(req.maxMarks * ratio, 2)
            confidence = min(1.0, 0.4 + ratio * 0.6)
        else:
            suggested = 0.0
            confidence = 0.0

    return SuggestResponse(suggestedMark=suggested, confidence=confidence, ocrText=ocr_text)

@app.get("/health")
def health():
    return {"status": "ok", "service": "DASEMS Processor"}

@app.post("/process", response_model=ProcessResponse)
def process_pdf(req: ProcessRequest):
    pdf_exists = os.path.exists(req.pdfPath)
    if pdf_exists:
        try:
            return ProcessResponse(crops=process_with_pymupdf(req.pdfPath, req.questionNumbers))
        except Exception:
            pass

    crops = []

    for i, qnum in enumerate(req.questionNumbers):
        img_bytes = generate_placeholder_png(qnum)
        crops.append(
            CropResult(
                questionNumber=qnum,
                pageNumber=(i // 10) + 1,
                imageBase64=base64.b64encode(img_bytes).decode(),
                boundingBox={"x": 0, "y": 0, "width": 800, "height": 400},
                resolution={"width": 800, "height": 400},
            )
        )

    return ProcessResponse(crops=crops)
