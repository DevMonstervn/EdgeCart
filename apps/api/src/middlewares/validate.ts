import { zValidator } from '@hono/zod-validator';
import type { ZodTypeAny } from 'zod';
import { ERROR_CODES } from '@edgecart/shared';

export const validateJson = <T extends ZodTypeAny>(schema: T) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Dữ liệu đầu vào không hợp lệ',
            details: result.error.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        422
      );
    }
  });
