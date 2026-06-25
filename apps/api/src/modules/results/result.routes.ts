import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import {
  Answer,
  Student,
  Subject,
  Result,
  Question,
  Adjudication,
  Student as StudentModel,
} from '../../models';

const router = Router();

async function syncResults(sessionId: string) {
  const finalized = await Answer.find({
    sessionId: new Types.ObjectId(sessionId),
    status: 'FINALIZED',
    finalMark: { $exists: true },
  });

  for (const answer of finalized) {
    const questions = await Question.find({ sessionId, subjectId: answer.subjectId });
    const totalMarks = questions.reduce((s, q) => s + q.maxMarks, 0);

    await Result.findOneAndUpdate(
      {
        sessionId: answer.sessionId,
        studentId: answer.studentId,
        subjectId: answer.subjectId,
      },
      {
        sCode: answer.sCode,
        totalMarks,
        obtainedMarks: answer.finalMark,
      },
      { upsert: true }
    );
  }
}

router.get('/overview', authenticate, authorize('SUPER_ADMIN', 'HEAD_EXAMINER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (req.query.sessionId) filter.sessionId = new Types.ObjectId(String(req.query.sessionId));

  const subjects = await Subject.find({ isActive: true });
  const [totalStudents, totalAnswers, finalized, escalated, pendingModeration, inProgress] =
    await Promise.all([
      StudentModel.countDocuments(filter),
      Answer.countDocuments(filter),
      Answer.countDocuments({ ...filter, status: 'FINALIZED' }),
      Answer.countDocuments({ ...filter, status: 'ESCALATED' }),
      Adjudication.countDocuments({ ...filter, status: 'PENDING' }),
      Answer.countDocuments({
        ...filter,
        status: { $in: ['ASSIGNED', 'PARTIALLY_EVALUATED', 'AWAITING_RECONCILIATION'] },
      }),
    ]);

  const subjectBreakdown = await Promise.all(
    subjects.map(async (s) => {
      const [total, fin, esc] = await Promise.all([
        Answer.countDocuments({ ...filter, subjectId: s._id }),
        Answer.countDocuments({ ...filter, subjectId: s._id, status: 'FINALIZED' }),
        Answer.countDocuments({ ...filter, subjectId: s._id, status: 'ESCALATED' }),
      ]);
      return { subjectCode: s.code, subjectName: s.name, total, finalized: fin, escalated: esc };
    })
  );

  res.json({
    success: true,
    data: {
      totalStudents,
      totalAnswers,
      finalized,
      escalated,
      pendingModeration,
      inProgress,
      subjectBreakdown,
    },
  });
}));

router.get('/export/csv', authenticate, authorize('SUPER_ADMIN'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const sessionId = String(req.query.sessionId);
  await syncResults(sessionId);

  const results = await Result.find({ sessionId: new Types.ObjectId(sessionId) });
  const students = await Student.find({ sessionId: new Types.ObjectId(sessionId) });
  const subjects = await Subject.find();

  const studentMap = new Map(students.map((s) => [s._id.toString(), s]));
  const subjectMap = new Map(subjects.map((s) => [s._id.toString(), s]));

  const rows = ['s_code,roll,name,subject_code,subject_name,total_marks,obtained_marks'];
  for (const r of results) {
    const student = studentMap.get(r.studentId.toString());
    const subject = subjectMap.get(r.subjectId.toString());
    rows.push(
      [
        r.sCode,
        student?.roll ?? '',
        `"${student?.name ?? ''}"`,
        subject?.code ?? '',
        subject?.name ?? '',
        r.totalMarks,
        r.obtainedMarks,
      ].join(',')
    );
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=results.csv');
  res.send(rows.join('\n'));
}));

router.get('/merit-list', authenticate, authorize('SUPER_ADMIN'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const sessionId = String(req.query.sessionId);
  await syncResults(sessionId);

  const results = await Result.find({ sessionId: new Types.ObjectId(sessionId) });
  const students = await Student.find({ sessionId: new Types.ObjectId(sessionId) });
  const studentMap = new Map(students.map((s) => [s._id.toString(), s]));

  const byStudent = new Map<string, { obtained: number; total: number; sCode: string }>();
  for (const r of results) {
    const key = r.studentId.toString();
    const cur = byStudent.get(key) ?? { obtained: 0, total: 0, sCode: r.sCode };
    cur.obtained += r.obtainedMarks;
    cur.total += r.totalMarks;
    byStudent.set(key, cur);
  }

  const merit = Array.from(byStudent.entries())
    .map(([studentId, scores]) => {
      const student = studentMap.get(studentId);
      return {
        roll: student?.roll ?? '',
        name: student?.name ?? '',
        sCode: scores.sCode,
        totalObtained: scores.obtained,
        totalPossible: scores.total,
        percentage: scores.total > 0 ? Math.round((scores.obtained / scores.total) * 10000) / 100 : 0,
      };
    })
    .sort((a, b) => b.totalObtained - a.totalObtained);

  res.json({ success: true, data: merit });
}));

router.post('/publish', authenticate, authorize('SUPER_ADMIN', 'HEAD_EXAMINER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId } = req.body as { sessionId: string };
  await syncResults(sessionId);
  await Result.updateMany(
    { sessionId: new Types.ObjectId(sessionId) },
    { published: true, publishedAt: new Date() }
  );
  res.json({ success: true, data: { published: true } });
}));

export default router;
