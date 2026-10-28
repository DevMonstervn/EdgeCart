import type { Context, MiddlewareHandler } from 'hono';
import { verifyJwt } from '../utils/jwt.js';
import { fail } from '../utils/response.js';
import { ERROR_CODES, type UserRole, type StoreStatus } from '@edgecart/shared';
import type { Env, JwtPayload } from '../types/env.js';

export interface AuthenticatedUser extends JwtPayload {
  isSeller: boolean;
  status: string;
}

export interface VerifiedStore {
  id: string;
  ownerUserId: string;
  name: string;
  slug: string;
  status: StoreStatus;
}

export interface AuthContextVariables {
  user: AuthenticatedUser;
  store?: VerifiedStore;
}

interface DbAuthUserRow {
  id: string;
  email: string;
  role: string;
  status: string;
  is_seller: number;
}

interface DbVerifiedStoreRow {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string;
  status: string;
}

export const requireAuth = (
  allowedRoles?: UserRole[]
): MiddlewareHandler<{ Bindings: Env; Variables: AuthContextVariables }> => {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return fail(c, 401, ERROR_CODES.AUTH_UNAUTHORIZED, 'Yêu cầu đăng nhập để tiếp tục');
    }

    const token = authHeader.substring(7).trim();
    const payload = await verifyJwt(token, c.env.JWT_SECRET);

    if (!payload) {
      return fail(c, 401, ERROR_CODES.AUTH_TOKEN_EXPIRED, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }

    // Fast KV revocation check
    if (c.env.KV) {
      const revoked = await c.env.KV.get(`revoked_user:${payload.sub}`, 'text');
      if (revoked) {
        return fail(c, 403, ERROR_CODES.ACCOUNT_LOCKED, 'Tài khoản của bạn đã bị khóa hoặc vô hiệu hóa');
      }
    }

    // Authoritative D1 account status & role verification
    const dbUser = await c.env.DB.prepare(
      'SELECT id, email, role, status, is_seller FROM users WHERE id = ? LIMIT 1'
    )
      .bind(payload.sub)
      .first<DbAuthUserRow>();

    if (!dbUser) {
      return fail(c, 401, ERROR_CODES.AUTH_UNAUTHORIZED, 'Tài khoản không tồn tại hoặc không hợp lệ');
    }

    if (dbUser.status !== 'ACTIVE') {
      return fail(c, 403, ERROR_CODES.ACCOUNT_LOCKED, 'Tài khoản của bạn đã bị khóa hoặc vô hiệu hóa');
    }

    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(dbUser.role as UserRole)) {
        return fail(c, 403, ERROR_CODES.FORBIDDEN_ACCESS, 'Bạn không có quyền thực hiện thao tác này');
      }
    }

    c.set('user', {
      ...payload,
      email: dbUser.email,
      role: dbUser.role,
      isSeller: dbUser.is_seller === 1,
      status: dbUser.status,
    });
    await next();
  };
};

export const requireSeller = (): MiddlewareHandler<{ Bindings: Env; Variables: AuthContextVariables }> => {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return fail(c, 401, ERROR_CODES.AUTH_UNAUTHORIZED, 'Yêu cầu đăng nhập để tiếp tục');
    }

    if (!user.isSeller) {
      return fail(c, 403, ERROR_CODES.SELLER_NOT_APPROVED, 'Tài khoản của bạn chưa được phê duyệt quyền Người bán');
    }

    // Resolve store strictly from D1 using authenticated user.sub (never trust client store_id)
    const storeRow = await c.env.DB.prepare(
      'SELECT id, owner_user_id, name, slug, status FROM stores WHERE owner_user_id = ? LIMIT 1'
    )
      .bind(user.sub)
      .first<DbVerifiedStoreRow>();

    if (!storeRow) {
      return fail(c, 403, ERROR_CODES.SELLER_NOT_APPROVED, 'Không tìm thấy cửa hàng gắn với tài khoản của bạn');
    }

    if (storeRow.status === 'SUSPENDED') {
      return fail(c, 403, ERROR_CODES.STORE_SUSPENDED, 'Cửa hàng của bạn đang bị tạm đình chỉ hoạt động');
    }

    if (storeRow.status !== 'ACTIVE') {
      return fail(c, 403, ERROR_CODES.FORBIDDEN_ACCESS, 'Cửa hàng của bạn hiện không ở trạng thái hoạt động');
    }

    c.set('store', {
      id: storeRow.id,
      ownerUserId: storeRow.owner_user_id,
      name: storeRow.name,
      slug: storeRow.slug,
      status: storeRow.status as StoreStatus,
    });

    await next();
  };
};

export async function resolveOptionalAuthUser(
  c: Context<{ Bindings: Env }>
): Promise<{ userId: string | null; email: string | null; locked: boolean; invalidToken: boolean }> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { userId: null, email: null, locked: false, invalidToken: false };
  }

  const token = authHeader.substring(7).trim();
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) {
    return { userId: null, email: null, locked: false, invalidToken: true };
  }

  if (c.env.KV) {
    const revoked = await c.env.KV.get(`revoked_user:${payload.sub}`, 'text');
    if (revoked) {
      return { userId: null, email: null, locked: true, invalidToken: false };
    }
  }

  const dbUser = await c.env.DB.prepare('SELECT id, email, status FROM users WHERE id = ? LIMIT 1')
    .bind(payload.sub)
    .first<{ id: string; email: string; status: string }>();

  if (!dbUser) {
    return { userId: null, email: null, locked: false, invalidToken: true };
  }

  if (dbUser.status !== 'ACTIVE') {
    return { userId: null, email: null, locked: true, invalidToken: false };
  }

  return { userId: dbUser.id, email: dbUser.email, locked: false, invalidToken: false };
}
