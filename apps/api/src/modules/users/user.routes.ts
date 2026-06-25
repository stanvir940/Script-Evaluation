import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { User, Subject } from '../../models';

const router = Router();

router.get('/subjects', authenticate, async (_req: AuthRequest, res: Response) => {
  const subjects = await Subject.find({ isActive: true });
  res.json({
    success: true,
    data: subjects.map((s) => ({ id: s._id.toString(), code: s.code, name: s.name })),
  });
});

router.get('/', authenticate, authorize('SUPER_ADMIN'), async (_req: AuthRequest, res: Response) => {
  const users = await User.find().select('-passwordHash').populate('subjects', 'code name');
  res.json({ success: true, data: users });
});

const createUserSchema = z.object({
  employeeId: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(['SUPER_ADMIN', 'TEACHER', 'HEAD_EXAMINER']),
  subjectIds: z.array(z.string()).optional(),
});

router.post('/', authenticate, authorize('SUPER_ADMIN'), validateBody(createUserSchema), async (req: AuthRequest, res: Response) => {
  const passwordHash = await bcrypt.hash(req.body.password, 12);
  const user = await User.create({
    employeeId: req.body.employeeId,
    name: req.body.name,
    passwordHash,
    role: req.body.role,
    subjects: req.body.subjectIds || [],
  });

  res.status(201).json({
    success: true,
    data: {
      id: user._id.toString(),
      employeeId: user.employeeId,
      name: user.name,
      role: user.role,
    },
  });
});

export default router;
