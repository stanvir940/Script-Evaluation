import { Router, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { writeAuditFromRequest } from '../../lib/audit';
import { Assignment, Evaluation, Answer, AnnotationLayer } from '../../models';
import { buildEvaluationWorkspace, getTeacherStats } from '../../lib/workspace';
import { reconcileAnswer } from '../../lib/reconciliation';

const router = Router();
router.use(authenticate, authorize('TEACHER'));

const submitSchema = z.object({
  mark: z.number().min(0),
  comment: z.string().optional().default(''),
  timeSpentSeconds: z.number().optional(),
});

const draftSchema = z.object({
  mark: z.number().min(0).optional(),
  comment: z.string().optional(),
});

const annotationSchema = z.object({
  actions: z.array(
    z.object({
      id: z.string(),
      tool: z.string(),
      points: z.array(z.number()),
      color: z.string(),
      strokeWidth: z.number(),
      text: z.string().optional(),
      timestamp: z.string(),
    })
  ),
});

router.get('/stats', asyncHandler(async (req: AuthRequest, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  const stats = await getTeacherStats(req.user!.userId, sessionId);
  res.json({ success: true, data: stats });
}));

router.get('/next', asyncHandler(async (req: AuthRequest, res: Response) => {
  let assignment = await Assignment.findOne({
    teacherId: req.user!.userId,
    status: 'IN_PROGRESS',
  }).sort({ claimedAt: 1 });

  if (!assignment) {
    assignment = await Assignment.findOneAndUpdate(
      { teacherId: req.user!.userId, status: 'PENDING' },
      { status: 'IN_PROGRESS', claimedAt: new Date() },
      { sort: { createdAt: 1 }, new: true }
    );
  }

  if (!assignment) {
    res.json({ success: true, data: null });
    return;
  }

  const workspace = await buildEvaluationWorkspace(assignment._id.toString(), req.user!.userId);
  res.json({ success: true, data: workspace });
}));

router.post('/assignments/:id/save', validateBody(draftSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const assignment = await Assignment.findOne({
    _id: String(req.params.id),
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
  await assignment.save();
  res.json({ success: true, data: { savedAt: new Date().toISOString() } });
}));

router.post('/assignments/:id/annotations', validateBody(annotationSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const assignment = await Assignment.findOne({
    _id: String(req.params.id),
    teacherId: req.user!.userId,
  });
  if (!assignment) {
    res.status(404).json({ success: false, error: 'Assignment not found' });
    return;
  }

  const actions = req.body.actions.map((a: { timestamp: string }) => ({
    ...a,
    timestamp: new Date(a.timestamp),
  }));

  await AnnotationLayer.findOneAndUpdate(
    { answerId: assignment.answerId, teacherId: assignment.teacherId },
    {
      sessionId: assignment.sessionId,
      answerId: assignment.answerId,
      teacherId: assignment.teacherId,
      actions,
      $inc: { version: 1 },
    },
    { upsert: true, new: true }
  );

  await writeAuditFromRequest(req, 'ANNOTATION_SAVED', 'AnnotationLayer', assignment.answerId.toString());
  res.json({ success: true, data: { saved: true } });
}));

router.post('/assignments/:id/submit', validateBody(submitSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const assignment = await Assignment.findOne({
    _id: String(req.params.id),
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
    res.status(422).json({ success: false, error: `Mark cannot exceed ${answer.maxMarks}` });
    return;
  }

  const existing = await Evaluation.findOne({ assignmentId: assignment._id });
  if (existing) {
    res.status(409).json({ success: false, error: 'Already submitted' });
    return;
  }

  const evaluation = await Evaluation.create({
    sessionId: assignment.sessionId,
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
  answer.status = answer.evaluationCount >= 3 ? 'AWAITING_RECONCILIATION' : 'PARTIALLY_EVALUATED';
  await answer.save();

  if (answer.evaluationCount >= 3) {
    await reconcileAnswer(answer._id);
  }

  await writeAuditFromRequest(req, 'EVALUATION_SUBMITTED', 'Evaluation', evaluation._id.toString(), undefined, {
    mark: req.body.mark,
    sCode: answer.sCode,
  });

  const nextAssignment = await Assignment.findOneAndUpdate(
    { teacherId: req.user!.userId, status: 'PENDING' },
    { status: 'IN_PROGRESS', claimedAt: new Date() },
    { sort: { createdAt: 1 }, new: true }
  );

  const next = nextAssignment
    ? await buildEvaluationWorkspace(nextAssignment._id.toString(), req.user!.userId)
    : null;

  res.json({ success: true, data: { submitted: true, next } });
}));

export default router;
