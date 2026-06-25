import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { authController } from './auth.controller';
import { loginSchema, refreshSchema } from './auth.dto';

const router = Router();

router.post('/login', validateBody(loginSchema), asyncHandler(authController.login));
router.post('/refresh', validateBody(refreshSchema), asyncHandler(authController.refresh));
router.post('/logout', validateBody(refreshSchema), asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.me));

export default router;
