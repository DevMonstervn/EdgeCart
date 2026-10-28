import { Hono } from 'hono';
import { CreateSellerRequestSchema } from '@edgecart/shared';
import { requireAuth, type AuthContextVariables } from '../middlewares/auth.js';
import { validateJson } from '../middlewares/validate.js';
import { StoreService } from '../services/store.service.js';
import { ok, created, handleServiceError } from '../utils/response.js';
import type { Env } from '../types/env.js';

export const storeRouter = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();

// 1. Public Storefront Page: GET /api/v1/stores/:slug
storeRouter.get('/stores/:slug', async (c) => {
  const slug = c.req.param('slug');
  const query = c.req.query();
  const page = query.page ? Math.max(1, Number(query.page) || 1) : 1;
  const limit = query.limit ? Math.min(50, Math.max(1, Number(query.limit) || 20)) : 20;
  const sort =
    query.sort === 'price_asc' || query.sort === 'price_desc' || query.sort === 'popular'
      ? query.sort
      : 'newest';

  const service = new StoreService(c.env);
  try {
    const result = await service.getPublicStoreBySlug(slug, {
      page,
      limit,
      q: query.q,
      sort,
    });
    return ok(
      c,
      {
        store: result.store,
        products: result.products,
      },
      result.meta
    );
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải thông tin cửa hàng');
  }
});

// 2. Submit Application to Become Seller: POST /api/v1/seller-requests
storeRouter.post(
  '/seller-requests',
  requireAuth(['CUSTOMER']),
  validateJson(CreateSellerRequestSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    const service = new StoreService(c.env);
    try {
      const request = await service.submitSellerRequest(user.sub, input);
      return created(c, request);
    } catch (err: unknown) {
      return handleServiceError(c, err, 'Không thể gửi yêu cầu mở cửa hàng');
    }
  }
);

// 3. View Own Seller Request Status & Store Info: GET /api/v1/seller-requests/me
storeRouter.get('/seller-requests/me', requireAuth(['CUSTOMER']), async (c) => {
  const user = c.get('user');
  const service = new StoreService(c.env);
  try {
    const result = await service.getMySellerRequests(user.sub);
    return ok(c, result);
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể tải trạng thái yêu cầu mở cửa hàng');
  }
});
