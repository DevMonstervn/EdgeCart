import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import { ERROR_CODES } from '@edgecart/shared';
import { AppError, fail } from '../utils/response.js';
import type { Env } from '../types/env.js';

export const errorHandler: ErrorHandler<{ Bindings: Env }> = (err, c) => {
  if (err instanceof AppError) {
    return fail(c, err.status, err.code, err.message, err.details);
  }

  console.error('[Unhandled Error]:', err);

  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Dữ liệu đầu vào không hợp lệ',
          details: err.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      422
    );
  }

  return c.json(
    {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: err.message || 'Lỗi hệ thống máy chủ nội bộ',
      },
    },
    500
  );
};
