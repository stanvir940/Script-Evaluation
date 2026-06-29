import mongoose, { Schema, Document, Types } from "mongoose";
import { ProcessingStatus } from "@dasems/shared-types";

export interface IScript extends Document {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  studentId: Types.ObjectId;
  sCode: string;
  originalPdfKey: string;
  originalPdfUrl: string;
  pageCount: number;
  processingStatus: ProcessingStatus;
  processingError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const scriptSchema = new Schema<IScript>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "AdmissionSession",
      required: true,
    },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    sCode: { type: String, required: true },
    originalPdfKey: { type: String, required: true },
    originalPdfUrl: { type: String, required: true },
    pageCount: { type: Number, default: 0 },
    processingStatus: {
      type: String,
      enum: ["PENDING", "QUEUED", "PROCESSING", "READY", "FAILED"],
      default: "PENDING",
    },
    processingError: String,
  },
  { timestamps: true },
);

scriptSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

export const Script = mongoose.model<IScript>("Script", scriptSchema);
