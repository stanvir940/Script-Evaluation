import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { sendSuccess } from '../../lib/response';
import { writeAuditFromRequest } from '../../lib/audit';
import { userService } from './user.service';
import { CreateUserDto, UpdateUserDto } from './user.dto';

export class UserController {
  constructor(private readonly service = userService) {}

  list = async (_req: AuthRequest, res: Response): Promise<void> => {
    const users = await this.service.list();
    sendSuccess(res, users);
  };

  create = async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await this.service.create(req.body as CreateUserDto);
    await writeAuditFromRequest(req, 'USER_CREATED', 'User', user.id, undefined, {
      employeeId: user.employeeId,
      role: user.role,
    });
    sendSuccess(res, user, 201);
  };

  update = async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await this.service.update(String(req.params.id), req.body as UpdateUserDto);
    await writeAuditFromRequest(req, 'USER_UPDATED', 'User', user.id, undefined, req.body);
    sendSuccess(res, user);
  };
}

export const userController = new UserController();
