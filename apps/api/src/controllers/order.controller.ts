import { Hono } from 'hono';
import { OrderService } from '../services/order.service.js';
import { ok, fail } from '../utils/response.js';
import { requireAuth } from '../middlewares/auth.js';
import { ERROR_CODES } from '@edgecart/shared';
import type { Env } from '../types/env.js';

export const orderRouter = new Hono<{ Bindings: Env }>();

orderRouter.use('*', requireAuth());

orderRouter.get('/', async (c) => {
  const user = c.get('user' as any);
  const service = new OrderService(c.env);
  const orders = await service.getUserOrders(user.sub);
  return ok(c, orders);
});

orderRouter.get('/:id', async (c) => {
  const user = c.get('user' as any);
  const id = c.req.param('id');
  const service = new OrderService(c.env);
  try {
    const order = await service.getOrderById(id, user.sub);
    return ok(c, order);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không tìm thấy đơn hàng';
    return fail(c, 404, ERROR_CODES.RESOURCE_NOT_FOUND, msg);
  }
});

orderRouter.post('/:id/cancel', async (c) => {
  const user = c.get('user' as any);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const service = new OrderService(c.env);
  try {
    await service.cancelOrder(id, user.sub, body.reason);
    return ok(c, { message: 'Đã hủy đơn hàng thành công' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể hủy đơn hàng';
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
  }
});
