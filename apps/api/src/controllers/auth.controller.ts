import { Hono } from 'hono';
import { validateJson } from '../middlewares/validate.js';
import { AuthService } from '../services/auth.service.js';
import { ok, created, fail } from '../utils/response.js';
import { requireAuth } from '../middlewares/auth.js';
import { RegisterSchema, LoginSchema, RefreshTokenSchema, UpdateProfileSchema, ERROR_CODES } from '@edgecart/shared';
import type { Env } from '../types/env.js';

export const authRouter = new Hono<{ Bindings: Env }>();

authRouter.post('/register', validateJson(RegisterSchema), async (c) => {
  const input = c.req.valid('json');
  const service = new AuthService(c.env);
  try {
    const data = await service.register(input);
    return created(c, data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Đăng ký thất bại';
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
  }
});

authRouter.post('/login', validateJson(LoginSchema), async (c) => {
  const input = c.req.valid('json');
  const service = new AuthService(c.env);
  try {
    const data = await service.login(input);
    return ok(c, data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Đăng nhập thất bại';
    if (msg.includes('bị khóa')) {
      return fail(c, 403, ERROR_CODES.ACCOUNT_LOCKED, msg);
    }
    return fail(c, 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS, msg);
  }
});

authRouter.post('/refresh', validateJson(RefreshTokenSchema), async (c) => {
  const { refreshToken } = c.req.valid('json');
  const service = new AuthService(c.env);
  try {
    const data = await service.refresh(refreshToken);
    return ok(c, data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể làm mới phiên';
    return fail(c, 401, ERROR_CODES.AUTH_TOKEN_EXPIRED, msg);
  }
});

authRouter.post('/logout', requireAuth(), async (c) => {
  const user = c.get('user' as any);
  const body = await c.req.json().catch(() => ({}));
  const service = new AuthService(c.env);
  await service.logout(user.sub, typeof body?.refreshToken === 'string' ? body.refreshToken : undefined);
  return ok(c, { message: 'Đăng xuất thành công' });
});

authRouter.get('/me', requireAuth(), async (c) => {
  const user = c.get('user' as any);
  const service = new AuthService(c.env);
  try {
    const profile = await service.getProfile(user.sub);
    return ok(c, profile);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không tìm thấy người dùng';
    return fail(c, 404, ERROR_CODES.RESOURCE_NOT_FOUND, msg);
  }
});

authRouter.put('/profile', requireAuth(), validateJson(UpdateProfileSchema), async (c) => {
  const user = c.get('user' as any);
  const input = c.req.valid('json');
  const service = new AuthService(c.env);
  try {
    const updated = await service.updateProfile(user.sub, input);
    return ok(c, updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cập nhật hồ sơ thất bại';
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
  }
});

authRouter.put('/me', requireAuth(), validateJson(UpdateProfileSchema), async (c) => {
  const user = c.get('user' as any);
  const input = c.req.valid('json');
  const service = new AuthService(c.env);
  try {
    const updated = await service.updateProfile(user.sub, input);
    return ok(c, updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cập nhật hồ sơ thất bại';
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, msg);
  }
});
