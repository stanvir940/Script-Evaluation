import { Response } from 'express';
import { ApiResponse } from '@dasems/shared-types';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200, meta?: Record<string, unknown>): void {
  const body: ApiResponse<T> = { success: true, data };
  if (meta) body.meta = meta;
  res.status(statusCode).json(body);
}

export function sendError(res: Response, statusCode: number, error: string): void {
  res.status(statusCode).json({ success: false, error } satisfies ApiResponse);
}
