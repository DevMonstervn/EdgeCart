import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import type { Env } from '../src/types/env.js';

describe('Checkout, Atomic Inventory Deduction & Concurrency Tests', () => {
  let env: Env;
  let token: string;
  let userId: string;

  beforeEach(async () => {
    env = createTestEnv();

    // 1. Seed user
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'shopper@edgecart.com',
          password: 'Password123!',
          fullName: 'Shopper Test',
          phone: '0988776655',
        }),
      },
      env
    );
    const regData = (await regRes.json()) as any;
    token = regData.data.accessToken;
    userId = regData.data.user.id;

    // 2. Seed product & limited variant (stock = 1)
    env.DB.prepare(`
      INSERT INTO categories (id, name, slug) VALUES ('cat_flash', 'Flash Sale', 'flash-sale');
    `).run();
    env.DB.prepare(`
      INSERT INTO products (id, category_id, name, slug, base_price, sale_price, is_active)
      VALUES ('prd_flash', 'cat_flash', 'Áo Thun Limited Flashsale', 'ao-thun-flashsale', 500000, 300000, 1);
    `).run();
    env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES ('var_flash', 'prd_flash', 'FS-LIMITED', 'Black Edition', 300000, 1, 1);
    `).run();
  });

  it('should successfully checkout, deduct stock atomically and record inventory ledger', async () => {
    // Add item to cart
    await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ variantId: 'var_flash', quantity: 1 }),
      },
      env
    );

    const idempotencyKey = crypto.randomUUID();

    // Submit checkout
    const checkoutRes = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: 'Shopper Test',
            phone: '0988776655',
            province: 'Hà Nội',
            district: 'Cầu Giấy',
            ward: 'Dịch Vọng',
            streetAddress: 'Số 88 Dịch Vọng Hậu',
          },
          paymentMethod: 'COD',
          notes: 'Giao giờ hành chính',
        }),
      },
      env
    );

    const checkoutData = (await checkoutRes.json()) as any;
    if (checkoutRes.status !== 201) {
      console.error('CHECKOUT_FAIL_DEBUG:', JSON.stringify(checkoutData, null, 2));
    }
    expect(checkoutRes.status).toBe(201);
    expect(checkoutData.success).toBe(true);
    expect(checkoutData.data.orderId).toBeDefined();
    expect(checkoutData.data.orderNumber).toBeDefined();

    // Verify stock is now 0 in D1
    const variantAfter = await env.DB.prepare('SELECT stock_quantity FROM product_variants WHERE id = ?')
      .bind('var_flash')
      .first<{ stock_quantity: number }>();
    expect(variantAfter?.stock_quantity).toBe(0);

    // Verify inventory log ledger was created
    const log = await env.DB.prepare('SELECT * FROM inventory_logs WHERE variant_id = ?')
      .bind('var_flash')
      .first<{ change_quantity: number; type: string }>();
    expect(log).not.toBeNull();
    expect(log?.change_quantity).toBe(-1);
    expect(log?.type).toBe('ORDER_DEDUCT');

    // Verify cart was emptied
    const cartRes = await app.request(
      '/api/v1/cart',
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      env
    );
    const cartData = (await cartRes.json()) as any;
    expect(cartData.data.items.length).toBe(0);
  });

  it('should guarantee idempotency when receiving duplicate checkout requests', async () => {
    // Add item to cart
    await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ variantId: 'var_flash', quantity: 1 }),
      },
      env
    );

    const idempotencyKey = 'duplicate-key-12345';
    const payload = {
      shippingAddress: {
        recipientName: 'Shopper Test',
        phone: '0988776655',
        province: 'Hà Nội',
        district: 'Cầu Giấy',
        ward: 'Dịch Vọng',
        streetAddress: 'Số 88 Dịch Vọng Hậu',
      },
      paymentMethod: 'COD',
    };

    // 1st request
    const res1 = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      },
      env
    );
    expect(res1.status).toBe(201);
    const data1 = (await res1.json()) as any;

    // 2nd request with exact same Idempotency-Key
    const res2 = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      },
      env
    );
    expect(res2.status).toBe(201);
    const data2 = (await res2.json()) as any;

    // Identical order result without double-deduction!
    expect(data2.data.orderId).toBe(data1.data.orderId);
    expect(data2.data.orderNumber).toBe(data1.data.orderNumber);

    // Verify stock is 0 (deducted once, NOT negative!)
    const variantAfter = await env.DB.prepare('SELECT stock_quantity FROM product_variants WHERE id = ?')
      .bind('var_flash')
      .first<{ stock_quantity: number }>();
    expect(variantAfter?.stock_quantity).toBe(0);
  });

  it('should prevent race condition over-selling and reject when stock is depleted', async () => {
    // User 1 buys the only item
    await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ variantId: 'var_flash', quantity: 1 }),
      },
      env
    );
    await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: 'Shopper 1',
            phone: '0988776655',
            province: 'Hà Nội',
            district: 'Cầu Giấy',
            ward: 'Dịch Vọng',
            streetAddress: 'Số 1 Đường Cầu Giấy',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );

    // User 2 tries to buy the same variant
    const user2Res = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'shopper2@edgecart.com',
          password: 'Password123!',
          fullName: 'Shopper 2',
          phone: '0911223344',
        }),
      },
      env
    );
    const user2Data = (await user2Res.json()) as any;
    const token2 = user2Data.data.accessToken;
    const user2Id = user2Data.data.user.id;

    // Direct add/checkout attempt
    // Manually force item into cart_items to test D1 atomic batch constraint
    const cart2 = await env.DB.prepare('SELECT id FROM carts WHERE user_id = ?').bind(user2Id).first<{ id: string }>();
    const cart2Id = cart2?.id || crypto.randomUUID();
    env.DB.prepare('INSERT OR REPLACE INTO carts (id, user_id, status) VALUES (?, ?, ?)').bind(cart2Id, user2Id, 'ACTIVE').run();
    env.DB.prepare('INSERT INTO cart_items (id, cart_id, variant_id, quantity, price_at_addition) VALUES (?, ?, ?, 1, 300000)').bind(crypto.randomUUID(), cart2Id, 'var_flash').run();

    // Now User 2 submits checkout
    const checkout2Res = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: 'Shopper 2',
            phone: '0911223344',
            province: 'Hà Nội',
            district: 'Cầu Giấy',
            ward: 'Dịch Vọng',
            streetAddress: 'Số 2 Đường Cầu Giấy',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );

    expect(checkout2Res.status).toBe(409); // 409 Conflict
    const checkout2Data = (await checkout2Res.json()) as any;
    expect(checkout2Data.success).toBe(false);
    expect(checkout2Data.error.code).toBe('INSUFFICIENT_STOCK');
    expect(checkout2Data.error.message).toContain('không đủ tồn kho');

    // Final stock check
    const finalStock = await env.DB.prepare('SELECT stock_quantity FROM product_variants WHERE id = ?')
      .bind('var_flash')
      .first<{ stock_quantity: number }>();
    expect(finalStock?.stock_quantity).toBe(0); // Zero over-selling guaranteed!
  });
});
