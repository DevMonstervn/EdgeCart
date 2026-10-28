import { Hono } from 'hono';
import { requireAuth } from '../middlewares/auth.js';
import { AdminService } from '../services/admin.service.js';
import { CatalogService } from '../services/catalog.service.js';
import { ok, created, fail } from '../utils/response.js';
import { ERROR_CODES, type OrderStatus } from '@edgecart/shared';
import type { Env } from '../types/env.js';

export const adminRouter = new Hono<{ Bindings: Env }>();

adminRouter.use('*', requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']));

adminRouter.get('/dashboard/stats', async (c) => {
  const service = new AdminService(c.env);
  const stats = await service.getDashboardStats();
  return ok(c, stats);
});

adminRouter.get('/products', async (c) => {
  const query = c.req.query();
  const catalogService = new CatalogService(c.env);
  const result = await catalogService.getProducts({
    q: query.q,
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 20,
  });
  return ok(c, result.products, result.meta);
});

adminRouter.post('/products', async (c) => {
  const body = await c.req.json();
  const service = new AdminService(c.env);
  try {
    const product = await service.createProduct(body);
    return created(c, product);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể tạo sản phẩm';
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
  }
});

adminRouter.delete('/products/:id', async (c) => {
  const id = c.req.param('id');
  const service = new AdminService(c.env);
  await service.deleteProduct(id);
  return ok(c, { message: 'Đã xóa sản phẩm thành công' });
});

adminRouter.get('/orders', async (c) => {
  const query = c.req.query();
  const service = new AdminService(c.env);
  const result = await service.getOrders({
    status: query.status,
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 20,
  });
  return ok(c, result.orders, result.meta);
});

adminRouter.patch('/orders/:id/status', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user' as any);
  const body = await c.req.json();
  const service = new AdminService(c.env);
  try {
    await service.updateOrderStatus(id, body.status as OrderStatus, body.note, user.sub);
    return ok(c, { message: 'Đã cập nhật trạng thái đơn hàng' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể cập nhật trạng thái';
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
  }
});

adminRouter.get('/inventory', async (c) => {
  const query = c.req.query();
  const service = new AdminService(c.env);
  const items = await service.getInventory({
    q: query.q,
    lowStockOnly: query.lowStockOnly === 'true',
  });
  return ok(c, items);
});

adminRouter.post('/inventory/adjust', async (c) => {
  const user = c.get('user' as any);
  const body = await c.req.json();
  const service = new AdminService(c.env);
  try {
    await service.adjustInventory(
      body.variantId,
      body.changeQuantity,
      body.type,
      body.notes,
      user.sub
    );
    return ok(c, { message: 'Đã cập nhật tồn kho' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể điều chỉnh tồn kho';
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
  }
});
