import mongoose, { Schema, Document, Types } from "mongoose";
import { Difficulty } from "@dasems/shared-types";

export interface IRubricItem {
  context: string;
  value: number;
}

export interface IRubric {
  items: IRubricItem[];
}

export interface IQuestion extends Document {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  subjectId: Types.ObjectId;
  questionNumber: number;
  text: string;
  maxMarks: number;
  modelAnswer: string;
  rubric: IRubric;
  keywords: string[];
  difficulty: Difficulty;
  createdAt: Date;
  updatedAt: Date;
}

const rubricItemSchema = new Schema<IRubricItem>(
  {
    context: { type: String, required: true },
    value: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const rubricSchema = new Schema<IRubric>(
  {
    items: { type: [rubricItemSchema], required: true },
  },
  { _id: false },
);

const questionSchema = new Schema<IQuestion>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "AdmissionSession",
      required: true,
    },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    questionNumber: { type: Number, required: true },
    text: { type: String, required: true },
    maxMarks: { type: Number, required: true },
    modelAnswer: { type: String, required: true },
    rubric: { type: rubricSchema, required: true },
    keywords: [{ type: String }],
    difficulty: {
      type: String,
      enum: ["EASY", "MEDIUM", "HARD"],
      default: "MEDIUM",
    },
  },
  { timestamps: true },
);

questionSchema.index({ sessionId: 1, questionNumber: 1 }, { unique: true });

export const Question = mongoose.model<IQuestion>("Question", questionSchema);
