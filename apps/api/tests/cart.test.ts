import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import type { Env } from '../src/types/env.js';

describe('Cart API Integration Tests', () => {
  let env: Env;

  beforeEach(() => {
    env = createTestEnv();

    // Seed product & variant
    env.DB.prepare(`
      INSERT INTO categories (id, name, slug) VALUES ('cat_01', 'Danh mục test', 'test-cat');
    `).run();
    env.DB.prepare(`
      INSERT INTO products (id, category_id, name, slug, base_price, sale_price, is_active)
      VALUES ('prd_01', 'cat_01', 'Sản phẩm mẫu', 'san-pham-mau', 100000, 80000, 1);
    `).run();
    env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES ('var_01', 'prd_01', 'SP-01', 'Mẫu 1', 80000, 20, 1);
    `).run();
  });

  it('should initialize and fetch empty cart', async () => {
    const res = await app.request('/api/v1/cart', { method: 'GET', headers: { 'X-Session-Id': 'sess_123' } }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
    expect(body.data.totalItems).toBe(0);
    expect(body.data.subtotal).toBe(0);
  });

  it('should add item to cart and calculate totals', async () => {
    const res = await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'sess_123' },
        body: JSON.stringify({
          variantId: 'var_01',
          quantity: 2,
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0].quantity).toBe(2);
    expect(body.data.items[0].totalPrice).toBe(160000);
    expect(body.data.subtotal).toBe(160000);
  });

  it('should reject adding more quantity than available stock', async () => {
    const res = await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'sess_123' },
        body: JSON.stringify({
          variantId: 'var_01',
          quantity: 25, // only 20 in stock
        }),
      },
      env
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('Kho chỉ còn');
  });

  it('should update item quantity and remove item', async () => {
    // Add item first
    const addRes = await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'sess_test' },
        body: JSON.stringify({ variantId: 'var_01', quantity: 1 }),
      },
      env
    );
    const addBody = (await addRes.json()) as any;
    const itemId = addBody.data.items[0].id;

    // Update to 3
    const updateRes = await app.request(
      `/api/v1/cart/items/${itemId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'sess_test' },
        body: JSON.stringify({ quantity: 3 }),
      },
      env
    );
    const updateBody = (await updateRes.json()) as any;
    expect(updateBody.data.items[0].quantity).toBe(3);
    expect(updateBody.data.subtotal).toBe(240000);

    // Delete item
    const delRes = await app.request(
      `/api/v1/cart/items/${itemId}`,
      { method: 'DELETE', headers: { 'X-Session-Id': 'sess_test' } },
      env
    );
    const delBody = (await delRes.json()) as any;
    expect(delBody.data.items.length).toBe(0);
    expect(delBody.data.subtotal).toBe(0);
  });
});
