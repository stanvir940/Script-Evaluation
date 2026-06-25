import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { sendSuccess } from '../../lib/response';
import { writeAuditFromRequest } from '../../lib/audit';
import { admissionExamService } from './admission-exam.service';
import { CreateAdmissionExamDto } from './admission-exam.dto';

export const admissionExamController = {
  list: async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await admissionExamService.list());
  },
  create: async (req: AuthRequest, res: Response) => {
    const exam = await admissionExamService.create(
      req.body as CreateAdmissionExamDto,
      req.user!.userId
    );
    await writeAuditFromRequest(req, 'ADMISSION_EXAM_CREATED', 'AdmissionExam', exam.id, undefined, exam);
    sendSuccess(res, exam, 201);
  },
};
