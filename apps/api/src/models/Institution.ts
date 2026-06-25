import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInstitution extends Document {
  _id: Types.ObjectId;
  name: string;
  code: string;
  isActive: boolean;
}

const institutionSchema = new Schema<IInstitution>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Institution = mongoose.model<IInstitution>('Institution', institutionSchema);
