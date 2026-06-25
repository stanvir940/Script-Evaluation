import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IScript extends Document {
  _id: Types.ObjectId;
  examCycleId: Types.ObjectId;
  rollNumber: string;
  candidateId: string;
  originalPdfKey?: string;
  pageCount: number;
  processingStatus: 'PENDING' | 'PROCESSING' | 'READY' | 'ERROR';
  createdAt: Date;
  updatedAt: Date;
}

const scriptSchema = new Schema<IScript>(
  {
    examCycleId: { type: Schema.Types.ObjectId, ref: 'ExamCycle', required: true },
    rollNumber: { type: String, required: true },
    candidateId: { type: String, required: true },
    originalPdfKey: String,
    pageCount: { type: Number, default: 1 },
    processingStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'READY', 'ERROR'],
      default: 'READY',
    },
  },
  { timestamps: true }
);

scriptSchema.index({ examCycleId: 1, rollNumber: 1 }, { unique: true });

export const Script = mongoose.model<IScript>('Script', scriptSchema);
