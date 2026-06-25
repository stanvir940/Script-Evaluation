import { Router, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { createAuditLog } from '../../middleware/audit.middleware';
import { Assignment, Evaluation, Answer } from '../../models';
import {
  buildEvaluationWorkspace,
  getTeacherStats,
  reconcileAnswer,
} from '../../lib/reconciliation';

const router = Router();

const submitSchema = z.object({
  mark: z.number().min(0),
  comment: z.string().optional().default(''),
  timeSpentSeconds: z.number().optional(),
});

const draftSchema = z.object({
  mark: z.number().min(0).optional(),
  comment: z.string().optional(),
});

router.use(authenticate, authorize('TEACHER'));

router.get('/stats', async (req: AuthRequest, res: Response) => {
  const examCycleId = req.query.examCycleId as string | undefined;
  const stats = await getTeacherStats(req.user!.userId, examCycleId);
  res.json({ success: true, data: stats });
});

router.get('/queue', async (req: AuthRequest, res: Response) => {
  const assignments = await Assignment.find({
    teacherId: req.user!.userId,
    status: { $in: ['PENDING', 'IN_PROGRESS'] },
  })
    .sort({ createdAt: 1 })
    .limit(50)
    .populate({
      path: 'answerId',
      populate: { path: 'subjectId', select: 'code name' },
    });

  res.json({
    success: true,
    data: assignments.map((a) => ({
      id: a._id.toString(),
      status: a.status,
      answerId: a.answerId.toString(),
      subject: (a.answerId as unknown as { subjectId: { code: string; name: string } }).subjectId,
    })),
  });
});

router.get('/next', async (req: AuthRequest, res: Response) => {
  let assignment = await Assignment.findOne({
    teacherId: req.user!.userId,
    status: 'IN_PROGRESS',
  }).sort({ claimedAt: 1 });

  if (!assignment) {
    assignment = await Assignment.findOneAndUpdate(
      {
        teacherId: req.user!.userId,
        status: 'PENDING',
      },
      {
        status: 'IN_PROGRESS',
        claimedAt: new Date(),
        claimedUntil: new Date(Date.now() + 30 * 60 * 1000),
      },
      { sort: { createdAt: 1 }, new: true }
    );
  }

  if (!assignment) {
    res.json({ success: true, data: null });
    return;
  }

  const workspace = await buildEvaluationWorkspace(
    assignment._id.toString(),
    req.user!.userId
  );

  res.json({ success: true, data: workspace });
});

router.get('/assignments/:id/workspace', async (req: AuthRequest, res: Response) => {
  const workspace = await buildEvaluationWorkspace(String(req.params.id), req.user!.userId);
  if (!workspace) {
    res.status(404).json({ success: false, error: 'Assignment not found' });
    return;
  }
  res.json({ success: true, data: workspace });
});

router.post('/assignments/:id/save', validateBody(draftSchema), async (req: AuthRequest, res: Response) => {
  const assignment = await Assignment.findOne({
    _id: req.params.id,
    teacherId: req.user!.userId,
    status: { $in: ['PENDING', 'IN_PROGRESS'] },
  });

  if (!assignment) {
    res.status(404).json({ success: false, error: 'Assignment not found' });
    return;
  }

  if (req.body.mark !== undefined) assignment.draftMark = req.body.mark;
  if (req.body.comment !== undefined) assignment.draftComment = req.body.comment;
  assignment.status = 'IN_PROGRESS';
  assignment.claimedAt = new Date();
  await assignment.save();

  res.json({ success: true, data: { savedAt: new Date().toISOString() } });
});

router.post('/assignments/:id/submit', validateBody(submitSchema), async (req: AuthRequest, res: Response) => {
  const assignment = await Assignment.findOne({
    _id: req.params.id,
    teacherId: req.user!.userId,
    status: { $in: ['PENDING', 'IN_PROGRESS'] },
  });

  if (!assignment) {
    res.status(404).json({ success: false, error: 'Assignment not found' });
    return;
  }

  const answer = await Answer.findById(assignment.answerId);
  if (!answer) {
    res.status(404).json({ success: false, error: 'Answer not found' });
    return;
  }

  if (req.body.mark > answer.maxMarks) {
    res.status(422).json({
      success: false,
      error: `Mark cannot exceed ${answer.maxMarks}`,
    });
    return;
  }

  const existing = await Evaluation.findOne({ assignmentId: assignment._id });
  if (existing) {
    res.status(409).json({ success: false, error: 'Already submitted' });
    return;
  }

  const evaluation = await Evaluation.create({
    examCycleId: assignment.examCycleId,
    assignmentId: assignment._id,
    answerId: assignment.answerId,
    teacherId: assignment.teacherId,
    slot: assignment.slot,
    mark: req.body.mark,
    comment: req.body.comment,
    timeSpentSeconds: req.body.timeSpentSeconds,
  });

  assignment.status = 'SUBMITTED';
  assignment.submittedAt = new Date();
  assignment.draftMark = undefined;
  assignment.draftComment = undefined;
  await assignment.save();

  answer.evaluationCount += 1;
  if (answer.evaluationCount >= 3) {
    answer.status = 'AWAITING_RECONCILIATION';
  } else {
    answer.status = 'PARTIALLY_EVALUATED';
  }
  await answer.save();

  if (answer.evaluationCount >= 3) {
    await reconcileAnswer(answer._id);
  }

  await createAuditLog(
    req,
    'EVALUATION_SUBMITTED',
    'Evaluation',
    evaluation._id,
    undefined,
    { mark: req.body.mark, answerId: answer._id.toString() },
    assignment.examCycleId
  );

  const nextAssignment = await Assignment.findOneAndUpdate(
    {
      teacherId: req.user!.userId,
      status: 'PENDING',
    },
    {
      status: 'IN_PROGRESS',
      claimedAt: new Date(),
      claimedUntil: new Date(Date.now() + 30 * 60 * 1000),
    },
    { sort: { createdAt: 1 }, new: true }
  );

  let nextWorkspace = null;
  if (nextAssignment) {
    nextWorkspace = await buildEvaluationWorkspace(
      nextAssignment._id.toString(),
      req.user!.userId
    );
  }

  res.json({ success: true, data: { submitted: true, next: nextWorkspace } });
});

router.get('/history', async (req: AuthRequest, res: Response) => {
  const evaluations = await Evaluation.find({ teacherId: req.user!.userId })
    .sort({ submittedAt: -1 })
    .limit(20)
    .populate({
      path: 'answerId',
      populate: { path: 'subjectId', select: 'code name' },
    });

  res.json({
    success: true,
    data: evaluations.map((e) => ({
      id: e._id.toString(),
      mark: e.mark,
      comment: e.comment,
      submittedAt: e.submittedAt,
      answerId: e.answerId.toString(),
    })),
  });
});

export default router;
