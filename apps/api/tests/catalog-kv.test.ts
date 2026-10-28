import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import type { Env } from '../src/types/env.js';

describe('Catalog & Cloudflare KV Caching / Invalidation Integration Tests', () => {
  let env: Env;

  beforeEach(() => {
    env = createTestEnv();

    // Seed test category
    env.DB.prepare(`
      INSERT INTO categories (id, name, slug, sort_order, is_active)
      VALUES ('cat_ao', 'Áo Thun', 'ao-thun', 1, 1);
    `).run();

    // Seed test product
    env.DB.prepare(`
      INSERT INTO products (id, category_id, name, slug, description, base_price, sale_price, is_active)
      VALUES ('prd_01', 'cat_ao', 'Áo Thun Basic Cotton', 'ao-thun-basic-cotton', 'Mô tả chi tiết', 250000, 199000, 1);
    `).run();

    // Seed test variant with stock 10
    env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES ('var_01', 'prd_01', 'AT-DEN-M', 'Đen / M', 199000, 10, 1);
    `).run();
  });

  it('should fetch categories and store in Cloudflare KV cache', async () => {
    // 1st request -> DB query and write to KV
    const res1 = await app.request('/api/v1/categories', { method: 'GET' }, env);
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as any;
    expect(body1.success).toBe(true);
    expect(body1.data.length).toBe(1);
    expect(body1.data[0].slug).toBe('ao-thun');

    // Verify KV now contains the cache key
    const cachedTree = await env.KV.get('cache:categories:tree');
    expect(cachedTree).not.toBeNull();
    expect(cachedTree).toContain('ao-thun');

    // 2nd request -> will be read from KV
    const res2 = await app.request('/api/v1/categories', { method: 'GET' }, env);
    expect(res2.status).toBe(200);
  });

  it('should filter products by keyword and price range', async () => {
    const res = await app.request('/api/v1/products?q=Cotton&minPrice=150000&maxPrice=220000', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe('Áo Thun Basic Cotton');
  });

  it('should fetch product detail by slug with variants', async () => {
    const res = await app.request('/api/v1/products/ao-thun-basic-cotton', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.variants.length).toBe(1);
    expect(body.data.variants[0].sku).toBe('AT-DEN-M');
    expect(body.data.variants[0].stockQuantity).toBe(10);
  });

  it('should return 404 for non-existent product slug', async () => {
    const res = await app.request('/api/v1/products/non-existent-product', { method: 'GET' }, env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });
});
