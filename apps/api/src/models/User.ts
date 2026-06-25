import mongoose, { Schema, Document, Types } from 'mongoose';
import { UserRole } from '@dasems/shared-types';

export interface IUser extends Document {
  _id: Types.ObjectId;
  employeeId: string;
  email?: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  subjectIds: Types.ObjectId[];
  departmentIds: Types.ObjectId[];
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    employeeId: { type: String, required: true, unique: true, index: true },
    email: { type: String, sparse: true, unique: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'HEAD_EXAMINER', 'TEACHER'],
      required: true,
    },
    subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
    departmentIds: [{ type: Schema.Types.ObjectId, ref: 'Department' }],
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
