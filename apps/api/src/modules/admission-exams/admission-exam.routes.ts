import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { admissionExamController } from './admission-exam.controller';
import { createAdmissionExamSchema } from './admission-exam.dto';

const router = Router();

router.use(authenticate, authorize('SUPER_ADMIN'));

router.get('/', asyncHandler(admissionExamController.list));
router.post('/', validateBody(createAdmissionExamSchema), asyncHandler(admissionExamController.create));

export default router;
