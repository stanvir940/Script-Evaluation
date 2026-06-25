import mongoose, { Schema, Document, Types } from 'mongoose';
import { AnnotationTool } from '@dasems/shared-types';

export interface IAnnotationAction {
  id: string;
  tool: AnnotationTool;
  points: number[];
  color: string;
  strokeWidth: number;
  text?: string;
  timestamp: Date;
}

export interface IAnnotationLayer extends Document {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  answerId: Types.ObjectId;
  teacherId: Types.ObjectId;
  actions: IAnnotationAction[];
  version: number;
  updatedAt: Date;
}

const annotationActionSchema = new Schema<IAnnotationAction>(
  {
    id: String,
    tool: String,
    points: [Number],
    color: String,
    strokeWidth: Number,
    text: String,
    timestamp: Date,
  },
  { _id: false }
);

const annotationLayerSchema = new Schema<IAnnotationLayer>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'AdmissionSession', required: true },
    answerId: { type: Schema.Types.ObjectId, ref: 'Answer', required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actions: [annotationActionSchema],
    version: { type: Number, default: 1 },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

annotationLayerSchema.index({ answerId: 1, teacherId: 1 }, { unique: true });

export const AnnotationLayer = mongoose.model<IAnnotationLayer>(
  'AnnotationLayer',
  annotationLayerSchema
);
