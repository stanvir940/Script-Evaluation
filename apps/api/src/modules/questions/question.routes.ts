import { Router, Response } from "express";
import { z } from "zod";
import {
  authenticate,
  authorize,
  AuthRequest,
} from "../../middleware/auth.middleware";
import { validateBody } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../middleware/error-handler.middleware";
import { Question } from "../../models";

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
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
});

const bulkCreateSchema = z.object({
  sessionId: z.string(),
  questions: z
    .array(
      z.object({
        questionNumber: z.number().int().min(1),
        text: z.string().min(1),
        maxMarks: z.number().min(0),
        modelAnswer: z.string().min(1),
        rubric: z.string().min(1),
        keywords: z.array(z.string()).default([]),
        difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
      }),
    )
    .min(1),
});

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
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
  }),
);

router.post(
  "/",
  authenticate,
  authorize("SUPER_ADMIN"),
  validateBody(createSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const q = await Question.create(req.body);
    res.status(201).json({
      success: true,
      data: { id: q._id.toString(), questionNumber: q.questionNumber },
    });
  }),
);

router.post(
  "/bulk",
  authenticate,
  authorize("SUPER_ADMIN"),
  validateBody(bulkCreateSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { sessionId, questions } = req.body;
    const { Subject } = await import("../../models");
    const created = [] as Array<{ questionNumber: number }>;

    // Get all subjects to map to questions by subject code
    const subjects = await Subject.find({ isActive: true }).sort({ code: 1 });
    if (subjects.length === 0) {
      res.status(400).json({
        success: false,
        error:
          "No active subjects found - please create departments and subjects first",
      });
      return;
    }

    // Map question numbers to subjects (1-10 PHY, 11-20 CHE, 21-30 MAT, 31-35 ENG)
    const getSubjectForQuestion = (qNum: number) => {
      if (qNum >= 1 && qNum <= 10)
        return subjects.find((s) => s.code === "PHY") || subjects[0];
      if (qNum >= 11 && qNum <= 20)
        return (
          subjects.find((s) => s.code === "CHE") || subjects[1] || subjects[0]
        );
      if (qNum >= 21 && qNum <= 30)
        return (
          subjects.find((s) => s.code === "MAT") || subjects[2] || subjects[0]
        );
      if (qNum >= 31 && qNum <= 35)
        return (
          subjects.find((s) => s.code === "ENG") || subjects[3] || subjects[0]
        );
      return subjects[0];
    };

    for (const item of questions) {
      const existing = await Question.findOne({
        sessionId,
        questionNumber: item.questionNumber,
      });
      const subject = getSubjectForQuestion(item.questionNumber);

      if (existing) {
        existing.text = item.text;
        existing.maxMarks = item.maxMarks;
        existing.modelAnswer = item.modelAnswer;
        existing.rubric = item.rubric;
        existing.keywords = item.keywords;
        existing.difficulty = item.difficulty;
        existing.subjectId = subject._id;
        await existing.save();
        created.push({ questionNumber: item.questionNumber });
        continue;
      }

      const question = await Question.create({
        sessionId,
        subjectId: subject._id,
        questionNumber: item.questionNumber,
        text: item.text,
        maxMarks: item.maxMarks,
        modelAnswer: item.modelAnswer,
        rubric: item.rubric,
        keywords: item.keywords,
        difficulty: item.difficulty,
      });
      created.push({ questionNumber: question.questionNumber });
    }

    res.status(201).json({
      success: true,
      data: { imported: created.length, questions: created },
    });
  }),
);

export default router;
