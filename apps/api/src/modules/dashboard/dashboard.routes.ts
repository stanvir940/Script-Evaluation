import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.middleware';
import { getDashboardOverview } from '../../lib/reconciliation';
import { ExamCycle, Subject, Answer } from '../../models';
import { Types } from 'mongoose';

const router = Router();

router.use(authenticate);

router.get('/overview', authorize('SUPER_ADMIN', 'HEAD_EXAMINER'), async (req: AuthRequest, res: Response) => {
  const examCycleId = req.query.examCycleId as string | undefined;
  const overview = await getDashboardOverview(examCycleId);
  res.json({ success: true, data: overview });
});

router.get('/subjects', authorize('SUPER_ADMIN', 'HEAD_EXAMINER'), async (req: AuthRequest, res: Response) => {
  const examCycleId = req.query.examCycleId as string | undefined;
  const subjects = await Subject.find({ isActive: true });

  const filter: Record<string, unknown> = {};
  if (examCycleId) filter.examCycleId = new Types.ObjectId(examCycleId);

  const subjectStats = await Promise.all(
    subjects.map(async (subject) => {
      const [total, finalized, escalated] = await Promise.all([
        Answer.countDocuments({ ...filter, subjectId: subject._id }),
        Answer.countDocuments({ ...filter, subjectId: subject._id, status: 'FINALIZED' }),
        Answer.countDocuments({ ...filter, subjectId: subject._id, status: 'ESCALATED' }),
      ]);
      return {
        id: subject._id.toString(),
        code: subject.code,
        name: subject.name,
        total,
        finalized,
        escalated,
        pending: total - finalized,
      };
    })
  );

  res.json({ success: true, data: subjectStats });
});

router.get('/exam-cycles', async (_req: AuthRequest, res: Response) => {
  const cycles = await ExamCycle.find().sort({ year: -1 });
  res.json({
    success: true,
    data: cycles.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      year: c.year,
      status: c.status,
      escalationThreshold: c.escalationThreshold,
    })),
  });
});

export default router;
