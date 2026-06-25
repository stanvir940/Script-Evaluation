import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IEvaluation extends Document {
  _id: Types.ObjectId;
  examCycleId: Types.ObjectId;
  assignmentId: Types.ObjectId;
  answerId: Types.ObjectId;
  teacherId: Types.ObjectId;
  slot: number;
  mark: number;
  comment: string;
  timeSpentSeconds?: number;
  submittedAt: Date;
}

const evaluationSchema = new Schema<IEvaluation>(
  {
    examCycleId: { type: Schema.Types.ObjectId, ref: 'ExamCycle', required: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
    answerId: { type: Schema.Types.ObjectId, ref: 'Answer', required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    slot: { type: Number, required: true },
    mark: { type: Number, required: true },
    comment: { type: String, default: '' },
    timeSpentSeconds: Number,
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

evaluationSchema.index({ answerId: 1, slot: 1 }, { unique: true });

export const Evaluation = mongoose.model<IEvaluation>('Evaluation', evaluationSchema);
