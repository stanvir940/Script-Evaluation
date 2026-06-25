import { z } from 'zod';

export const createSessionSchema = z.object({
  examId: z.string().min(1),
  name: z.string().min(1),
  moderationThreshold: z.number().min(0).default(3),
  sCodePrefix: z.string().min(1),
  evaluationDeadline: z.string().datetime().optional(),
});

export type CreateSessionDto = z.infer<typeof createSessionSchema>;
