import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISubject extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  departmentId?: Types.ObjectId;
  isActive: boolean;
}

const subjectSchema = new Schema<ISubject>(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Subject = mongoose.model<ISubject>('Subject', subjectSchema);
