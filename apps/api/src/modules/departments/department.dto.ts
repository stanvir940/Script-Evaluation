import { z } from 'zod';

export const createDepartmentSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1),
});

export type CreateDepartmentDto = z.infer<typeof createDepartmentSchema>;
