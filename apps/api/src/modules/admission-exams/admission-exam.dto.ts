import { z } from 'zod';

export const createAdmissionExamSchema = z.object({
  name: z.string().min(1),
  institutionId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
});

export type CreateAdmissionExamDto = z.infer<typeof createAdmissionExamSchema>;
