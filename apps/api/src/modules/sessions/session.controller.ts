import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { sendSuccess } from '../../lib/response';
import { writeAuditFromRequest } from '../../lib/audit';
import { sessionService } from './session.service';
import { CreateSessionDto } from './session.dto';

export const sessionController = {
  list: async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await sessionService.list());
  },
  create: async (req: AuthRequest, res: Response) => {
    const session = await sessionService.create(req.body as CreateSessionDto, req.user!.userId);
    await writeAuditFromRequest(req, 'SESSION_CREATED', 'AdmissionSession', session.id, undefined, session);
    sendSuccess(res, session, 201);
  },
};
