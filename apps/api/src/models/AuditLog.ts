import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  examCycleId?: Types.ObjectId;
  actorId: Types.ObjectId;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: Types.ObjectId;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
  correlationId?: string;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  examCycleId: { type: Schema.Types.ObjectId, ref: 'ExamCycle' },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  ipAddress: String,
  correlationId: String,
  timestamp: { type: Date, default: Date.now },
});

auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ actorId: 1, timestamp: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
