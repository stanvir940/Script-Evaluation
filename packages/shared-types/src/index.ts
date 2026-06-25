// ─── Roles & Status ───────────────────────────────────────────────────────────

export type UserRole = 'SUPER_ADMIN' | 'HEAD_EXAMINER' | 'TEACHER';

export type AdmissionExamStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export type AdmissionSessionStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

export type ProcessingStatus = 'PENDING' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
export type AnswerStatus =
  | 'UNASSIGNED'
  | 'ASSIGNED'
  | 'PARTIALLY_EVALUATED'
  | 'AWAITING_RECONCILIATION'
  | 'ESCALATED'
  | 'FINALIZED';

export type AssignmentStatus = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED';
export type FinalizationMethod = 'AVERAGE' | 'HEAD_ADJUDICATION';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type AnnotationTool =
  | 'pen'
  | 'highlighter'
  | 'underline'
  | 'rectangle'
  | 'arrow'
  | 'circle'
  | 'text'
  | 'erase';

// ─── API ──────────────────────────────────────────────────────────────────────

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
  subjectIds: string[];
  departmentIds: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// ─── Phase 1 DTOs ─────────────────────────────────────────────────────────────

export interface InstitutionDto {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface AdmissionExamDto {
  id: string;
  name: string;
  institutionId: string;
  year: number;
  status: AdmissionExamStatus;
}

export interface QuestionMappingEntry {
  subjectId: string;
  subjectCode: string;
  startQuestion: number;
  endQuestion: number;
}

export interface AdmissionSessionDto {
  id: string;
  examId: string;
  name: string;
  status: AdmissionSessionStatus;
  moderationThreshold: number;
  sCodePrefix: string;
  questionMapping: QuestionMappingEntry[];
  evaluationDeadline?: string;
}

export interface DepartmentDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface SubjectDto {
  id: string;
  code: string;
  name: string;
  departmentId?: string;
  isActive: boolean;
}

export interface UserDto {
  id: string;
  employeeId: string;
  name: string;
  email?: string;
  role: UserRole;
  subjectIds: string[];
  departmentIds: string[];
  isActive: boolean;
}

export interface AuditLogDto {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
}

// ─── Phase 2 DTOs ─────────────────────────────────────────────────────────────

export interface QuestionDto {
  id: string;
  sessionId: string;
  subjectId: string;
  questionNumber: number;
  text: string;
  maxMarks: number;
  modelAnswer: string;
  rubric: string;
  keywords: string[];
  difficulty: Difficulty;
}

/** Admin-only — contains PII */
export interface StudentAdminDto {
  id: string;
  sessionId: string;
  roll: string;
  name: string;
  faculty: string;
  departmentId: string;
  sCode: string;
  processingStatus: ProcessingStatus;
}

/** Teacher-safe view */
export interface StudentEvalDto {
  sCode: string;
}

export interface ScriptDto {
  id: string;
  sessionId: string;
  sCode: string;
  processingStatus: ProcessingStatus;
  pageCount: number;
  originalPdfUrl: string;
}

// ─── Phase 4 DTOs ─────────────────────────────────────────────────────────────

export interface TeacherStatsDto {
  assigned: number;
  completed: number;
  remaining: number;
  evaluatedToday: number;
  avgTimeSeconds: number;
}

export interface AnnotationAction {
  id: string;
  tool: AnnotationTool;
  points: number[];
  color: string;
  strokeWidth: number;
  text?: string;
  timestamp: string;
}

export interface EvaluationWorkspaceDto {
  assignmentId: string;
  answerId: string;
  sCode: string;
  questionNumber: number;
  subject: { id: string; code: string; name: string };
  maxMarks: number;
  questionText: string;
  rubric: string;
  modelAnswer: string;
  keywords: string[];
  answerImageUrl: string;
  pageNumber: number;
  annotations: AnnotationAction[];
  draftMark?: number;
  draftComment?: string;
  progress: {
    assigned: number;
    completed: number;
    remaining: number;
    current: number;
  };
}

// ─── Phase 5 DTOs ─────────────────────────────────────────────────────────────

export interface ModerationCaseDto {
  id: string;
  answerId: string;
  sCode: string;
  questionNumber: number;
  subject: { code: string; name: string };
  maxMarks: number;
  questionText: string;
  rubric: string;
  modelAnswer: string;
  keywords: string[];
  answerImageUrl: string;
  markSpread: number;
  threshold: number;
  evaluations: Array<{
    teacherId: string;
    teacherName: string;
    mark: number;
    comment: string;
    annotations: AnnotationAction[];
  }>;
}

export interface DashboardOverviewDto {
  totalStudents: number;
  totalAnswers: number;
  finalized: number;
  escalated: number;
  pendingModeration: number;
  inProgress: number;
  subjectBreakdown: Array<{
    subjectCode: string;
    subjectName: string;
    total: number;
    finalized: number;
    escalated: number;
  }>;
}

// ─── Phase 6 DTOs ─────────────────────────────────────────────────────────────

export interface ResultRowDto {
  sCode: string;
  roll?: string;
  name?: string;
  subjectCode: string;
  subjectName: string;
  totalMarks: number;
  obtainedMarks: number;
}

export interface MeritEntryDto {
  roll: string;
  name: string;
  sCode: string;
  totalObtained: number;
  totalPossible: number;
  percentage: number;
}
