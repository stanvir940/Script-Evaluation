import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { sendSuccess } from '../../lib/response';
import { writeAuditFromRequest } from '../../lib/audit';
import { departmentService } from './department.service';
import { CreateDepartmentDto } from './department.dto';

export const departmentController = {
  list: async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await departmentService.list());
  },
  create: async (req: AuthRequest, res: Response) => {
    const dept = await departmentService.create(req.body as CreateDepartmentDto);
    await writeAuditFromRequest(req, 'DEPARTMENT_CREATED', 'Department', dept.id, undefined, dept);
    sendSuccess(res, dept, 201);
  },
};
