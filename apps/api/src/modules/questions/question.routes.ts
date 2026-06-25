import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { Question } from '../../models';

const router = Router();

const createSchema = z.object({
  sessionId: z.string(),
  subjectId: z.string(),
  questionNumber: z.number().int().min(1),
  text: z.string().min(1),
  maxMarks: z.number().min(0),
  modelAnswer: z.string().min(1),
  rubric: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
});

router.get('/', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;
  if (req.query.subjectId) filter.subjectId = req.query.subjectId;
  const questions = await Question.find(filter).sort({ questionNumber: 1 });
  res.json({
    success: true,
    data: questions.map((q) => ({
      id: q._id.toString(),
      sessionId: q.sessionId.toString(),
      subjectId: q.subjectId.toString(),
      questionNumber: q.questionNumber,
      text: q.text,
      maxMarks: q.maxMarks,
      modelAnswer: q.modelAnswer,
      rubric: q.rubric,
      keywords: q.keywords,
      difficulty: q.difficulty,
    })),
  });
}));

router.post('/', authenticate, authorize('SUPER_ADMIN'), validateBody(createSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const q = await Question.create(req.body);
  res.status(201).json({
    success: true,
    data: { id: q._id.toString(), questionNumber: q.questionNumber },
  });
}));

export default router;
