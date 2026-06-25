import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAdjudication extends Document {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  answerId: Types.ObjectId;
  headExaminerId?: Types.ObjectId;
  evaluationIds: Types.ObjectId[];
  markSpread: number;
  finalMark?: number;
  rationale?: string;
  status: 'PENDING' | 'COMPLETED' | 'RETURNED';
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adjudicationSchema = new Schema<IAdjudication>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'AdmissionSession', required: true },
    answerId: { type: Schema.Types.ObjectId, ref: 'Answer', required: true, unique: true },
    headExaminerId: { type: Schema.Types.ObjectId, ref: 'User' },
    evaluationIds: [{ type: Schema.Types.ObjectId, ref: 'Evaluation' }],
    markSpread: { type: Number, required: true },
    finalMark: Number,
    rationale: String,
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'RETURNED'],
      default: 'PENDING',
    },
    reviewedAt: Date,
  },
  { timestamps: true }
);

export const Adjudication = mongoose.model<IAdjudication>('Adjudication', adjudicationSchema);
