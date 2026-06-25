import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { subjectController } from './subject.controller';
import { createSubjectSchema } from './subject.dto';

const router = Router();

router.get('/', authenticate, asyncHandler(subjectController.list));
router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN'),
  validateBody(createSubjectSchema),
  asyncHandler(subjectController.create)
);

export default router;
