import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IQuestion {
  questionNumber: number;
  text: string;
  maxMarks: number;
  rubric: string;
  modelAnswer: string;
}

export interface IQuestionPaper extends Document {
  _id: Types.ObjectId;
  examCycleId: Types.ObjectId;
  subjectId: Types.ObjectId;
  version: number;
  questions: IQuestion[];
  totalMarks: number;
  publishedAt?: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    questionNumber: { type: Number, required: true },
    text: { type: String, required: true },
    maxMarks: { type: Number, required: true },
    rubric: { type: String, required: true },
    modelAnswer: { type: String, required: true },
  },
  { _id: false }
);

const questionPaperSchema = new Schema<IQuestionPaper>(
  {
    examCycleId: { type: Schema.Types.ObjectId, ref: 'ExamCycle', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    version: { type: Number, default: 1 },
    questions: [questionSchema],
    totalMarks: { type: Number, default: 0 },
    publishedAt: Date,
  },
  { timestamps: true }
);

questionPaperSchema.index({ examCycleId: 1, subjectId: 1 }, { unique: true });

export const QuestionPaper = mongoose.model<IQuestionPaper>('QuestionPaper', questionPaperSchema);
