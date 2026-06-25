import { Types } from 'mongoose';
import { AuditLog } from '../models';
import { AuthRequest } from './auth.middleware';

export async function createAuditLog(
  req: AuthRequest,
  action: string,
  entityType: string,
  entityId: Types.ObjectId | string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
  examCycleId?: Types.ObjectId | string
): Promise<void> {
  if (!req.user) return;

  await AuditLog.create({
    examCycleId: examCycleId ? new Types.ObjectId(examCycleId) : undefined,
    actorId: new Types.ObjectId(req.user.userId),
    actorRole: req.user.role,
    action,
    entityType,
    entityId: new Types.ObjectId(entityId),
    before,
    after,
    ipAddress: req.ip,
    correlationId: req.headers['x-correlation-id'] as string | undefined,
  });
}
