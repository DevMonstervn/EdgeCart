import { Hono } from 'hono';
import { requireAuth, type AuthContextVariables } from '../middlewares/auth.js';
import { validateJson } from '../middlewares/validate.js';
import { AddressService } from '../services/address.service.js';
import { ok, fail, created } from '../utils/response.js';
import { AddressSchema, ERROR_CODES } from '@edgecart/shared';
import type { Env } from '../types/env.js';

export const addressRouter = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();

// All address operations require authentication
addressRouter.use('*', requireAuth());

// GET /api/v1/addresses - List user's saved addresses
addressRouter.get('/', async (c) => {
  const user = c.get('user');
  const service = new AddressService(c.env);
  try {
    const addresses = await service.getAddresses(user.sub);
    return ok(c, addresses);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể tải danh sách địa chỉ';
    return fail(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, msg);
  }
});

// POST /api/v1/addresses - Create new address
addressRouter.post('/', validateJson(AddressSchema), async (c) => {
  const user = c.get('user');
  const input = c.req.valid('json');
  const service = new AddressService(c.env);
  try {
    const newAddress = await service.createAddress(user.sub, input);
    return created(c, newAddress);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể tạo địa chỉ mới';
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
  }
});

// PUT /api/v1/addresses/:id - Update address
addressRouter.put('/:id', validateJson(AddressSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const input = c.req.valid('json');
  const service = new AddressService(c.env);
  try {
    const updated = await service.updateAddress(user.sub, id, input);
    return ok(c, updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể cập nhật địa chỉ';
    const status = msg.includes('không có quyền') || msg.includes('không tồn tại') ? 404 : 400;
    return fail(c, status, ERROR_CODES.RESOURCE_NOT_FOUND, msg);
  }
});

// PATCH /api/v1/addresses/:id/default - Set as default address
addressRouter.patch('/:id/default', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const service = new AddressService(c.env);
  try {
    const updated = await service.setDefaultAddress(user.sub, id);
    return ok(c, updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể đặt làm địa chỉ mặc định';
    const status = msg.includes('không có quyền') || msg.includes('không tồn tại') ? 404 : 400;
    return fail(c, status, ERROR_CODES.RESOURCE_NOT_FOUND, msg);
  }
});

// DELETE /api/v1/addresses/:id - Delete address
addressRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const service = new AddressService(c.env);
  try {
    const result = await service.deleteAddress(user.sub, id);
    return ok(c, {
      message: 'Đã xóa địa chỉ thành công',
      newDefaultId: result.newDefaultId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể xóa địa chỉ';
    const status = msg.includes('không có quyền') || msg.includes('không tồn tại') ? 404 : 400;
    return fail(c, status, ERROR_CODES.RESOURCE_NOT_FOUND, msg);
  }
});
