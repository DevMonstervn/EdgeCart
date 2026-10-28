import { Hono } from 'hono';
import { CatalogService } from '../services/catalog.service.js';
import { ok, fail } from '../utils/response.js';
import { ERROR_CODES, ProductFilterQuerySchema } from '@edgecart/shared';
import type { Env } from '../types/env.js';

export const catalogRouter = new Hono<{ Bindings: Env }>();

catalogRouter.get('/categories', async (c) => {
  const service = new CatalogService(c.env);
  const categories = await service.getCategories();
  c.header('Cache-Control', 'public, max-age=60, s-maxage=1800');
  return ok(c, categories);
});

catalogRouter.get('/products', async (c) => {
  const query = c.req.query();
  const parsed = ProductFilterQuerySchema.safeParse(query);
  const params = parsed.success ? parsed.data : {};

  const service = new CatalogService(c.env);
  const result = await service.getProducts(params);
  c.header('Cache-Control', 'public, max-age=30, s-maxage=300');
  return ok(c, result.products, result.meta);
});

catalogRouter.get('/products/:slug', async (c) => {
  const slug = c.req.param('slug');
  const service = new CatalogService(c.env);
  try {
    const product = await service.getProductBySlug(slug);
    c.header('Cache-Control', 'public, max-age=60, s-maxage=600');
    return ok(c, product);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không tìm thấy sản phẩm';
    return fail(c, 404, ERROR_CODES.RESOURCE_NOT_FOUND, msg);
  }
});
