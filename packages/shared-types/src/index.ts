export type UserRole = 'SUPER_ADMIN' | 'TEACHER' | 'HEAD_EXAMINER';

export type ExamCycleStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

export type AnswerStatus =
  | 'UNASSIGNED'
  | 'ASSIGNED'
  | 'PARTIALLY_EVALUATED'
  | 'AWAITING_RECONCILIATION'
  | 'ESCALATED'
  | 'FINALIZED';

export type AssignmentStatus = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'SKIPPED';

export type FinalizationMethod = 'AVERAGE' | 'HEAD_ADJUDICATION';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface LoginRequest {
  employeeId: string;
  password: string;
}

export interface AuthUser {
  id: string;
  employeeId: string;
  name: string;
  role: UserRole;
  subjects: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface Question {
  questionNumber: number;
  text: string;
  maxMarks: number;
  rubric: string;
  modelAnswer: string;
}

export interface EvaluationWorkspace {
  assignmentId: string;
  answerId: string;
  questionNumber: number;
  subject: { id: string; code: string; name: string };
  maxMarks: number;
  questionText: string;
  rubric: string;
  modelAnswer: string;
  answerImageUrl: string;
  candidateId: string;
  pageNumber: number;
  draftMark?: number;
  draftComment?: string;
  progress: {
    assigned: number;
    completed: number;
    remaining: number;
    current: number;
  };
}

export interface TeacherStats {
  assigned: number;
  completed: number;
  remaining: number;
  evaluatedToday: number;
}

export interface DashboardOverview {
  totalAnswers: number;
  finalized: number;
  escalated: number;
  pendingAdjudication: number;
  inProgress: number;
}

export interface AdjudicationCase {
  id: string;
  answerId: string;
  questionNumber: number;
  subject: { code: string; name: string };
  maxMarks: number;
  questionText: string;
  rubric: string;
  modelAnswer: string;
  answerImageUrl: string;
  candidateId: string;
  markSpread: number;
  threshold: number;
  evaluations: Array<{
    teacherName: string;
    mark: number;
    comment: string;
  }>;
}
