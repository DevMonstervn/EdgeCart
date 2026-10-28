import { Hono } from 'hono';
import {
  SellerInventoryAdjustSchema,
  SellerProductCreateSchema,
  SellerProductUpdateSchema,
  UpdateOrderStatusSchema,
  UpdateStoreSchema,
} from '@edgecart/shared';
import { requireAuth, requireSeller, type AuthContextVariables } from '../middlewares/auth.js';
import { validateJson } from '../middlewares/validate.js';
import { SellerService } from '../services/seller.service.js';
import { ok, created, handleServiceError } from '../utils/response.js';
import type { Env } from '../types/env.js';

export const sellerRouter = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();

// Enforce active user + D1-verified active store ownership on all /api/v1/seller/* endpoints
sellerRouter.use('*', requireAuth(), requireSeller());

// 1. Seller Dashboard Stats
sellerRouter.get('/dashboard/stats', async (c) => {
  const store = c.get('store')!;
  const service = new SellerService(c.env);
  try {
    const stats = await service.getDashboardStats(store.id);
    return ok(c, stats);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải thống kê cửa hàng');
  }
});

// 2. Store Profile
sellerRouter.get('/store', async (c) => {
  const store = c.get('store')!;
  const service = new SellerService(c.env);
  try {
    const profile = await service.getStoreProfile(store.id);
    return ok(c, profile);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải hồ sơ cửa hàng');
  }
});

sellerRouter.put('/store', validateJson(UpdateStoreSchema), async (c) => {
  const store = c.get('store')!;
  const input = c.req.valid('json');
  const service = new SellerService(c.env);
  try {
    const updated = await service.updateStoreProfile(store.id, input);
    return ok(c, updated);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể cập nhật hồ sơ cửa hàng');
  }
});

// 3. Seller Product Management (Strictly scoped to verified store.id)
sellerRouter.get('/products', async (c) => {
  const store = c.get('store')!;
  const query = c.req.query();
  const service = new SellerService(c.env);
  try {
    const result = await service.getProducts(store.id, {
      q: query.q,
      page: query.page ? Math.max(1, Number(query.page) || 1) : 1,
      limit: query.limit ? Math.min(50, Math.max(1, Number(query.limit) || 20)) : 20,
    });
    return ok(c, result.products, result.meta);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải danh sách sản phẩm');
  }
});

sellerRouter.post('/products', validateJson(SellerProductCreateSchema), async (c) => {
  const store = c.get('store')!;
  const input = c.req.valid('json');
  const service = new SellerService(c.env);
  try {
    const product = await service.createProduct(store.id, input);
    return created(c, product);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tạo sản phẩm');
  }
});

sellerRouter.put('/products/:id', validateJson(SellerProductUpdateSchema), async (c) => {
  const store = c.get('store')!;
  const id = c.req.param('id');
  const input = c.req.valid('json');
  const service = new SellerService(c.env);
  try {
    const updated = await service.updateProduct(store.id, id, input);
    return ok(c, updated);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể cập nhật sản phẩm');
  }
});

sellerRouter.delete('/products/:id', async (c) => {
  const store = c.get('store')!;
  const id = c.req.param('id');
  const service = new SellerService(c.env);
  try {
    await service.deleteProduct(store.id, id);
    return ok(c, { message: 'Đã ẩn/xóa sản phẩm thành công' });
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể xóa sản phẩm');
  }
});

// 4. Seller Inventory Management
sellerRouter.get('/inventory', async (c) => {
  const store = c.get('store')!;
  const query = c.req.query();
  const service = new SellerService(c.env);
  try {
    const items = await service.getInventory(store.id, {
      q: query.q,
      lowStockOnly: query.lowStockOnly === 'true',
    });
    return ok(c, items);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải danh sách tồn kho');
  }
});

sellerRouter.post('/inventory/adjust', validateJson(SellerInventoryAdjustSchema), async (c) => {
  const store = c.get('store')!;
  const user = c.get('user');
  const input = c.req.valid('json');
  const service = new SellerService(c.env);
  try {
    await service.adjustInventory(store.id, input, user.sub);
    return ok(c, { message: 'Đã điều chỉnh tồn kho thành công' });
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể điều chỉnh tồn kho');
  }
});

// 5. Seller Order Fulfillment (Strictly scoped to order_items of verified store.id)
sellerRouter.get('/orders', async (c) => {
  const store = c.get('store')!;
  const query = c.req.query();
  const service = new SellerService(c.env);
  try {
    const result = await service.getOrders(store.id, {
      status: query.status,
      page: query.page ? Math.max(1, Number(query.page) || 1) : 1,
      limit: query.limit ? Math.min(50, Math.max(1, Number(query.limit) || 20)) : 20,
    });
    return ok(c, result.orders, result.meta);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải danh sách đơn hàng');
  }
});

sellerRouter.get('/orders/:id', async (c) => {
  const store = c.get('store')!;
  const id = c.req.param('id');
  const service = new SellerService(c.env);
  try {
    const order = await service.getOrderById(store.id, id);
    return ok(c, order);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải chi tiết đơn hàng');
  }
});

sellerRouter.patch('/orders/:id/status', validateJson(UpdateOrderStatusSchema), async (c) => {
  const store = c.get('store')!;
  const user = c.get('user');
  const id = c.req.param('id');
  const input = c.req.valid('json');
  const service = new SellerService(c.env);
  try {
    await service.updateOrderStatus(store.id, id, input.status, input.note, user.sub);
    return ok(c, { message: 'Đã cập nhật trạng thái xử lý đơn hàng' });
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể cập nhật trạng thái đơn hàng');
  }
});
