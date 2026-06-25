from fastapi import FastAPI
from pydantic import BaseModel
import base64
import io
import os

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

@app.get("/health")
def health():
    return {"status": "ok", "service": "DASEMS Processor"}

@app.post("/process", response_model=ProcessResponse)
def process_pdf(req: ProcessRequest):
    crops = []
    pdf_exists = os.path.exists(req.pdfPath)

    for i, qnum in enumerate(req.questionNumbers):
        if pdf_exists:
            try:
                import fitz  # PyMuPDF
                doc = fitz.open(req.pdfPath)
                page_idx = min(i // 10, len(doc) - 1)
                page = doc[page_idx]
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                img_bytes = pix.tobytes("png")
                doc.close()
            except Exception:
                img_bytes = generate_placeholder_png(qnum)
        else:
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
