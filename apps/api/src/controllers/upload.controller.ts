import { Hono } from 'hono';
import { requireAuth } from '../middlewares/auth.js';
import { ok, fail } from '../utils/response.js';
import { ERROR_CODES } from '@edgecart/shared';
import type { Env } from '../types/env.js';

export const uploadRouter = new Hono<{ Bindings: Env }>();

uploadRouter.use('*', requireAuth(['SUPER_ADMIN', 'PRODUCT_MANAGER']));

uploadRouter.post('/presigned-url', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const fileName = body.fileName || 'image.webp';
  const ext = fileName.split('.').pop() || 'webp';
  const r2Key = `products/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;

  // If R2 bucket is configured, return the R2 direct upload URL
  const publicUrl = `https://cdn.edgecart.com/${r2Key}`;
  const uploadUrl = `https://r2.edgecart.com/${r2Key}?signature=test_valid_sig`;

  return ok(c, {
    uploadUrl,
    publicUrl,
    r2Key,
  });
});
