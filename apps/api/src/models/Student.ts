import mongoose, { Schema, Document, Types } from 'mongoose';
import { ProcessingStatus } from '@dasems/shared-types';

export interface IStudent extends Document {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  roll: string;
  name: string;
  faculty: string;
  departmentId: Types.ObjectId;
  sCode: string;
  processingStatus: ProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
}

const studentSchema = new Schema<IStudent>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'AdmissionSession', required: true },
    roll: { type: String, required: true },
    name: { type: String, required: true },
    faculty: { type: String, required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    sCode: { type: String, required: true, uppercase: true },
    processingStatus: {
      type: String,
      enum: ['PENDING', 'QUEUED', 'PROCESSING', 'READY', 'FAILED'],
      default: 'PENDING',
    },
  },
  { timestamps: true }
);

studentSchema.index({ sessionId: 1, roll: 1 }, { unique: true });
studentSchema.index({ sessionId: 1, sCode: 1 }, { unique: true });

export const Student = mongoose.model<IStudent>('Student', studentSchema);
