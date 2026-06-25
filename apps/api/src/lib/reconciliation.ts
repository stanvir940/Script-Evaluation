import { Types } from 'mongoose';
import {
  Answer,
  Assignment,
  Evaluation,
  Adjudication,
  QuestionPaper,
  Script,
  Subject,
  ExamCycle,
} from '../models';
import { config } from '../config';

export async function reconcileAnswer(answerId: Types.ObjectId): Promise<void> {
  const evaluations = await Evaluation.find({ answerId }).sort({ slot: 1 });
  if (evaluations.length < 3) return;

  const marks = evaluations.map((e) => e.mark);
  const spread = Math.max(...marks) - Math.min(...marks);
  const answer = await Answer.findById(answerId);
  if (!answer) return;

  const examCycle = await ExamCycle.findById(answer.examCycleId);
  const threshold = examCycle?.escalationThreshold ?? config.escalationThreshold;

  if (spread > threshold) {
    answer.status = 'ESCALATED';
    answer.finalMark = undefined;
    answer.finalizationMethod = undefined;
    await answer.save();

    await Adjudication.findOneAndUpdate(
      { answerId },
      {
        examCycleId: answer.examCycleId,
        answerId,
        evaluationIds: evaluations.map((e) => e._id),
        markSpread: spread,
        status: 'PENDING',
      },
      { upsert: true, new: true }
    );
  } else {
    const average = marks.reduce((a, b) => a + b, 0) / marks.length;
    const rounded = Math.round(average * 100) / 100;

    answer.status = 'FINALIZED';
    answer.finalMark = rounded;
    answer.finalizationMethod = 'AVERAGE';
    answer.finalizedAt = new Date();
    await answer.save();
  }
}

export function getAnswerImageUrl(imageKey: string): string {
  if (imageKey.startsWith('http')) return imageKey;
  return `/api/v1/assets/${encodeURIComponent(imageKey)}`;
}

export async function buildEvaluationWorkspace(
  assignmentId: string,
  teacherId: string
) {
  const assignment = await Assignment.findOne({
    _id: assignmentId,
    teacherId: new Types.ObjectId(teacherId),
  });

  if (!assignment) return null;

  const answer = await Answer.findById(assignment.answerId);
  if (!answer) return null;

  const [subject, paper, script] = await Promise.all([
    Subject.findById(answer.subjectId),
    QuestionPaper.findById(answer.questionPaperId),
    Script.findById(answer.scriptId),
  ]);

  const question = paper?.questions.find((q) => q.questionNumber === answer.questionNumber);
  if (!subject || !question || !script) return null;

  const [assigned, completed] = await Promise.all([
    Assignment.countDocuments({ teacherId, examCycleId: assignment.examCycleId }),
    Assignment.countDocuments({
      teacherId,
      examCycleId: assignment.examCycleId,
      status: 'SUBMITTED',
    }),
  ]);

  const currentIndex = completed + (assignment.status === 'SUBMITTED' ? 0 : 1);

  return {
    assignmentId: assignment._id.toString(),
    answerId: answer._id.toString(),
    questionNumber: answer.questionNumber,
    subject: { id: subject._id.toString(), code: subject.code, name: subject.name },
    maxMarks: answer.maxMarks,
    questionText: question.text,
    rubric: question.rubric,
    modelAnswer: question.modelAnswer,
    answerImageUrl: getAnswerImageUrl(answer.answerImageKey),
    candidateId: script.candidateId,
    pageNumber: answer.pageNumber,
    draftMark: assignment.draftMark,
    draftComment: assignment.draftComment,
    progress: {
      assigned,
      completed,
      remaining: assigned - completed,
      current: Math.min(currentIndex, assigned),
    },
  };
}

export async function getTeacherStats(teacherId: string, examCycleId?: string) {
  const filter: Record<string, unknown> = { teacherId: new Types.ObjectId(teacherId) };
  if (examCycleId) filter.examCycleId = new Types.ObjectId(examCycleId);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [assigned, completed, evaluatedToday] = await Promise.all([
    Assignment.countDocuments(filter),
    Assignment.countDocuments({ ...filter, status: 'SUBMITTED' }),
    Evaluation.countDocuments({
      teacherId: new Types.ObjectId(teacherId),
      submittedAt: { $gte: todayStart },
    }),
  ]);

  return {
    assigned,
    completed,
    remaining: assigned - completed,
    evaluatedToday,
  };
}

export async function getDashboardOverview(examCycleId?: string) {
  const filter: Record<string, unknown> = {};
  if (examCycleId) filter.examCycleId = new Types.ObjectId(examCycleId);

  const [totalAnswers, finalized, escalated, pendingAdjudication, inProgress] =
    await Promise.all([
      Answer.countDocuments(filter),
      Answer.countDocuments({ ...filter, status: 'FINALIZED' }),
      Answer.countDocuments({ ...filter, status: 'ESCALATED' }),
      Adjudication.countDocuments({ ...filter, status: 'PENDING' }),
      Answer.countDocuments({
        ...filter,
        status: { $in: ['ASSIGNED', 'PARTIALLY_EVALUATED', 'AWAITING_RECONCILIATION'] },
      }),
    ]);

  return { totalAnswers, finalized, escalated, pendingAdjudication, inProgress };
}

export async function buildAdjudicationCase(adjudicationId: string) {
  const adjudication = await Adjudication.findById(adjudicationId);
  if (!adjudication) return null;

  const answer = await Answer.findById(adjudication.answerId);
  if (!answer) return null;

  const [subject, paper, script, evaluations] = await Promise.all([
    Subject.findById(answer.subjectId),
    QuestionPaper.findById(answer.questionPaperId),
    Script.findById(answer.scriptId),
    Evaluation.find({ _id: { $in: adjudication.evaluationIds } }).populate('teacherId', 'name'),
  ]);

  const question = paper?.questions.find((q) => q.questionNumber === answer.questionNumber);
  if (!subject || !question || !script) return null;

  const examCycle = await ExamCycle.findById(answer.examCycleId);

  return {
    id: adjudication._id.toString(),
    answerId: answer._id.toString(),
    questionNumber: answer.questionNumber,
    subject: { code: subject.code, name: subject.name },
    maxMarks: answer.maxMarks,
    questionText: question.text,
    rubric: question.rubric,
    modelAnswer: question.modelAnswer,
    answerImageUrl: getAnswerImageUrl(answer.answerImageKey),
    candidateId: script.candidateId,
    markSpread: adjudication.markSpread,
    threshold: examCycle?.escalationThreshold ?? config.escalationThreshold,
    evaluations: evaluations.map((e) => {
      const teacher = e.teacherId as unknown as { name: string };
      return {
        teacherName: teacher.name,
        mark: e.mark,
        comment: e.comment,
      };
    }),
  };
}
