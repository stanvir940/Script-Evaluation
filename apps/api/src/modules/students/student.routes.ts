import { Router, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { writeAuditFromRequest } from '../../lib/audit';
import { Student, Script } from '../../models';
import { generateSCode, getNextSCodeSequence } from '../../lib/s-code';
import { savePdf } from '../../lib/storage';
import { processScript } from '../../lib/processor';
import { seedQuestionsForSession } from '../../lib/processor';

const router = Router();

const createStudentSchema = z.object({
  sessionId: z.string(),
  roll: z.string(),
  name: z.string(),
  faculty: z.string(),
  departmentId: z.string(),
});

router.get('/', authenticate, authorize('SUPER_ADMIN'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;
  const students = await Student.find(filter).sort({ roll: 1 });
  res.json({
    success: true,
    data: students.map((s) => ({
      id: s._id.toString(),
      sessionId: s.sessionId.toString(),
      roll: s.roll,
      name: s.name,
      faculty: s.faculty,
      departmentId: s.departmentId.toString(),
      sCode: s.sCode,
      processingStatus: s.processingStatus,
    })),
  });
}));

router.post('/', authenticate, authorize('SUPER_ADMIN'), validateBody(createStudentSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const seq = await getNextSCodeSequence(req.body.sessionId);
  const sCode = await generateSCode(req.body.sessionId, seq);
  const student = await Student.create({ ...req.body, sCode });
  await writeAuditFromRequest(req, 'STUDENT_CREATED', 'Student', student._id.toString(), undefined, { sCode });
  res.status(201).json({ success: true, data: { id: student._id.toString(), sCode } });
}));

router.post('/bulk', authenticate, authorize('SUPER_ADMIN'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId, students } = req.body as {
    sessionId: string;
    students: Array<{ roll: string; name: string; faculty: string; departmentId: string }>;
  };
  await seedQuestionsForSession(sessionId);
  const created = [];
  for (const row of students) {
    const seq = await getNextSCodeSequence(sessionId);
    const sCode = await generateSCode(sessionId, seq);
    const student = await Student.create({ sessionId, ...row, sCode });
    created.push({ id: student._id.toString(), roll: student.roll, sCode });
  }
  res.status(201).json({ success: true, data: created });
}));

router.post('/:id/upload-pdf', authenticate, authorize('SUPER_ADMIN'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await Student.findById(req.params.id);
  if (!student) {
    res.status(404).json({ success: false, error: 'Student not found' });
    return;
  }

  const { pdfBase64, filename } = req.body as { pdfBase64: string; filename: string };
  if (!pdfBase64) {
    res.status(422).json({ success: false, error: 'pdfBase64 required' });
    return;
  }

  const buffer = Buffer.from(pdfBase64, 'base64');
  const stored = await savePdf(student.sessionId.toString(), buffer, filename || 'script.pdf');

  const script = await Script.findOneAndUpdate(
    { studentId: student._id },
    {
      sessionId: student.sessionId,
      studentId: student._id,
      sCode: student.sCode,
      originalPdfKey: stored.key,
      originalPdfUrl: stored.url,
      processingStatus: 'QUEUED',
    },
    { upsert: true, new: true }
  );

  student.processingStatus = 'QUEUED';
  await student.save();

  processScript(script._id.toString()).catch(console.error);

  res.json({ success: true, data: { scriptId: script._id.toString(), status: 'QUEUED' } });
}));

export default router;
