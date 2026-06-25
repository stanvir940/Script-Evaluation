import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDepartment extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  isActive: boolean;
}

const departmentSchema = new Schema<IDepartment>(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Department = mongoose.model<IDepartment>('Department', departmentSchema);
