import mongoose, { Schema, Document, Types } from 'mongoose';
import { ExamCycleStatus } from '@ase/shared-types';

export interface IExamCycle extends Document {
  _id: Types.ObjectId;
  name: string;
  year: number;
  status: ExamCycleStatus;
  escalationThreshold: number;
  evaluationDeadline?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examCycleSchema = new Schema<IExamCycle>(
  {
    name: { type: String, required: true },
    year: { type: Number, required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'],
      default: 'DRAFT',
    },
    escalationThreshold: { type: Number, default: 3 },
    evaluationDeadline: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const ExamCycle = mongoose.model<IExamCycle>('ExamCycle', examCycleSchema);
