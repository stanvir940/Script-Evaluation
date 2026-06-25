import mongoose, { Schema, Document, Types } from 'mongoose';
import { AssignmentStatus } from '@ase/shared-types';

export interface IAssignment extends Document {
  _id: Types.ObjectId;
  examCycleId: Types.ObjectId;
  answerId: Types.ObjectId;
  teacherId: Types.ObjectId;
  slot: number;
  status: AssignmentStatus;
  draftMark?: number;
  draftComment?: string;
  claimedAt?: Date;
  claimedUntil?: Date;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const assignmentSchema = new Schema<IAssignment>(
  {
    examCycleId: { type: Schema.Types.ObjectId, ref: 'ExamCycle', required: true },
    answerId: { type: Schema.Types.ObjectId, ref: 'Answer', required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    slot: { type: Number, required: true, min: 1, max: 3 },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'SKIPPED'],
      default: 'PENDING',
    },
    draftMark: Number,
    draftComment: String,
    claimedAt: Date,
    claimedUntil: Date,
    submittedAt: Date,
  },
  { timestamps: true }
);

assignmentSchema.index({ teacherId: 1, status: 1 });
assignmentSchema.index({ answerId: 1, slot: 1 }, { unique: true });

export const Assignment = mongoose.model<IAssignment>('Assignment', assignmentSchema);
