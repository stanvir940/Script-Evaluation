import { z } from "zod";

export const createUserSchema = z.object({
  employeeId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional(),
  password: z.string().min(6),
  role: z.enum(["SUPER_ADMIN", "HEAD_EXAMINER", "TEACHER"]),
  subjectIds: z.array(z.string()).optional().default([]),
  departmentIds: z.array(z.string()).optional().default([]),
  isActive: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["SUPER_ADMIN", "HEAD_EXAMINER", "TEACHER"]).optional(),
  isActive: z.boolean().optional(),
  subjectIds: z.array(z.string()).optional(),
  departmentIds: z.array(z.string()).optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
