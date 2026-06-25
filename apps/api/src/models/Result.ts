import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IResult extends Document {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  studentId: Types.ObjectId;
  sCode: string;
  subjectId: Types.ObjectId;
  totalMarks: number;
  obtainedMarks: number;
  published: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const resultSchema = new Schema<IResult>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'AdmissionSession', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    sCode: { type: String, required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    totalMarks: { type: Number, required: true },
    obtainedMarks: { type: Number, required: true },
    published: { type: Boolean, default: false },
    publishedAt: Date,
  },
  { timestamps: true }
);

resultSchema.index({ sessionId: 1, studentId: 1, subjectId: 1 }, { unique: true });

export const Result = mongoose.model<IResult>('Result', resultSchema);
