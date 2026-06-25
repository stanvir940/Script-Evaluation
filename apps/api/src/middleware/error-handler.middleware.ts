import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors';
import { sendError } from '../lib/response';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.message);
    return;
  }

  console.error('[Unhandled Error]', err);
  sendError(res, 500, 'Internal server error');
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
