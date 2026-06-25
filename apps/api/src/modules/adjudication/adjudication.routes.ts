import { Router, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { createAuditLog } from '../../middleware/audit.middleware';
import { Adjudication, Answer } from '../../models';
import { buildAdjudicationCase } from '../../lib/reconciliation';

const router = Router();

const decideSchema = z.object({
  finalMark: z.number().min(0),
  rationale: z.string().min(1),
});

router.use(authenticate, authorize('HEAD_EXAMINER', 'SUPER_ADMIN'));

router.get('/stats', async (req: AuthRequest, res: Response) => {
  const examCycleId = req.query.examCycleId as string | undefined;
  const filter: Record<string, unknown> = {};
  if (examCycleId) filter.examCycleId = new Types.ObjectId(examCycleId);

  const [pending, completed] = await Promise.all([
    Adjudication.countDocuments({ ...filter, status: 'PENDING' }),
    Adjudication.countDocuments({ ...filter, status: 'COMPLETED' }),
  ]);

  res.json({ success: true, data: { pending, completed } });
});

router.get('/queue', async (req: AuthRequest, res: Response) => {
  const cases = await Adjudication.find({ status: 'PENDING' })
    .sort({ createdAt: 1 })
    .limit(50);

  res.json({
    success: true,
    data: cases.map((c) => ({
      id: c._id.toString(),
      answerId: c.answerId.toString(),
      markSpread: c.markSpread,
      createdAt: c.createdAt,
    })),
  });
});

router.get('/next', async (req: AuthRequest, res: Response) => {
  const adjudication = await Adjudication.findOne({ status: 'PENDING' }).sort({ createdAt: 1 });
  if (!adjudication) {
    res.json({ success: true, data: null });
    return;
  }

  const caseData = await buildAdjudicationCase(adjudication._id.toString());
  res.json({ success: true, data: caseData });
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const caseData = await buildAdjudicationCase(String(req.params.id));
  if (!caseData) {
    res.status(404).json({ success: false, error: 'Case not found' });
    return;
  }
  res.json({ success: true, data: caseData });
});

router.post('/:id/decide', validateBody(decideSchema), async (req: AuthRequest, res: Response) => {
  const adjudication = await Adjudication.findById(req.params.id);
  if (!adjudication || adjudication.status !== 'PENDING') {
    res.status(404).json({ success: false, error: 'Case not found or already decided' });
    return;
  }

  const answer = await Answer.findById(adjudication.answerId);
  if (!answer) {
    res.status(404).json({ success: false, error: 'Answer not found' });
    return;
  }

  if (req.body.finalMark > answer.maxMarks) {
    res.status(422).json({
      success: false,
      error: `Mark cannot exceed ${answer.maxMarks}`,
    });
    return;
  }

  adjudication.finalMark = req.body.finalMark;
  adjudication.rationale = req.body.rationale;
  adjudication.status = 'COMPLETED';
  adjudication.headExaminerId = new Types.ObjectId(req.user!.userId);
  adjudication.reviewedAt = new Date();
  await adjudication.save();

  answer.status = 'FINALIZED';
  answer.finalMark = req.body.finalMark;
  answer.finalizationMethod = 'HEAD_ADJUDICATION';
  answer.finalizedAt = new Date();
  answer.finalizedBy = new Types.ObjectId(req.user!.userId);
  await answer.save();

  await createAuditLog(
    req,
    'ADJUDICATION_COMPLETED',
    'Adjudication',
    adjudication._id,
    { markSpread: adjudication.markSpread },
    { finalMark: req.body.finalMark, rationale: req.body.rationale },
    adjudication.examCycleId
  );

  const next = await Adjudication.findOne({ status: 'PENDING' }).sort({ createdAt: 1 });
  let nextCase = null;
  if (next) {
    nextCase = await buildAdjudicationCase(next._id.toString());
  }

  res.json({ success: true, data: { finalized: true, next: nextCase } });
});

export default router;
