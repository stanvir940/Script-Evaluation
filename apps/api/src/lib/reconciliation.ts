import { Types } from "mongoose";
import {
  Answer,
  Assignment,
  Evaluation,
  Adjudication,
  AdmissionSession,
  User,
} from "../models";
import { upsertResultForAnswer } from "./results";

export async function reconcileAnswer(answerId: Types.ObjectId): Promise<void> {
  const evaluations = await Evaluation.find({ answerId }).sort({ slot: 1 });
  if (evaluations.length < 3) return;

  const marks = evaluations.map((e) => e.mark);
  const spread = Math.max(...marks) - Math.min(...marks);
  const answer = await Answer.findById(answerId);
  if (!answer) return;

  const session = await AdmissionSession.findById(answer.sessionId);
  const threshold = session?.moderationThreshold ?? 3;

  if (spread > threshold) {
    answer.status = "ESCALATED";
    answer.finalMark = undefined;
    answer.finalizationMethod = undefined;
    await answer.save();

    await Adjudication.findOneAndUpdate(
      { answerId },
      {
        sessionId: answer.sessionId,
        answerId,
        evaluationIds: evaluations.map((e) => e._id),
        markSpread: spread,
        status: "PENDING",
      },
      { upsert: true, new: true },
    );
  } else {
    const average = marks.reduce((a, b) => a + b, 0) / marks.length;
    answer.status = "FINALIZED";
    answer.finalMark = Math.round(average * 100) / 100;
    answer.finalizationMethod = "AVERAGE";
    answer.finalizedAt = new Date();
    await answer.save();
    // Persist/update result summary for this finalized answer
    await upsertResultForAnswer(answer._id);
  }
}

export async function assignTeachersToAnswer(
  answerId: Types.ObjectId,
  sessionId: Types.ObjectId,
  subjectId: Types.ObjectId,
): Promise<void> {
  const teachers = await User.find({
    role: "TEACHER",
    isActive: true,
    subjectIds: subjectId,
  });

  if (teachers.length === 0) {
    console.warn(
      `No active teachers found for subject ${subjectId.toString()}`,
    );
    return;
  }

  const workloads = await Promise.all(
    teachers.map(async (t) => ({
      teacher: t,
      count: await Assignment.countDocuments({
        teacherId: t._id,
        status: { $ne: "SUBMITTED" },
      }),
    })),
  );

  workloads.sort((a, b) => a.count - b.count);
  const selectedTeachers = workloads
    .slice(0, Math.min(3, workloads.length))
    .map((w) => w.teacher);

  if (selectedTeachers.length === 0) {
    console.warn(
      `No assignments created for answer ${answerId.toString()} because no teachers are available.`,
    );
    return;
  }

  for (let slot = 0; slot < selectedTeachers.length; slot++) {
    await Assignment.create({
      sessionId,
      answerId,
      teacherId: selectedTeachers[slot]._id,
      slot: slot + 1,
      status: "PENDING",
    });
  }

  await Answer.findByIdAndUpdate(answerId, { status: "ASSIGNED" });
}

export async function assignAllUnassigned(sessionId: string): Promise<number> {
  const answers = await Answer.find({
    sessionId: new Types.ObjectId(sessionId),
    status: "UNASSIGNED",
  });

  for (const answer of answers) {
    const existing = await Assignment.countDocuments({ answerId: answer._id });
    if (existing === 0) {
      await assignTeachersToAnswer(
        answer._id,
        answer.sessionId,
        answer.subjectId,
      );
    }
  }

  return answers.length;
}
