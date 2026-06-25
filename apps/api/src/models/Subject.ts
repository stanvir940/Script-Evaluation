import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISubject extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  isActive: boolean;
}

const subjectSchema = new Schema<ISubject>(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Subject = mongoose.model<ISubject>('Subject', subjectSchema);
