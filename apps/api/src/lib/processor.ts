import { Types } from 'mongoose';
import {
  Question,
  Answer,
  Script,
  Student,
  AdmissionSession,
  Subject,
} from '../models';
import { saveProcessedImage } from './storage';
import { assignAllUnassigned } from './reconciliation';
import { config } from '../config';

interface ProcessedCrop {
  questionNumber: number;
  pageNumber: number;
  imageBuffer: Buffer;
  boundingBox: { x: number; y: number; width: number; height: number };
  resolution: { width: number; height: number };
}

async function callPythonProcessor(
  pdfPath: string,
  questionNumbers: number[]
): Promise<ProcessedCrop[]> {
  try {
    const res = await fetch(`${config.processorUrl}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfPath, questionNumbers }),
    });
    if (!res.ok) throw new Error('Processor failed');
    const data = (await res.json()) as {
      crops: Array<{
        questionNumber: number;
        pageNumber: number;
        imageBase64: string;
        boundingBox: { x: number; y: number; width: number; height: number };
        resolution: { width: number; height: number };
      }>;
    };
    return data.crops.map((c) => ({
      questionNumber: c.questionNumber,
      pageNumber: c.pageNumber,
      imageBuffer: Buffer.from(c.imageBase64, 'base64'),
      boundingBox: c.boundingBox,
      resolution: c.resolution,
    }));
  } catch {
    return generatePlaceholderCrops(questionNumbers);
  }
}

function generatePlaceholderCrops(questionNumbers: number[]): ProcessedCrop[] {
  const svg = (q: number) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
        <rect width="800" height="400" fill="#fff"/>
        <rect x="20" y="20" width="760" height="360" fill="#f5f5f5" stroke="#ccc"/>
        <text x="400" y="200" text-anchor="middle" font-size="24" fill="#333">Answer Q${q}</text>
      </svg>`
    );

  return questionNumbers.map((q) => ({
    questionNumber: q,
    pageNumber: Math.ceil(q / 10),
    imageBuffer: svg(q),
    boundingBox: { x: 0, y: 0, width: 800, height: 400 },
    resolution: { width: 800, height: 400 },
  }));
}

export async function processScript(scriptId: string): Promise<void> {
  const script = await Script.findById(scriptId);
  if (!script) return;

  const [student, session, questions] = await Promise.all([
    Student.findById(script.studentId),
    AdmissionSession.findById(script.sessionId),
    Question.find({ sessionId: script.sessionId }).sort({ questionNumber: 1 }),
  ]);

  if (!student || !session) return;

  script.processingStatus = 'PROCESSING';
  await script.save();
  student.processingStatus = 'PROCESSING';
  await student.save();

  try {
    const pdfPath = `${process.cwd()}/${config.uploadsDir}/${script.originalPdfKey}`;
    const questionNumbers = questions.map((q) => q.questionNumber);
    const crops = await callPythonProcessor(pdfPath, questionNumbers);

    for (const question of questions) {
      const crop = crops.find((c) => c.questionNumber === question.questionNumber);
      if (!crop) continue;

      const stored = await saveProcessedImage(
        script.sessionId.toString(),
        student.sCode,
        question.questionNumber,
        crop.imageBuffer
      );

      await Answer.findOneAndUpdate(
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
          ocrStatus: 'SKIPPED',
          processingStatus: 'READY',
          status: 'UNASSIGNED',
        },
        { upsert: true, new: true }
      );
    }

    script.processingStatus = 'READY';
    script.pageCount = Math.max(...crops.map((c) => c.pageNumber), 1);
    student.processingStatus = 'READY';
    await script.save();
    await student.save();

    await assignAllUnassigned(script.sessionId.toString());
  } catch (err) {
    script.processingStatus = 'FAILED';
    script.processingError = err instanceof Error ? err.message : 'Processing failed';
    student.processingStatus = 'FAILED';
    await script.save();
    await student.save();
  }
}

export async function buildDefaultQuestionMapping(sessionId: string) {
  const subjects = await Subject.find({ isActive: true }).sort({ code: 1 });
  const mapping = [
    { subjectCode: 'PHY', start: 1, end: 10 },
    { subjectCode: 'CHE', start: 11, end: 20 },
    { subjectCode: 'MAT', start: 21, end: 30 },
    { subjectCode: 'ENG', start: 31, end: 35 },
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

export async function seedQuestionsForSession(sessionId: string): Promise<void> {
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
        maxMarks: entry.subjectCode === 'ENG' ? 5 : 10,
        modelAnswer: `Model answer for question ${q}.`,
        rubric: `• Part A: marks\n• Part B: marks\n• Total: ${entry.subjectCode === 'ENG' ? 5 : 10}`,
        keywords: ['keyword1', 'keyword2'],
        difficulty: 'MEDIUM',
      });
    }
  }
}
