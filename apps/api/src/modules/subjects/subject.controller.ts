import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { sendSuccess } from '../../lib/response';
import { writeAuditFromRequest } from '../../lib/audit';
import { subjectService } from './subject.service';
import { CreateSubjectDto } from './subject.dto';

export const subjectController = {
  list: async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await subjectService.list());
  },
  create: async (req: AuthRequest, res: Response) => {
    const subject = await subjectService.create(req.body as CreateSubjectDto);
    await writeAuditFromRequest(req, 'SUBJECT_CREATED', 'Subject', subject.id, undefined, subject);
    sendSuccess(res, subject, 201);
  },
};
