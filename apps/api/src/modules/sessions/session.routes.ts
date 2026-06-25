import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { sessionController } from './session.controller';
import { createSessionSchema } from './session.dto';

const router = Router();

router.get('/', authenticate, asyncHandler(sessionController.list));
router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN'),
  validateBody(createSessionSchema),
  asyncHandler(sessionController.create)
);

export default router;
