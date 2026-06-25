import mongoose, { Schema, Document, Types } from 'mongoose';
import { AssignmentStatus } from '@dasems/shared-types';

export interface IAssignment extends Document {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  answerId: Types.ObjectId;
  teacherId: Types.ObjectId;
  slot: number;
  status: AssignmentStatus;
  draftMark?: number;
  draftComment?: string;
  claimedAt?: Date;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const assignmentSchema = new Schema<IAssignment>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'AdmissionSession', required: true },
    answerId: { type: Schema.Types.ObjectId, ref: 'Answer', required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    slot: { type: Number, required: true, min: 1, max: 3 },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'SUBMITTED'],
      default: 'PENDING',
    },
    draftMark: Number,
    draftComment: String,
    claimedAt: Date,
    submittedAt: Date,
  },
  { timestamps: true }
);

assignmentSchema.index({ teacherId: 1, status: 1 });
assignmentSchema.index({ answerId: 1, slot: 1 }, { unique: true });

export const Assignment = mongoose.model<IAssignment>('Assignment', assignmentSchema);
