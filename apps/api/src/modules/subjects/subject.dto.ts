import { z } from 'zod';

export const createSubjectSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1),
  departmentId: z.string().optional(),
});

export type CreateSubjectDto = z.infer<typeof createSubjectSchema>;
