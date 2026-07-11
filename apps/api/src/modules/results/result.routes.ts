import { Router, Response } from "express";
import { Types } from "mongoose";
import {
  authenticate,
  authorize,
  AuthRequest,
} from "../../middleware/auth.middleware";
import { asyncHandler } from "../../middleware/error-handler.middleware";
import {
  Answer,
  Assignment,
  Evaluation,
  Student as StudentModel,
  Subject,
  Result,
  Question,
  Adjudication,
  User,
} from "../../models";

const router = Router();

// async function syncResults(sessionId: string) {
//   const finalized = await Answer.find({
//     sessionId: new Types.ObjectId(sessionId),
//     status: "FINALIZED",
//     finalMark: { $exists: true },
//   });

//   for (const answer of finalized) {
//     const questions = await Question.find({
//       sessionId,
//       subjectId: answer.subjectId,
//     });
//     const totalMarks = questions.reduce((s, q) => s + q.maxMarks, 0);

//     await Result.findOneAndUpdate(
//       {
//         sessionId: answer.sessionId,
//         studentId: answer.studentId,
//         subjectId: answer.subjectId,
//       },
//       {
//         sCode: answer.sCode,
//         totalMarks,
//         obtainedMarks: answer.finalMark,
//       },
//       { upsert: true },
//     );
//   }
// }

interface ResultGroup {
  studentId: Types.ObjectId;
  subjectId: Types.ObjectId;
  sCode: string;
  sum: number;
}

async function syncResults(sessionId: string) {
  const finalized = await Answer.find({
    sessionId: new Types.ObjectId(sessionId),
    status: "FINALIZED",
    finalMark: { $exists: true },
  });

  const groups = new Map<string, ResultGroup>();

  for (const answer of finalized) {
    const key = `${answer.studentId}_${answer.subjectId}`;
    const g = groups.get(key) ?? {
      studentId: answer.studentId,
      subjectId: answer.subjectId,
      sCode: answer.sCode,
      sum: 0,
    };
    g.sum += answer.finalMark ?? 0;
    groups.set(key, g);
  }

  const totalsCache = new Map<string, number>();

  for (const g of groups.values()) {
    const subjectKey = g.subjectId.toString();
    let totalMarks = totalsCache.get(subjectKey);
    if (totalMarks === undefined) {
      const questions = await Question.find({
        sessionId,
        subjectId: g.subjectId,
      });
      totalMarks = questions.reduce((s, q) => s + q.maxMarks, 0);
      totalsCache.set(subjectKey, totalMarks);
    }

    await Result.findOneAndUpdate(
      {
        sessionId: new Types.ObjectId(sessionId),
        studentId: g.studentId,
        subjectId: g.subjectId,
      },
      {
        sCode: g.sCode,
        totalMarks,
        obtainedMarks: g.sum,
      },
      { upsert: true },
    );
  }
}

router.get(
  "/overview",
  authenticate,
  authorize("SUPER_ADMIN", "HEAD_EXAMINER"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const filter: Record<string, unknown> = {};
    if (req.query.sessionId)
      filter.sessionId = new Types.ObjectId(String(req.query.sessionId));

    const subjects = await Subject.find({ isActive: true });
    const [
      totalStudents,
      totalAnswers,
      finalized,
      escalated,
      pendingModeration,
      inProgress,
    ] = await Promise.all([
      StudentModel.countDocuments(filter),
      Answer.countDocuments(filter),
      Answer.countDocuments({ ...filter, status: "FINALIZED" }),
      Answer.countDocuments({ ...filter, status: "ESCALATED" }),
      Adjudication.countDocuments({ ...filter, status: "PENDING" }),
      Answer.countDocuments({
        ...filter,
        status: {
          $in: ["ASSIGNED", "PARTIALLY_EVALUATED", "AWAITING_RECONCILIATION"],
        },
      }),
    ]);

    const subjectBreakdown = await Promise.all(
      subjects.map(async (s) => {
        const [total, fin, esc] = await Promise.all([
          Answer.countDocuments({ ...filter, subjectId: s._id }),
          Answer.countDocuments({
            ...filter,
            subjectId: s._id,
            status: "FINALIZED",
          }),
          Answer.countDocuments({
            ...filter,
            subjectId: s._id,
            status: "ESCALATED",
          }),
        ]);
        return {
          subjectCode: s.code,
          subjectName: s.name,
          total,
          finalized: fin,
          escalated: esc,
        };
      }),
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
  }),
);

router.get(
  "/teacher-summary",
  authenticate,
  authorize("SUPER_ADMIN", "HEAD_EXAMINER"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const filter: Record<string, unknown> = {};
    if (req.query.sessionId) {
      filter.sessionId = new Types.ObjectId(String(req.query.sessionId));
    }

    const subjects = await Subject.find();
    const subjectMap = new Map(subjects.map((s) => [s._id.toString(), s.code]));

    const teachers = await User.find({ role: "TEACHER", isActive: true }).sort({
      name: 1,
    });

    const data = await Promise.all(
      teachers.map(async (teacher) => {
        const assignmentFilter: Record<string, unknown> = {
          teacherId: teacher._id,
        };
        if (filter.sessionId) assignmentFilter.sessionId = filter.sessionId;

        const [assigned, inProgress, submitted] = await Promise.all([
          Assignment.countDocuments(assignmentFilter),
          Assignment.countDocuments({
            ...assignmentFilter,
            status: "IN_PROGRESS",
          }),
          Assignment.countDocuments({
            ...assignmentFilter,
            status: "SUBMITTED",
          }),
        ]);

        const evaluationFilter: Record<string, unknown> = {
          teacherId: teacher._id,
        };
        if (filter.sessionId) evaluationFilter.sessionId = filter.sessionId;

        const evaluations = await Evaluation.find(evaluationFilter)
          .sort({ submittedAt: -1 })
          .limit(10)
          .lean();

        const answerIds = evaluations.map((e) => e.answerId);
        const answers = await Answer.find({ _id: { $in: answerIds } }).lean();
        const answerMap = new Map(answers.map((a) => [a._id.toString(), a]));

        const recentEvaluations = evaluations.map((evaluation) => {
          const answer = answerMap.get(evaluation.answerId.toString());
          return {
            answerId: evaluation.answerId.toString(),
            sCode: answer?.sCode ?? "",
            questionNumber: answer?.questionNumber ?? 0,
            subjectCode: answer
              ? (subjectMap.get(answer.subjectId.toString()) ?? "")
              : "",
            mark: evaluation.mark,
            submittedAt: evaluation.submittedAt?.toISOString() ?? "",
          };
        });

        return {
          teacherId: teacher._id.toString(),
          teacherName: teacher.name,
          employeeId: teacher.employeeId,
          subjectCodes: teacher.subjectIds
            .map((id) => subjectMap.get(id.toString()) ?? "")
            .filter(Boolean),
          assigned,
          inProgress,
          submitted,
          remaining: assigned - submitted,
          recentEvaluations,
        };
      }),
    );

    res.json({ success: true, data });
  }),
);

router.get(
  "/export/csv",
  authenticate,
  authorize("SUPER_ADMIN"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const sessionId = String(req.query.sessionId);
    await syncResults(sessionId);

    const results = await Result.find({
      sessionId: new Types.ObjectId(sessionId),
    });
    const students = await StudentModel.find({
      sessionId: new Types.ObjectId(sessionId),
    });
    const subjects = await Subject.find();

    const studentMap = new Map(students.map((s) => [s._id.toString(), s]));
    const subjectMap = new Map(subjects.map((s) => [s._id.toString(), s]));

    const rows = [
      "s_code,roll,name,subject_code,subject_name,total_marks,obtained_marks",
    ];
    for (const r of results) {
      const student = studentMap.get(r.studentId.toString());
      const subject = subjectMap.get(r.subjectId.toString());
      rows.push(
        [
          r.sCode,
          student?.roll ?? "",
          `"${student?.name ?? ""}"`,
          subject?.code ?? "",
          subject?.name ?? "",
          r.totalMarks,
          r.obtainedMarks,
        ].join(","),
      );
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=results.csv");
    res.send(rows.join("\n"));
  }),
);

router.get(
  "/merit-list",
  authenticate,
  authorize("SUPER_ADMIN"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const sessionId = String(req.query.sessionId);
    await syncResults(sessionId);

    const results = await Result.find({
      sessionId: new Types.ObjectId(sessionId),
    });
    const students = await StudentModel.find({
      sessionId: new Types.ObjectId(sessionId),
    });
    const studentMap = new Map(students.map((s) => [s._id.toString(), s]));

    const byStudent = new Map<
      string,
      { obtained: number; total: number; sCode: string }
    >();
    for (const r of results) {
      const key = r.studentId.toString();
      const cur = byStudent.get(key) ?? {
        obtained: 0,
        total: 0,
        sCode: r.sCode,
      };
      cur.obtained += r.obtainedMarks;
      cur.total += r.totalMarks;
      byStudent.set(key, cur);
    }

    const merit = Array.from(byStudent.entries())
      .map(([studentId, scores]) => {
        const student = studentMap.get(studentId);
        return {
          roll: student?.roll ?? "",
          name: student?.name ?? "",
          sCode: scores.sCode,
          totalObtained: scores.obtained,
          totalPossible: scores.total,
          percentage:
            scores.total > 0
              ? Math.round((scores.obtained / scores.total) * 10000) / 100
              : 0,
        };
      })
      .sort((a, b) => b.totalObtained - a.totalObtained);

    res.json({ success: true, data: merit });
  }),
);

router.post(
  "/publish",
  authenticate,
  authorize("SUPER_ADMIN", "HEAD_EXAMINER"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { sessionId } = req.body as { sessionId: string };
    await syncResults(sessionId);
    await Result.updateMany(
      { sessionId: new Types.ObjectId(sessionId) },
      { published: true, publishedAt: new Date() },
    );
    res.json({ success: true, data: { published: true } });
  }),
);

export default router;
