import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ERROR_CODES, type ApiResponse } from '@edgecart/shared';

export class AppError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function ok<T>(c: Context, data: T, meta?: ApiResponse['meta']) {
  const body: ApiResponse<T> = {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };
  return c.json(body, 200);
}

export function created<T>(c: Context, data: T) {
  const body: ApiResponse<T> = {
    success: true,
    data,
  };
  return c.json(body, 201);
}

export function fail(c: Context, status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
  const body: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
  return c.json(body, status);
}

export function handleServiceError(c: Context, err: unknown, fallbackMessage = 'Yêu cầu không hợp lệ') {
  if (err instanceof AppError) {
    return fail(c, err.status, err.code, err.message, err.details);
  }
  const msg = err instanceof Error ? err.message : fallbackMessage;
  return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
}
