import sharp from "sharp";
import {
  Question,
  Answer,
  Script,
  Student,
  AdmissionSession,
  Subject,
} from "../models";
import { saveProcessedImage } from "./storage";
import { assignAllUnassigned } from "./reconciliation";
import { config } from "../config";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProcessedCrop {
  questionNumber: number;
  subject: string;
  localQuestionNumber: number;
  pageNumber: number;
  imageBuffer: Buffer;
  boundingBox: { x: number; y: number; width: number; height: number };
  resolution: { width: number; height: number };
}

interface ProcessorCropRaw {
  questionNumber: number;
  subject: string;
  localQuestionNumber: number;
  pageNumber: number;
  imageBase64: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  resolution: { width: number; height: number };
}

interface ProcessorResponse {
  crops: ProcessorCropRaw[];
  errors: string[];
}

// ── PNG validation ─────────────────────────────────────────────────────────────

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function isPng(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(PNG_MAGIC);
}

// ── Path conversion ────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS:
//   Node.js and the processor may see the uploads folder at different paths.
//
// DEV (no Docker, everything on your Mac):
//   api path:       /Users/you/project/apps/api/uploads/pdfs/sessionId/file.pdf
//   processor path: /Users/you/project/apps/api/uploads/pdfs/sessionId/file.pdf
//   → same machine, same path → set PROCESSOR_UPLOADS_PREFIX="" or leave unset
//   → run processor: cd services/processor && uvicorn main:app --reload --port 5001
//
// DOCKER (production):
//   api container writes to:      /app/uploads/pdfs/sessionId/file.pdf
//   processor container reads at: /uploads/pdfs/sessionId/file.pdf
//   → set PROCESSOR_UPLOADS_PREFIX=/uploads in api container environment
//
// THE BUG THAT WAS HERE BEFORE:
//   Old code used path.basename() which stripped "pdfs/sessionId/" and only
//   kept the filename, so processor got "/uploads/file.pdf" instead of
//   "/uploads/pdfs/sessionId/file.pdf" → file not found → white placeholder.
//
// THE FIX:
//   Find the uploadsDir segment in the absolute path and preserve everything
//   after it (the relative path including all subdirectories).

function toProcessorPath(apiAbsolutePath: string): string {
  const processorPrefix = process.env.PROCESSOR_UPLOADS_PREFIX;

  // Dev mode: no prefix set → same machine → no conversion needed
  if (!processorPrefix) {
    return apiAbsolutePath;
  }

  // Strip leading/trailing slashes from uploadsDir for clean matching
  const uploadsDir = config.uploadsDir.replace(/^\/+|\/+$/g, "");
  const marker = `/${uploadsDir}/`;
  const idx = apiAbsolutePath.indexOf(marker);

  if (idx === -1) {
    // Can't find the uploads segment — log clearly and return as-is
    console.warn(
      `[processor] toProcessorPath: marker '${marker}' not found in '${apiAbsolutePath}'. ` +
        `Returning path unchanged. Check config.uploadsDir value.`,
    );
    return apiAbsolutePath;
  }

  // Everything after "/uploads/" → "pdfs/sessionId/file.pdf"
  const relativePath = apiAbsolutePath.slice(idx + marker.length);

  // "/uploads" + "/" + "pdfs/sessionId/file.pdf" → "/uploads/pdfs/sessionId/file.pdf"
  return `${processorPrefix.replace(/\/+$/, "")}/${relativePath}`;
}

// ── Processor HTTP call ────────────────────────────────────────────────────────

async function callPythonProcessor(
  pdfPath: string,
  questionNumbers: number[],
): Promise<ProcessedCrop[]> {
  const processorPath = toProcessorPath(pdfPath);

  console.log(`[processor] Calling /process`);
  console.log(`  api path:       ${pdfPath}`);
  console.log(`  processor path: ${processorPath}`);
  console.log(`  processor url:  ${config.processorUrl}`);

  // ── network call ────────────────────────────────────────────────────────────
  let res: Response;
  try {
    res = await fetch(`${config.processorUrl}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfPath: processorPath, questionNumbers }),
    });
  } catch (networkErr) {
    // "fetch failed" = processor not running or wrong URL
    throw new Error(
      `Cannot reach Python processor at "${config.processorUrl}".\n` +
        `  Dev fix : cd services/processor && uvicorn main:app --reload --port 5001\n` +
        `  Docker  : docker compose up processor\n` +
        `  Then verify: curl ${config.processorUrl}/health`,
    );
  }

  // ── HTTP error ──────────────────────────────────────────────────────────────
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 400) {
      throw new Error(
        `Processor HTTP 400 — PDF not found on processor container.\n` +
          `  Path sent: "${processorPath}"\n` +
          `  Fix: set PROCESSOR_UPLOADS_PREFIX env var to the path where the\n` +
          `  processor container can see the uploads volume (e.g. /uploads).\n` +
          `  Detail: ${body}`,
      );
    }
    throw new Error(`Processor HTTP ${res.status}: ${body}`);
  }

  // ── parse & validate ────────────────────────────────────────────────────────
  const data = (await res.json()) as ProcessorResponse;

  if (data.errors?.length) {
    console.warn(
      `[processor] Non-fatal warnings (${data.errors.length}):`,
      data.errors,
    );
  }

  const crops: ProcessedCrop[] = [];

  for (const c of data.crops) {
    const label = `${c.subject} Q${c.localQuestionNumber} (#${c.questionNumber})`;
    const buf = Buffer.from(c.imageBase64, "base64");

    if (!isPng(buf)) {
      // SVG or garbage returned — use a labelled placeholder instead
      const preview = buf.subarray(0, 40).toString("utf8").replace(/\n/g, " ");
      console.error(
        `[processor] ${label}: not a PNG (starts: "${preview}") — using placeholder`,
      );
      crops.push({
        ...omitBuffer(c),
        imageBuffer: await generatePlaceholderPng(label),
      });
      continue;
    }

    console.log(
      `[processor] ✓ ${label}  ${buf.length} bytes  page ${c.pageNumber}`,
    );
    crops.push({ ...omitBuffer(c), imageBuffer: buf });
  }

  return crops;
}

function omitBuffer(c: ProcessorCropRaw): Omit<ProcessedCrop, "imageBuffer"> {
  return {
    questionNumber: c.questionNumber,
    subject: c.subject,
    localQuestionNumber: c.localQuestionNumber,
    pageNumber: c.pageNumber,
    boundingBox: c.boundingBox,
    resolution: c.resolution,
  };
}

// ── OCR & score suggestion ─────────────────────────────────────────────────────

async function callProcessorOcr(imageBuffer: Buffer): Promise<string> {
  try {
    const res = await fetch(`${config.processorUrl}/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: imageBuffer.toString("base64") }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data.text ?? "";
  } catch {
    return "";
  }
}

async function callProcessorSuggest(
  imageBuffer: Buffer,
  modelAnswer: string | undefined,
  rubric: string | undefined,
  maxMarks: number,
): Promise<{
  suggestedMark: number;
  confidence: number;
  ocrText: string;
} | null> {
  try {
    const res = await fetch(`${config.processorUrl}/suggest-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: imageBuffer.toString("base64"),
        modelAnswer,
        rubric,
        maxMarks,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Placeholder ────────────────────────────────────────────────────────────────

async function generatePlaceholderPng(
  label: string = "Missing",
): Promise<Buffer> {
  const w = 1100,
    h = 300;
  const escapedLabel = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const svg = `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" fill="#f5f5f5"/>
      <rect x="8" y="8" width="${w - 16}" height="${h - 16}"
            fill="none" stroke="#cccccc" stroke-width="2"/>
      <text x="${w / 2}" y="${h / 2 - 10}" font-family="sans-serif" font-size="22"
            fill="#999999" text-anchor="middle">Image not available</text>
      <text x="${w / 2}" y="${h / 2 + 20}" font-family="sans-serif" font-size="16"
            fill="#bbbbbb" text-anchor="middle">${escapedLabel}</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generatePlaceholderCrops(
  questionNumbers: number[],
): Promise<ProcessedCrop[]> {
  const buf = await generatePlaceholderPng("Processor unavailable");
  return questionNumbers.map((q) => ({
    questionNumber: q,
    subject: "Unknown",
    localQuestionNumber: q,
    pageNumber: Math.ceil(q / 10),
    imageBuffer: buf,
    boundingBox: { x: 0, y: 0, width: 1100, height: 300 },
    resolution: { width: 1100, height: 300 },
  }));
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function processScript(scriptId: string): Promise<void> {
  const script = await Script.findById(scriptId);
  if (!script) return;

  const [student, session] = await Promise.all([
    Student.findById(script.studentId),
    AdmissionSession.findById(script.sessionId),
  ]);
  if (!student || !session) return;

  await seedQuestionsForSession(session._id.toString());
  const questions = await Question.find({ sessionId: session._id }).sort({
    questionNumber: 1,
  });

  script.processingStatus = "PROCESSING";
  student.processingStatus = "PROCESSING";
  await Promise.all([script.save(), student.save()]);

  try {
    const pdfPath = `${process.cwd()}/${config.uploadsDir}/${script.originalPdfKey}`;
    const questionNumbers = questions.map((q) => q.questionNumber);

    let crops: ProcessedCrop[];
    try {
      crops = await callPythonProcessor(pdfPath, questionNumbers);
    } catch (processorErr) {
      // Log the real error — don't silently discard it
      console.error(
        `[processScript] Processor call failed — falling back to placeholders:`,
      );
      console.error(
        processorErr instanceof Error ? processorErr.message : processorErr,
      );
      script.processingError =
        processorErr instanceof Error
          ? processorErr.message
          : String(processorErr);
      crops = await generatePlaceholderCrops(questionNumbers);
    }

    for (const question of questions) {
      const crop =
        crops.find((c) => c.questionNumber === question.questionNumber) ??
        (await generatePlaceholderCrops([question.questionNumber]))[0];

      const stored = await saveProcessedImage(
        script.sessionId.toString(),
        student.sCode,
        question.questionNumber,
        crop.imageBuffer,
      );

      const answerDoc = await Answer.findOneAndUpdate(
        {
          sessionId: script.sessionId,
          sCode: student.sCode,
          questionNumber: question.questionNumber,
        },
        {
          sessionId: script.sessionId,
          scriptId: script._id,
          studentId: student._id,
          sCode: student.sCode,
          subjectId: question.subjectId,
          questionId: question._id,
          questionNumber: question.questionNumber,
          maxMarks: question.maxMarks,
          imageKey: stored.key,
          imageUrl: stored.url,
          pageNumber: crop.pageNumber,
          boundingBox: crop.boundingBox,
          resolution: crop.resolution,
          rotation: 0,
          ocrStatus: "SKIPPED",
          ocrText: "",
          suggestedMark: undefined,
          suggestedConfidence: undefined,
          processingStatus: "READY",
          status: "UNASSIGNED",
        },
        { upsert: true, new: true },
      );

      try {
        const suggest = await callProcessorSuggest(
          crop.imageBuffer,
          question.modelAnswer,
          question.rubric,
          question.maxMarks,
        );
        if (suggest) {
          answerDoc.ocrStatus = "DONE";
          answerDoc.ocrText = suggest.ocrText ?? "";
          answerDoc.suggestedMark = suggest.suggestedMark;
          answerDoc.suggestedConfidence = suggest.confidence;
        } else {
          const ocr = await callProcessorOcr(crop.imageBuffer);
          answerDoc.ocrStatus = ocr ? "DONE" : "FAILED";
          answerDoc.ocrText = ocr;
        }
        await answerDoc.save();
      } catch {
        answerDoc.ocrStatus = "FAILED";
        await answerDoc.save();
      }
    }

    script.processingStatus = "READY";
    script.pageCount = Math.max(...crops.map((c) => c.pageNumber), 1);
    student.processingStatus = "READY";
    await Promise.all([script.save(), student.save()]);

    await assignAllUnassigned(script.sessionId.toString());
  } catch (err) {
    script.processingStatus = "FAILED";
    script.processingError =
      err instanceof Error ? err.message : "Processing failed";
    student.processingStatus = "FAILED";
    await Promise.all([script.save(), student.save()]);
  }
}

// ── Question seeding ───────────────────────────────────────────────────────────

export async function buildDefaultQuestionMapping(sessionId: string) {
  const subjects = await Subject.find({ isActive: true }).sort({ code: 1 });
  const mapping = [
    { subjectCode: "PHY", start: 1, end: 10 },
    { subjectCode: "CHE", start: 11, end: 20 },
    { subjectCode: "MAT", start: 21, end: 30 },
    { subjectCode: "ENG", start: 31, end: 35 },
  ];
  return mapping
    .map((m) => {
      const subject = subjects.find((s) => s.code === m.subjectCode);
      if (!subject) return null;
      return {
        subjectId: subject._id,
        subjectCode: subject.code,
        startQuestion: m.start,
        endQuestion: m.end,
      };
    })
    .filter(Boolean);
}

export async function seedQuestionsForSession(
  sessionId: string,
): Promise<void> {
  const session = await AdmissionSession.findById(sessionId);
  if (!session) return;

  const mapping =
    session.questionMapping.length > 0
      ? session.questionMapping
      : await buildDefaultQuestionMapping(sessionId);

  if (session.questionMapping.length === 0) {
    session.questionMapping = mapping as typeof session.questionMapping;
    await session.save();
  }

  for (const entry of mapping) {
    if (!entry) continue;
    for (let q = entry.startQuestion; q <= entry.endQuestion; q++) {
      const exists = await Question.findOne({ sessionId, questionNumber: q });
      if (exists) continue;
      await Question.create({
        sessionId,
        subjectId: entry.subjectId,
        questionNumber: q,
        text: `Question ${q} (${entry.subjectCode}) — configure in question bank.`,
        maxMarks: entry.subjectCode === "ENG" ? 5 : 10,
        modelAnswer: `Model answer for question ${q}.`,
        rubric: `• Part A: marks\n• Part B: marks\n• Total: ${entry.subjectCode === "ENG" ? 5 : 10}`,
        keywords: ["keyword1", "keyword2"],
        difficulty: "MEDIUM",
      });
    }
  }
}
