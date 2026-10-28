import type { MiddlewareHandler } from 'hono';
import { verifyJwt } from '../utils/jwt.js';
import { fail } from '../utils/response.js';
import { ERROR_CODES, type UserRole } from '@edgecart/shared';
import type { Env, JwtPayload } from '../types/env.js';

export interface AuthContextVariables {
  user: JwtPayload;
}

export const requireAuth = (allowedRoles?: UserRole[]): MiddlewareHandler<{ Bindings: Env; Variables: AuthContextVariables }> => {
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

    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(payload.role as UserRole)) {
        return fail(c, 403, ERROR_CODES.FORBIDDEN_ACCESS, 'Bạn không có quyền thực hiện thao tác này');
      }
    }

    c.set('user', payload);
    await next();
  };
};
