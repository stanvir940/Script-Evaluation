import mongoose, { Schema, Document, Types } from "mongoose";
import { ProcessingStatus } from "@dasems/shared-types";

export interface IScript extends Document {
  _id: Types.ObjectId;
  sessionId?: Types.ObjectId;
  studentId?: Types.ObjectId;
  sCode?: string;
  originalPdfKey: string;
  originalPdfUrl?: string;
  pageCount: number;
  processingStatus: ProcessingStatus | "PENDING_ASSIGNMENT" | "PAGES_UPLOADING";
  processingError?: string;
  // Mobile upload fields
  uploadSource: "WEB" | "MOBILE";
  uploadMode?: "pdf" | "camera";
  mobileRollNumber?: string;
  mobileExamName?: string;
  mobilePageKeys?: string[];
  uploadedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const scriptSchema = new Schema<IScript>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "AdmissionSession",
      required: false, // not required for mobile uploads until assigned
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: false, // not required for mobile uploads until assigned
    },
    sCode: { type: String, required: false },
    originalPdfKey: { type: String, required: true },
    originalPdfUrl: { type: String, required: false },
    pageCount: { type: Number, default: 0 },
    processingStatus: {
      type: String,
      enum: [
        "PENDING",
        "QUEUED",
        "PROCESSING",
        "READY",
        "FAILED",
        "PENDING_ASSIGNMENT", // mobile upload waiting for web admin to assign
        "PAGES_UPLOADING", // camera mode: pages still arriving from phone
      ],
      default: "PENDING",
    },
    processingError: String,

    // ── Mobile upload fields ──────────────────────────────────────────────────
    uploadSource: {
      type: String,
      enum: ["WEB", "MOBILE"],
      default: "WEB",
    },
    uploadMode: {
      type: String,
      enum: ["pdf", "camera"],
    },
    // Roll number entered in the mobile app — used by web admin to find student
    mobileRollNumber: { type: String },
    // Exam name entered in the mobile app — used to find the right session
    mobileExamName: { type: String },
    // Ordered list of page image keys (camera mode only)
    mobilePageKeys: [{ type: String }],
    // When the mobile upload arrived
    uploadedAt: { type: Date },
  },
  { timestamps: true },
);

// Original unique index only applies to web uploads (both sessionId + studentId present)
// Mobile uploads don't have these yet, so we make it sparse
scriptSchema.index(
  { sessionId: 1, studentId: 1 },
  { unique: true, sparse: true },
);

// Extra indexes for the mobile admin queue
scriptSchema.index({ processingStatus: 1, uploadSource: 1 });
scriptSchema.index({ mobileRollNumber: 1 });

export const Script = mongoose.model<IScript>("Script", scriptSchema);
