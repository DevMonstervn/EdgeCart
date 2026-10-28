import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiResponse } from '@edgecart/shared';

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
