import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { departmentController } from './department.controller';
import { createDepartmentSchema } from './department.dto';

const router = Router();

router.get('/', authenticate, asyncHandler(departmentController.list));
router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN'),
  validateBody(createDepartmentSchema),
  asyncHandler(departmentController.create)
);

export default router;
