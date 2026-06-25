import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { sendSuccess } from '../../lib/response';
import { AuditLog } from '../../models';

export const auditController = {
  list: async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find().sort({ timestamp: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(),
    ]);

    sendSuccess(
      res,
      logs.map((log) => ({
        id: log._id.toString(),
        actorId: log.actorId.toString(),
        actorRole: log.actorRole,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId.toString(),
        timestamp: log.timestamp.toISOString(),
      })),
      200,
      { page, limit, total }
    );
  },
};
