import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { userController } from './user.controller';
import { createUserSchema, updateUserSchema } from './user.dto';

const router = Router();

router.use(authenticate, authorize('SUPER_ADMIN'));

router.get('/', asyncHandler(userController.list));
router.post('/', validateBody(createUserSchema), asyncHandler(userController.create));
router.patch('/:id', validateBody(updateUserSchema), asyncHandler(userController.update));

export default router;
