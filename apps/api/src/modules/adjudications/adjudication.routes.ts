import { Router, Response } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { ModerationCaseDto, AnnotationAction } from "@dasems/shared-types";
import {
  authenticate,
  authorize,
  AuthRequest,
} from "../../middleware/auth.middleware";
import { validateBody } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../middleware/error-handler.middleware";
import { writeAuditFromRequest } from "../../lib/audit";
import {
  Adjudication,
  Answer,
  Question,
  Subject,
  Evaluation,
  AnnotationLayer,
  User,
  AdmissionSession,
} from "../../models";
import { upsertResultForAnswer } from "../../lib/results";

const router = Router();
router.use(authenticate, authorize("HEAD_EXAMINER", "SUPER_ADMIN"));

async function buildModerationCase(
  adjudicationId: string,
): Promise<ModerationCaseDto | null> {
  const adjudication = await Adjudication.findById(adjudicationId);
  if (!adjudication) return null;

  const answer = await Answer.findById(adjudication.answerId);
  if (!answer) return null;

  const [subject, question, session, evaluations] = await Promise.all([
    Subject.findById(answer.subjectId),
    Question.findById(answer.questionId),
    AdmissionSession.findById(answer.sessionId),
    Evaluation.find({ _id: { $in: adjudication.evaluationIds } }),
  ]);

  if (!subject || !question) return null;

  const evalDetails = await Promise.all(
    evaluations.map(async (ev) => {
      const teacher = await User.findById(ev.teacherId);
      const layer = await AnnotationLayer.findOne({
        answerId: answer._id,
        teacherId: ev.teacherId,
      });
      const annotations: AnnotationAction[] = (layer?.actions ?? []).map(
        (a) => ({
          id: a.id,
          tool: a.tool,
          points: a.points,
          color: a.color,
          strokeWidth: a.strokeWidth,
          text: a.text,
          timestamp: a.timestamp.toISOString(),
        }),
      );
      return {
        teacherId: ev.teacherId.toString(),
        teacherName: teacher?.name ?? "Unknown",
        mark: ev.mark,
        comment: ev.comment,
        annotations,
      };
    }),
  );

  return {
    id: adjudication._id.toString(),
    answerId: answer._id.toString(),
    sCode: answer.sCode,
    questionNumber: answer.questionNumber,
    subject: { code: subject.code, name: subject.name },
    maxMarks: answer.maxMarks,
    questionText: question.text,
    rubric: question.rubric,
    modelAnswer: question.modelAnswer,
    keywords: question.keywords,
    answerImageUrl: answer.imageUrl,
    markSpread: adjudication.markSpread,
    threshold: session?.moderationThreshold ?? 3,
    evaluations: evalDetails,
  };
}

const decideSchema = z.object({
  finalMark: z.number().min(0),
  rationale: z.string().min(1),
});

router.get(
  "/stats",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const filter: Record<string, unknown> = {};
    if (req.query.sessionId)
      filter.sessionId = new Types.ObjectId(String(req.query.sessionId));
    const [pending, completed] = await Promise.all([
      Adjudication.countDocuments({ ...filter, status: "PENDING" }),
      Adjudication.countDocuments({ ...filter, status: "COMPLETED" }),
    ]);
    res.json({ success: true, data: { pending, completed } });
  }),
);

router.get(
  "/next",
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const adj = await Adjudication.findOne({ status: "PENDING" }).sort({
      createdAt: 1,
    });
    if (!adj) {
      res.json({ success: true, data: null });
      return;
    }
    const caseData = await buildModerationCase(adj._id.toString());
    res.json({ success: true, data: caseData });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const caseData = await buildModerationCase(String(req.params.id));
    if (!caseData) {
      res.status(404).json({ success: false, error: "Case not found" });
      return;
    }
    res.json({ success: true, data: caseData });
  }),
);

router.post(
  "/:id/decide",
  validateBody(decideSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const adjudication = await Adjudication.findById(String(req.params.id));
    if (!adjudication || adjudication.status !== "PENDING") {
      res.status(404).json({ success: false, error: "Case not found" });
      return;
    }

    const answer = await Answer.findById(adjudication.answerId);
    if (!answer) {
      res.status(404).json({ success: false, error: "Answer not found" });
      return;
    }
    if (req.body.finalMark > answer.maxMarks) {
      res
        .status(422)
        .json({
          success: false,
          error: `Mark cannot exceed ${answer.maxMarks}`,
        });
      return;
    }

    adjudication.finalMark = req.body.finalMark;
    adjudication.rationale = req.body.rationale;
    adjudication.status = "COMPLETED";
    adjudication.headExaminerId = new Types.ObjectId(req.user!.userId);
    adjudication.reviewedAt = new Date();
    await adjudication.save();

    answer.status = "FINALIZED";
    answer.finalMark = req.body.finalMark;
    answer.finalizationMethod = "HEAD_ADJUDICATION";
    answer.finalizedAt = new Date();
    answer.finalizedBy = new Types.ObjectId(req.user!.userId);
    await answer.save();

    // Persist/update result summary for this finalized answer
    await upsertResultForAnswer(answer._id);

    await writeAuditFromRequest(
      req,
      "ADJUDICATION_COMPLETED",
      "Adjudication",
      adjudication._id.toString(),
    );

    const nextAdj = await Adjudication.findOne({ status: "PENDING" }).sort({
      createdAt: 1,
    });
    const next = nextAdj
      ? await buildModerationCase(nextAdj._id.toString())
      : null;
    res.json({ success: true, data: { finalized: true, next } });
  }),
);

export default router;
