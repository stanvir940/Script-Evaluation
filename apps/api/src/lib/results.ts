import { Types } from "mongoose";
import { Answer, Question, Result } from "../models";

export async function upsertResultForAnswer(answerId: Types.ObjectId) {
  const answer = await Answer.findById(answerId);
  if (!answer) return;

  const questions = await Question.find({
    sessionId: answer.sessionId,
    subjectId: answer.subjectId,
  });
  const totalMarks = questions.reduce((s, q) => s + (q.maxMarks || 0), 0);

  // Incrementally accumulate obtainedMarks per student+subject using answer.finalMark
  await Result.findOneAndUpdate(
    {
      sessionId: answer.sessionId,
      studentId: answer.studentId,
      subjectId: answer.subjectId,
    },
    {
      sCode: answer.sCode,
      totalMarks,
      $inc: { obtainedMarks: answer.finalMark ?? 0 },
    },
    { upsert: true, new: true },
  );
}

export default upsertResultForAnswer;
