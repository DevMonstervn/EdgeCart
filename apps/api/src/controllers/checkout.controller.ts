import { Hono } from 'hono';
import { validateJson } from '../middlewares/validate.js';
import { CheckoutService } from '../services/checkout.service.js';
import { created, fail } from '../utils/response.js';
import { verifyJwt } from '../utils/jwt.js';
import { CheckoutSchema, ERROR_CODES } from '@edgecart/shared';
import type { Env } from '../types/env.js';

export const checkoutRouter = new Hono<{ Bindings: Env }>();

checkoutRouter.post('/', validateJson(CheckoutSchema), async (c) => {
  const input = c.req.valid('json');
  const idempotencyKey = c.req.header('Idempotency-Key') || null;

  let userId: string | null = null;
  let userEmail = 'guest@edgecart.com';

  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    if (payload) {
      userId = payload.sub;
      userEmail = payload.email;
    }
  }

  const service = new CheckoutService(c.env);
  try {
    const result = await service.processCheckout(userId, userEmail, input, idempotencyKey);
    return created(c, result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Đặt hàng không thành công';
    if (msg.toLowerCase().includes('tồn kho') || msg.toLowerCase().includes('stock')) {
      return fail(c, 409, ERROR_CODES.INSUFFICIENT_STOCK, msg);
    }
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
  }
});
