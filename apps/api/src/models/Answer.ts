import mongoose, { Schema, Document, Types } from "mongoose";
import { AnswerStatus, FinalizationMethod } from "@dasems/shared-types";

export interface IBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IAnswer extends Document {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  scriptId: Types.ObjectId;
  studentId: Types.ObjectId;
  sCode: string;
  subjectId: Types.ObjectId;
  questionId: Types.ObjectId;
  questionNumber: number;
  maxMarks: number;
  imageKey: string;
  imageUrl: string;
  pageNumber: number;
  boundingBox: IBoundingBox;
  resolution: { width: number; height: number };
  rotation: number;
  ocrStatus: "PENDING" | "DONE" | "FAILED" | "SKIPPED";
  ocrText: string;
  suggestedMark?: number;
  suggestedConfidence?: number;
  processingStatus: "PENDING" | "READY" | "FAILED";
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
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "AdmissionSession",
      required: true,
    },
    scriptId: { type: Schema.Types.ObjectId, ref: "Script", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    sCode: { type: String, required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    questionNumber: { type: Number, required: true },
    maxMarks: { type: Number, required: true },
    imageKey: { type: String, required: true },
    imageUrl: { type: String, required: true },
    pageNumber: { type: Number, default: 1 },
    boundingBox: {
      x: Number,
      y: Number,
      width: Number,
      height: Number,
    },
    resolution: { width: Number, height: Number },
    rotation: { type: Number, default: 0 },
    ocrStatus: {
      type: String,
      enum: ["PENDING", "DONE", "FAILED", "SKIPPED"],
      default: "SKIPPED",
    },
    ocrText: { type: String, default: "" },
    suggestedMark: { type: Number },
    suggestedConfidence: { type: Number },
    processingStatus: {
      type: String,
      enum: ["PENDING", "READY", "FAILED"],
      default: "READY",
    },
    status: {
      type: String,
      enum: [
        "UNASSIGNED",
        "ASSIGNED",
        "PARTIALLY_EVALUATED",
        "AWAITING_RECONCILIATION",
        "ESCALATED",
        "FINALIZED",
      ],
      default: "UNASSIGNED",
    },
    evaluationCount: { type: Number, default: 0 },
    finalMark: Number,
    finalizationMethod: {
      type: String,
      enum: ["AVERAGE", "HEAD_ADJUDICATION"],
    },
    finalizedAt: Date,
    finalizedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

answerSchema.index(
  { sessionId: 1, sCode: 1, questionNumber: 1 },
  { unique: true },
);
answerSchema.index({ sessionId: 1, subjectId: 1, status: 1 });

export const Answer = mongoose.model<IAnswer>("Answer", answerSchema);
