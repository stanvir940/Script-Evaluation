import { Types } from 'mongoose';
import { AuditLog } from '../models';
import { AuthRequest } from '../middleware/auth.middleware';

export interface AuditEntry {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await AuditLog.create({
    actorId: new Types.ObjectId(entry.actorId),
    actorRole: entry.actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: new Types.ObjectId(entry.entityId),
    before: entry.before,
    after: entry.after,
    ipAddress: entry.ipAddress,
    timestamp: new Date(),
  });
}

export async function writeAuditFromRequest(
  req: AuthRequest,
  action: string,
  entityType: string,
  entityId: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>
): Promise<void> {
  if (!req.user) return;
  await writeAuditLog({
    actorId: req.user.userId,
    actorRole: req.user.role,
    action,
    entityType,
    entityId,
    before,
    after,
    ipAddress: req.ip,
  });
}
