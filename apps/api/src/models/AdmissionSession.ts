import mongoose, { Schema, Document, Types } from 'mongoose';
import { AdmissionSessionStatus } from '@dasems/shared-types';

export interface IQuestionMappingEntry {
  subjectId: Types.ObjectId;
  subjectCode: string;
  startQuestion: number;
  endQuestion: number;
}

export interface IAdmissionSession extends Document {
  _id: Types.ObjectId;
  examId: Types.ObjectId;
  name: string;
  status: AdmissionSessionStatus;
  moderationThreshold: number;
  sCodePrefix: string;
  questionMapping: IQuestionMappingEntry[];
  evaluationDeadline?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const admissionSessionSchema = new Schema<IAdmissionSession>(
  {
    examId: { type: Schema.Types.ObjectId, ref: 'AdmissionExam', required: true },
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'],
      default: 'DRAFT',
    },
    moderationThreshold: { type: Number, default: 3, min: 0 },
    sCodePrefix: { type: String, required: true, uppercase: true },
    questionMapping: [
      {
        subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
        subjectCode: String,
        startQuestion: Number,
        endQuestion: Number,
      },
    ],
    evaluationDeadline: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

admissionSessionSchema.index({ examId: 1, name: 1 }, { unique: true });

export const AdmissionSession = mongoose.model<IAdmissionSession>(
  'AdmissionSession',
  admissionSessionSchema
);
