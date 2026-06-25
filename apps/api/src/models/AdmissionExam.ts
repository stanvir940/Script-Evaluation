import mongoose, { Schema, Document, Types } from 'mongoose';
import { AdmissionExamStatus } from '@dasems/shared-types';

export interface IAdmissionExam extends Document {
  _id: Types.ObjectId;
  name: string;
  institutionId: Types.ObjectId;
  year: number;
  status: AdmissionExamStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const admissionExamSchema = new Schema<IAdmissionExam>(
  {
    name: { type: String, required: true },
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    year: { type: Number, required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'],
      default: 'DRAFT',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

admissionExamSchema.index({ institutionId: 1, year: 1 }, { unique: true });

export const AdmissionExam = mongoose.model<IAdmissionExam>('AdmissionExam', admissionExamSchema);
