import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { sendSuccess } from '../../lib/response';
import { authService } from './auth.service';
import { LoginDto, RefreshDto } from './auth.dto';

export class AuthController {
  constructor(private readonly service = authService) {}

  login = async (req: AuthRequest, res: Response): Promise<void> => {
    const tokens = await this.service.login(req.body as LoginDto);
    sendSuccess(res, tokens);
  };

  refresh = async (req: AuthRequest, res: Response): Promise<void> => {
    const { refreshToken } = req.body as RefreshDto;
    const result = await this.service.refresh(refreshToken);
    sendSuccess(res, result);
  };

  logout = async (req: AuthRequest, res: Response): Promise<void> => {
    const { refreshToken } = req.body as RefreshDto;
    await this.service.logout(refreshToken);
    sendSuccess(res, { loggedOut: true });
  };

  me = async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await this.service.getMe(req.user!.userId);
    sendSuccess(res, user);
  };
}

export const authController = new AuthController();
