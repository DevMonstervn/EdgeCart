import { Hono } from 'hono';
import { validateJson } from '../middlewares/validate.js';
import { CheckoutService } from '../services/checkout.service.js';
import { created, fail } from '../utils/response.js';
import { resolveOptionalAuthUser } from '../middlewares/auth.js';
import { CheckoutSchema, ERROR_CODES } from '@edgecart/shared';
import type { Env } from '../types/env.js';

export const checkoutRouter = new Hono<{ Bindings: Env }>();

checkoutRouter.post('/', validateJson(CheckoutSchema), async (c) => {
  const input = c.req.valid('json');
  const idempotencyKey = c.req.header('Idempotency-Key') || null;
  const sessionId = c.req.header('X-Session-Id') || null;

  const { userId, email, locked, invalidToken } = await resolveOptionalAuthUser(c);
  if (invalidToken) {
    return fail(c, 401, ERROR_CODES.AUTH_TOKEN_EXPIRED, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
  }
  if (locked) {
    return fail(c, 403, ERROR_CODES.ACCOUNT_LOCKED, 'Tài khoản của bạn đã bị khóa hoặc vô hiệu hóa');
  }
  if (!userId || !email) {
    return fail(c, 401, ERROR_CODES.AUTH_UNAUTHORIZED, 'Vui lòng đăng nhập tài khoản để đặt hàng');
  }

  const userEmail = email;

  const service = new CheckoutService(c.env);
  try {
    const result = await service.processCheckout(userId, userEmail, input, idempotencyKey, sessionId);
    return created(c, result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Đặt hàng không thành công';
    if (msg.toLowerCase().includes('tồn kho') || msg.toLowerCase().includes('stock')) {
      return fail(c, 409, ERROR_CODES.INSUFFICIENT_STOCK, msg);
    }
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
  }
});
