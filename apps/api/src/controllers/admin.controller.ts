import { Hono } from 'hono';
import {
  ReviewSellerRequestSchema,
  SellerInventoryAdjustSchema,
  SellerProductUpdateSchema,
  UpdateOrderStatusSchema,
  UpdateStoreStatusSchema,
  UpdateUserRoleSchema,
  UpdateUserStatusSchema,
  type UserRole,
} from '@edgecart/shared';
import { requireAuth, type AuthContextVariables } from '../middlewares/auth.js';
import { validateJson } from '../middlewares/validate.js';
import { AdminService } from '../services/admin.service.js';
import { ok, created, handleServiceError } from '../utils/response.js';
import type { Env } from '../types/env.js';

export const adminRouter = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
}

// 1. Dashboard Overview — Accessible to all internal staff roles
adminRouter.get(
  '/dashboard/stats',
  requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER', 'ORDER_OPERATOR']),
  async (c) => {
    const service = new AdminService(c.env);
    const stats = await service.getDashboardStats();
    return ok(c, stats);
  }
);

// 2. Product & Category Management — SUPER_ADMIN & PRODUCT_MANAGER only
adminRouter.get('/products', requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']), async (c) => {
  const user = c.get('user');
  const query = c.req.query();
  const service = new AdminService(c.env);
  try {
    const result = await service.getAdminProducts(
      {
        q: query.q,
        scope: query.scope === 'system' ? 'system' : 'all',
        storeId: query.storeId,
        includeInactive: query.includeInactive !== 'false',
        page: query.page ? Math.max(1, Number(query.page) || 1) : 1,
        limit: query.limit ? Math.min(50, Math.max(1, Number(query.limit) || 20)) : 20,
      },
      user.role as UserRole
    );
    return ok(c, result.products, result.meta);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải danh sách sản phẩm');
  }
});

adminRouter.post('/products', requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const service = new AdminService(c.env);
  try {
    const product = await service.createProduct(body);
    return created(c, product);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tạo sản phẩm');
  }
});

adminRouter.put(
  '/products/:id',
  requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']),
  validateJson(SellerProductUpdateSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const service = new AdminService(c.env);
    try {
      const updated = await service.updateProduct(id, input, user.role as UserRole);
      return ok(c, updated);
    } catch (err: unknown) {
      return handleServiceError(c, err, 'Không thể cập nhật sản phẩm');
    }
  }
);

adminRouter.delete('/products/:id', requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const service = new AdminService(c.env);
  try {
    await service.deleteProduct(id, user.role as UserRole);
    return ok(c, { message: 'Đã xóa sản phẩm thành công' });
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể xóa sản phẩm');
  }
});

adminRouter.get('/categories', requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']), async (c) => {
  const service = new AdminService(c.env);
  try {
    const categories = await service.getCategories(true);
    return ok(c, categories);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải danh sách danh mục');
  }
});

adminRouter.post('/categories', requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const service = new AdminService(c.env);
  try {
    const category = await service.createCategory(body);
    return created(c, category);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tạo danh mục');
  }
});

adminRouter.put('/categories/:id', requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const service = new AdminService(c.env);
  try {
    const category = await service.updateCategory(id, body);
    return ok(c, category);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể cập nhật danh mục');
  }
});

adminRouter.patch('/categories/:id/status', requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const service = new AdminService(c.env);
  try {
    const category = await service.toggleCategoryActive(id, body.isActive === true || body.isActive === 1);
    return ok(c, category);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể thay đổi trạng thái danh mục');
  }
});

adminRouter.delete('/categories/:id', requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']), async (c) => {
  const id = c.req.param('id');
  const service = new AdminService(c.env);
  try {
    await service.deleteCategory(id);
    return ok(c, { message: 'Đã xóa danh mục thành công' });
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể xóa danh mục');
  }
});

// 3. System Inventory Management — SUPER_ADMIN & PRODUCT_MANAGER only
adminRouter.get('/inventory', requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']), async (c) => {
  const user = c.get('user');
  const query = c.req.query();
  const service = new AdminService(c.env);
  try {
    const items = await service.getInventory(
      {
        q: query.q,
        lowStockOnly: query.lowStockOnly === 'true',
        storeId: query.storeId === 'system' ? null : query.storeId,
      },
      user.role as UserRole
    );
    return ok(c, items);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải danh sách tồn kho');
  }
});

adminRouter.post(
  '/inventory/adjust',
  requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']),
  validateJson(SellerInventoryAdjustSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    const service = new AdminService(c.env);
    try {
      await service.adjustInventory(
        input.variantId,
        input.changeQuantity,
        input.type,
        input.notes || 'Admin điều chỉnh tồn kho',
        user.sub,
        user.role as UserRole
      );
      return ok(c, { message: 'Đã cập nhật tồn kho' });
    } catch (err: unknown) {
      return handleServiceError(c, err, 'Không thể điều chỉnh tồn kho');
    }
  }
);

// 4. Platform Order Management — SUPER_ADMIN & ORDER_OPERATOR only
adminRouter.get('/orders', requireAuth(['SUPER_ADMIN', 'ORDER_OPERATOR']), async (c) => {
  const query = c.req.query();
  const service = new AdminService(c.env);
  try {
    const result = await service.getOrders({
      status: query.status,
      page: query.page ? Math.max(1, Number(query.page) || 1) : 1,
      limit: query.limit ? Math.min(50, Math.max(1, Number(query.limit) || 20)) : 20,
    });
    return ok(c, result.orders, result.meta);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải danh sách đơn hàng');
  }
});

adminRouter.get('/orders/:id', requireAuth(['SUPER_ADMIN', 'ORDER_OPERATOR']), async (c) => {
  const id = c.req.param('id');
  const service = new AdminService(c.env);
  try {
    const order = await service.getOrderById(id);
    return ok(c, order);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải chi tiết đơn hàng');
  }
});

adminRouter.patch(
  '/orders/:id/status',
  requireAuth(['SUPER_ADMIN', 'ORDER_OPERATOR']),
  validateJson(UpdateOrderStatusSchema),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const input = c.req.valid('json');
    const service = new AdminService(c.env);
    try {
      await service.updateOrderStatus(id, input.status, input.note, user.sub);
      return ok(c, { message: 'Đã cập nhật trạng thái đơn hàng' });
    } catch (err: unknown) {
      return handleServiceError(c, err, 'Không thể cập nhật trạng thái');
    }
  }
);

// 5. Store Directory & Moderation — View: SUPER_ADMIN & PRODUCT_MANAGER; Mutate: SUPER_ADMIN only
adminRouter.get('/stores', requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']), async (c) => {
  const query = c.req.query();
  const service = new AdminService(c.env);
  try {
    const result = await service.getStores({
      status: query.status,
      q: query.q,
      page: query.page ? Math.max(1, Number(query.page) || 1) : 1,
      limit: query.limit ? Math.min(50, Math.max(1, Number(query.limit) || 20)) : 20,
    });
    return ok(c, result.stores, result.meta);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải danh sách cửa hàng');
  }
});

adminRouter.patch(
  '/stores/:id/status',
  requireAuth(['SUPER_ADMIN']),
  validateJson(UpdateStoreStatusSchema),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const input = c.req.valid('json');
    const service = new AdminService(c.env);
    try {
      const updated = await service.updateStoreStatus(id, input, user.sub, getClientIp(c));
      return ok(c, updated);
    } catch (err: unknown) {
      return handleServiceError(c, err, 'Không thể cập nhật trạng thái cửa hàng');
    }
  }
);

// 6. Seller Request Approval — SUPER_ADMIN ONLY
adminRouter.get('/seller-requests', requireAuth(['SUPER_ADMIN']), async (c) => {
  const query = c.req.query();
  const service = new AdminService(c.env);
  try {
    const result = await service.getSellerRequests({
      status: query.status,
      page: query.page ? Math.max(1, Number(query.page) || 1) : 1,
      limit: query.limit ? Math.min(50, Math.max(1, Number(query.limit) || 20)) : 20,
    });
    return ok(c, result.requests, result.meta);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải danh sách yêu cầu mở cửa hàng');
  }
});

adminRouter.patch(
  '/seller-requests/:id/review',
  requireAuth(['SUPER_ADMIN']),
  validateJson(ReviewSellerRequestSchema),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const input = c.req.valid('json');
    const service = new AdminService(c.env);
    try {
      const result = await service.reviewSellerRequest(id, input, user.sub, getClientIp(c));
      return ok(c, result);
    } catch (err: unknown) {
      return handleServiceError(c, err, 'Không thể xét duyệt yêu cầu mở cửa hàng');
    }
  }
);

// 7. User Account Lock/Unlock & Role Governance — SUPER_ADMIN ONLY
adminRouter.get('/users', requireAuth(['SUPER_ADMIN']), async (c) => {
  const query = c.req.query();
  const service = new AdminService(c.env);
  try {
    const result = await service.getUsers({
      role: query.role,
      status: query.status,
      isSeller: query.isSeller === 'true' ? true : query.isSeller === 'false' ? false : undefined,
      q: query.q,
      page: query.page ? Math.max(1, Number(query.page) || 1) : 1,
      limit: query.limit ? Math.min(50, Math.max(1, Number(query.limit) || 20)) : 20,
    });
    return ok(c, result.users, result.meta);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải danh sách người dùng');
  }
});

adminRouter.patch(
  '/users/:id/status',
  requireAuth(['SUPER_ADMIN']),
  validateJson(UpdateUserStatusSchema),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const input = c.req.valid('json');
    const service = new AdminService(c.env);
    try {
      const updated = await service.updateUserStatus(id, input, user.sub, getClientIp(c));
      return ok(c, updated);
    } catch (err: unknown) {
      return handleServiceError(c, err, 'Không thể cập nhật trạng thái tài khoản');
    }
  }
);

adminRouter.patch(
  '/users/:id/role',
  requireAuth(['SUPER_ADMIN']),
  validateJson(UpdateUserRoleSchema),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const input = c.req.valid('json');
    const service = new AdminService(c.env);
    try {
      const updated = await service.updateUserRole(id, input, user.sub, getClientIp(c));
      return ok(c, updated);
    } catch (err: unknown) {
      return handleServiceError(c, err, 'Không thể cập nhật vai trò người dùng');
    }
  }
);

// 8. Audit Logs — SUPER_ADMIN ONLY
adminRouter.get('/audit-logs', requireAuth(['SUPER_ADMIN']), async (c) => {
  const query = c.req.query();
  const service = new AdminService(c.env);
  try {
    const result = await service.getAuditLogs({
      entity: query.entity,
      action: query.action,
      userId: query.userId,
      page: query.page ? Math.max(1, Number(query.page) || 1) : 1,
      limit: query.limit ? Math.min(100, Math.max(1, Number(query.limit) || 30)) : 30,
    });
    return ok(c, result.logs, result.meta);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải nhật ký kiểm toán');
  }
});
