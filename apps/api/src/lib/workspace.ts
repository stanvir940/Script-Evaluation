import { Types } from 'mongoose';
import { EvaluationWorkspaceDto, AnnotationAction } from '@dasems/shared-types';
import {
  Assignment,
  Answer,
  Question,
  Subject,
  AnnotationLayer,
} from '../models';

export async function buildEvaluationWorkspace(
  assignmentId: string,
  teacherId: string
): Promise<EvaluationWorkspaceDto | null> {
  const assignment = await Assignment.findOne({
    _id: assignmentId,
    teacherId: new Types.ObjectId(teacherId),
  });
  if (!assignment) return null;

  const answer = await Answer.findById(assignment.answerId);
  if (!answer) return null;

  const [subject, question, annotationLayer] = await Promise.all([
    Subject.findById(answer.subjectId),
    Question.findById(answer.questionId),
    AnnotationLayer.findOne({ answerId: answer._id, teacherId: assignment.teacherId }),
  ]);

  if (!subject || !question) return null;

  const [assigned, completed] = await Promise.all([
    Assignment.countDocuments({ teacherId, sessionId: assignment.sessionId }),
    Assignment.countDocuments({
      teacherId,
      sessionId: assignment.sessionId,
      status: 'SUBMITTED',
    }),
  ]);

  const annotations: AnnotationAction[] = (annotationLayer?.actions ?? []).map((a) => ({
    id: a.id,
    tool: a.tool,
    points: a.points,
    color: a.color,
    strokeWidth: a.strokeWidth,
    text: a.text,
    timestamp: a.timestamp.toISOString(),
  }));

  return {
    assignmentId: assignment._id.toString(),
    answerId: answer._id.toString(),
    sCode: answer.sCode,
    questionNumber: answer.questionNumber,
    subject: { id: subject._id.toString(), code: subject.code, name: subject.name },
    maxMarks: answer.maxMarks,
    questionText: question.text,
    rubric: question.rubric,
    modelAnswer: question.modelAnswer,
    keywords: question.keywords,
    answerImageUrl: answer.imageUrl,
    pageNumber: answer.pageNumber,
    annotations,
    draftMark: assignment.draftMark,
    draftComment: assignment.draftComment,
    progress: {
      assigned,
      completed,
      remaining: assigned - completed,
      current: Math.min(completed + (assignment.status === 'SUBMITTED' ? 0 : 1), assigned),
    },
  };
}

export async function getTeacherStats(teacherId: string, sessionId?: string) {
  const filter: Record<string, unknown> = { teacherId: new Types.ObjectId(teacherId) };
  if (sessionId) filter.sessionId = new Types.ObjectId(sessionId);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [assigned, completed, evaluatedToday, evaluations] = await Promise.all([
    Assignment.countDocuments(filter),
    Assignment.countDocuments({ ...filter, status: 'SUBMITTED' }),
    (await import('../models')).Evaluation.countDocuments({
      teacherId: new Types.ObjectId(teacherId),
      submittedAt: { $gte: todayStart },
    }),
    (await import('../models')).Evaluation.find({
      teacherId: new Types.ObjectId(teacherId),
      timeSpentSeconds: { $exists: true },
    })
      .select('timeSpentSeconds')
      .limit(100),
  ]);

  const avgTimeSeconds =
    evaluations.length > 0
      ? Math.round(
          evaluations.reduce((s, e) => s + (e.timeSpentSeconds ?? 0), 0) / evaluations.length
        )
      : 0;

  return { assigned, completed, remaining: assigned - completed, evaluatedToday, avgTimeSeconds };
}
