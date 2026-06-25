import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { auditController } from './audit.controller';

const router = Router();

router.use(authenticate, authorize('SUPER_ADMIN'));
router.get('/', asyncHandler(auditController.list));

export default router;
