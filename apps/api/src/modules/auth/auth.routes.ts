import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import * as authService from './auth.service';

const router = Router();

const loginSchema = z.object({
  employeeId: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

router.post('/login', validateBody(loginSchema), async (req, res: Response) => {
  try {
    const tokens = await authService.login(req.body.employeeId, req.body.password);
    res.json({ success: true, data: tokens });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

router.post('/refresh', validateBody(refreshSchema), async (req, res: Response) => {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.json({ success: true, data: result });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
});

router.post('/logout', validateBody(refreshSchema), async (req, res: Response) => {
  await authService.logout(req.body.refreshToken);
  res.json({ success: true });
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await authService.getMe(req.user!.userId);
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  res.json({ success: true, data: user });
});

export default router;
