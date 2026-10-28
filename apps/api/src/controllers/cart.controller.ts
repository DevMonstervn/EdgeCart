import { Hono } from 'hono';
import { validateJson } from '../middlewares/validate.js';
import { CartService } from '../services/cart.service.js';
import { ok, fail } from '../utils/response.js';
import { verifyJwt } from '../utils/jwt.js';
import { CartItemAddSchema, CartItemUpdateSchema, CartMergeSchema, ERROR_CODES } from '@edgecart/shared';
import type { Env } from '../types/env.js';

export const cartRouter = new Hono<{ Bindings: Env }>();

// Helper to extract optional auth or session
async function getUserIdAndSession(c: any) {
  let userId: string | null = null;
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    if (payload) userId = payload.sub;
  }

  const sessionId = c.req.header('X-Session-Id') || 'guest_session';
  return { userId, sessionId };
}

cartRouter.get('/', async (c) => {
  const { userId, sessionId } = await getUserIdAndSession(c);
  const service = new CartService(c.env);
  const cart = await service.getCart(userId, sessionId);
  return ok(c, cart);
});

cartRouter.post('/items', validateJson(CartItemAddSchema), async (c) => {
  const { userId, sessionId } = await getUserIdAndSession(c);
  const { variantId, quantity } = c.req.valid('json');
  const service = new CartService(c.env);
  try {
    const cart = await service.addItem(userId, sessionId, variantId, quantity);
    return ok(c, cart);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể thêm vào giỏ hàng';
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
  }
});

cartRouter.patch('/items/:itemId', validateJson(CartItemUpdateSchema), async (c) => {
  const { userId, sessionId } = await getUserIdAndSession(c);
  const itemId = c.req.param('itemId');
  const { quantity } = c.req.valid('json');
  const service = new CartService(c.env);
  try {
    const cart = await service.updateQuantity(userId, sessionId, itemId, quantity);
    return ok(c, cart);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể cập nhật số lượng';
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
  }
});

cartRouter.delete('/items/:itemId', async (c) => {
  const { userId, sessionId } = await getUserIdAndSession(c);
  const itemId = c.req.param('itemId');
  const service = new CartService(c.env);
  const cart = await service.removeItem(userId, sessionId, itemId);
  return ok(c, cart);
});

cartRouter.post('/merge', validateJson(CartMergeSchema), async (c) => {
  const { userId } = await getUserIdAndSession(c);
  if (!userId) {
    return fail(c, 401, ERROR_CODES.AUTH_UNAUTHORIZED, 'Yêu cầu đăng nhập để gộp giỏ hàng');
  }

  const { guestItems } = c.req.valid('json');
  const service = new CartService(c.env);
  const cart = await service.mergeCart(userId, guestItems);
  return ok(c, cart);
});
