import mongoose, { Schema, Document, Types } from 'mongoose';
import { AnswerStatus, FinalizationMethod } from '@ase/shared-types';

export interface IAnswer extends Document {
  _id: Types.ObjectId;
  examCycleId: Types.ObjectId;
  scriptId: Types.ObjectId;
  subjectId: Types.ObjectId;
  questionPaperId: Types.ObjectId;
  questionNumber: number;
  maxMarks: number;
  answerImageKey: string;
  pageNumber: number;
  status: AnswerStatus;
  evaluationCount: number;
  finalMark?: number;
  finalizationMethod?: FinalizationMethod;
  finalizedAt?: Date;
  finalizedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const answerSchema = new Schema<IAnswer>(
  {
    examCycleId: { type: Schema.Types.ObjectId, ref: 'ExamCycle', required: true },
    scriptId: { type: Schema.Types.ObjectId, ref: 'Script', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    questionPaperId: { type: Schema.Types.ObjectId, ref: 'QuestionPaper', required: true },
    questionNumber: { type: Number, required: true },
    maxMarks: { type: Number, required: true },
    answerImageKey: { type: String, required: true },
    pageNumber: { type: Number, default: 1 },
    status: {
      type: String,
      enum: [
        'UNASSIGNED',
        'ASSIGNED',
        'PARTIALLY_EVALUATED',
        'AWAITING_RECONCILIATION',
        'ESCALATED',
        'FINALIZED',
      ],
      default: 'UNASSIGNED',
    },
    evaluationCount: { type: Number, default: 0 },
    finalMark: Number,
    finalizationMethod: {
      type: String,
      enum: ['AVERAGE', 'HEAD_ADJUDICATION'],
    },
    finalizedAt: Date,
    finalizedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

answerSchema.index({ examCycleId: 1, subjectId: 1, status: 1 });
answerSchema.index({ scriptId: 1, questionNumber: 1 });

export const Answer = mongoose.model<IAnswer>('Answer', answerSchema);
