import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import type { Env } from '../src/types/env.js';

describe('EdgeCart — Guest Checkout, Order Security & Regression Tests', () => {
  let env: Env;
  let registeredToken: string;
  let registeredUserId: string;

  beforeEach(async () => {
    env = createTestEnv();

    // 1. Seed registered user
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'customer@edgecart.vn',
          password: 'Password123!',
          fullName: 'Nguyễn Khách Hàng',
          phone: '0912345678',
        }),
      },
      env
    );
    const regData = (await regRes.json()) as any;
    registeredToken = regData.data.accessToken;
    registeredUserId = regData.data.user.id;

    // 2. Seed test category & products
    env.DB.prepare(`
      INSERT INTO categories (id, name, slug) VALUES ('cat_devices', 'Thiết Bị Số', 'thiet-bi-so');
    `).run();

    env.DB.prepare(`
      INSERT INTO products (id, category_id, name, slug, base_price, sale_price, is_active)
      VALUES ('prd_mouse', 'cat_devices', 'Chuột Không Dây Silent', 'chuot-khong-day-silent', 350000, 290000, 1);
    `).run();

    env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES ('var_mouse_black', 'prd_mouse', 'MOUSE-BLK', 'Đen Nhám', 290000, 5, 1);
    `).run();

    env.DB.prepare(`
      INSERT INTO products (id, category_id, name, slug, base_price, sale_price, is_active)
      VALUES ('prd_pad', 'cat_devices', 'Lót Chuột Gaming', 'lot-chuot-gaming', 100000, 80000, 1);
    `).run();

    env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES ('var_pad_rgb', 'prd_pad', 'PAD-RGB', 'RGB 900x400', 80000, 10, 1);
    `).run();
  });

  it('1. Guest Checkout: Guest can submit checkout without registering, returning secure confirmation', async () => {
    const sessionId = 'guest_sess_1001';

    // Guest adds item to cart via X-Session-Id
    const addRes = await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId,
        },
        body: JSON.stringify({ variantId: 'var_mouse_black', quantity: 2 }),
      },
      env
    );
    expect(addRes.status).toBe(200);

    // Guest submits checkout
    const checkoutRes = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId,
        },
        body: JSON.stringify({
          customerEmail: 'guest.shopper@gmail.com',
          shippingAddress: {
            recipientName: 'Khách Vãng Lai',
            phone: '0988111222',
            province: 'Thành phố Hồ Chí Minh',
            district: 'Quận 1',
            ward: 'Phường Bến Nghé',
            streetAddress: 'Số 12 Lê Duẩn',
          },
          paymentMethod: 'COD',
          notes: 'Gọi trước khi giao',
        }),
      },
      env
    );

    const checkoutData = (await checkoutRes.json()) as any;
    if (checkoutRes.status !== 201) {
      console.log('CHECKOUT_FAIL_TEST_1:', JSON.stringify(checkoutData, null, 2));
    }
    expect(checkoutRes.status).toBe(201);
    expect(checkoutData.success).toBe(true);
    expect(checkoutData.data.orderId).toBeDefined();
    expect(checkoutData.data.orderNumber).toMatch(/^EC-/);
    // Subtotal 2 * 290k = 580k >= 500k -> shippingFee = 0, totalAmount = 580k
    expect(checkoutData.data.totalAmount).toBe(580000);
    expect(checkoutData.data.orderAccessToken).toBeDefined();
    expect(checkoutData.data.orderAccessToken.length).toBeGreaterThan(20);

    // Verify in D1: user_id is null, customer_email is guest.shopper@gmail.com
    const orderInDb = await env.DB.prepare('SELECT * FROM orders WHERE id = ?')
      .bind(checkoutData.data.orderId)
      .first<any>();
    expect(orderInDb).not.toBeNull();
    expect(orderInDb.user_id).toBeNull();
    expect(orderInDb.customer_email).toBe('guest.shopper@gmail.com');
    expect(orderInDb.customer_phone).toBe('0988111222');
    expect(orderInDb.shipping_name).toBe('Khách Vãng Lai');

    // Verify stock decremented: 5 - 2 = 3
    const variantAfter = await env.DB.prepare('SELECT stock_quantity FROM product_variants WHERE id = ?')
      .bind('var_mouse_black')
      .first<any>();
    expect(variantAfter.stock_quantity).toBe(3);
  });

  it('2. Invalid Customer Data: Rejects missing/invalid email or phone', async () => {
    const sessionId = 'guest_sess_invalid';
    await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({ variantId: 'var_mouse_black', quantity: 1 }),
      },
      env
    );

    // A. Missing email for unauthenticated guest -> 401 Unauthorized (require login or email)
    const resNoEmail = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: 'Khách Không Email',
            phone: '0988111222',
            province: 'Hà Nội',
            ward: 'Dịch Vọng',
            streetAddress: '123 Cầu Giấy',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );
    expect(resNoEmail.status).toBe(401);

    // B. Invalid email format -> 422 Unprocessable Entity
    const resBadEmail = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({
          customerEmail: 'not-an-email',
          shippingAddress: {
            recipientName: 'Khách Sai Email',
            phone: '0988111222',
            province: 'Hà Nội',
            ward: 'Dịch Vọng',
            streetAddress: '123 Cầu Giấy',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );
    expect(resBadEmail.status).toBe(422);

    // C. Invalid Vietnam phone number -> 422 Unprocessable Entity
    const resBadPhone = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({
          customerEmail: 'good@email.com',
          shippingAddress: {
            recipientName: 'Khách Sai SĐT',
            phone: '123456',
            province: 'Hà Nội',
            ward: 'Dịch Vọng',
            streetAddress: '123 Cầu Giấy',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );
    expect(resBadPhone.status).toBe(422);
  });

  it('3. Recalculates prices server-side & ignores client manipulated prices', async () => {
    const sessionId = 'guest_sess_price_tamper';

    // Add item (price in DB is 290,000 VND)
    await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({ variantId: 'var_mouse_black', quantity: 1 }),
      },
      env
    );

    // Client attempts to pass manipulated unitPrice: 1000 VND in checkout
    const checkoutRes = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({
          customerEmail: 'hacker@try.vn',
          manipulatedPrice: 1000,
          totalAmount: 1000,
          shippingAddress: {
            recipientName: 'Nguyễn Thử Nghiệm',
            phone: '0988111222',
            province: 'Đà Nẵng',
            ward: 'Hải Châu 1',
            streetAddress: '10 Bạch Đằng',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );

    expect(checkoutRes.status).toBe(201);
    const data = (await checkoutRes.json()) as any;
    // Subtotal: 290,000 (< 500k -> shippingFee = 30k) -> totalAmount = 320,000 VND
    expect(data.data.totalAmount).toBe(320000);

    const orderInDb = await env.DB.prepare('SELECT total_amount, subtotal, shipping_fee FROM orders WHERE id = ?')
      .bind(data.data.orderId)
      .first<any>();
    expect(orderInDb.subtotal).toBe(290000);
    expect(orderInDb.shipping_fee).toBe(30000);
    expect(orderInDb.total_amount).toBe(320000);
  });

  it('4. Insufficient Stock: Blocks order when requested quantity exceeds inventory', async () => {
    const sessionId = 'guest_sess_oom_stock';

    // Stock for mouse is 5. Guest adds 5 items.
    await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({ variantId: 'var_mouse_black', quantity: 5 }),
      },
      env
    );

    // Simulate concurrent purchase reducing stock to 2 in DB right before guest checkout
    env.DB.prepare('UPDATE product_variants SET stock_quantity = 2 WHERE id = ?').bind('var_mouse_black').run();

    const checkoutRes = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({
          customerEmail: 'guest.busy@gmail.com',
          shippingAddress: {
            recipientName: 'Khách Chậm Tay',
            phone: '0988111222',
            province: 'Hà Nội',
            ward: 'Dịch Vọng',
            streetAddress: '123 Cầu Giấy',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );

    expect(checkoutRes.status).toBe(409);
    // Stock remains 2 (atomic rollback, no negative inventory)
    const variantAfter = await env.DB.prepare('SELECT stock_quantity FROM product_variants WHERE id = ?')
      .bind('var_mouse_black')
      .first<any>();
    expect(variantAfter.stock_quantity).toBe(2);
  });

  it('5. Duplicate Submission Prevention: Idempotency Key prevents double deduction', async () => {
    const sessionId = 'guest_sess_idemp';
    await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({ variantId: 'var_mouse_black', quantity: 1 }),
      },
      env
    );

    const idempotencyKey = 'idemp_key_guest_test_001';
    const payload = {
      customerEmail: 'double.clicker@gmail.com',
      shippingAddress: {
        recipientName: 'Khách Click Nhanh',
        phone: '0988111222',
        province: 'Hà Nội',
        ward: 'Dịch Vọng',
        streetAddress: '123 Cầu Giấy',
      },
      paymentMethod: 'COD',
    };

    // First request
    const res1 = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      },
      env
    );
    expect(res1.status).toBe(201);
    const data1 = (await res1.json()) as any;

    // Second duplicate request with identical Idempotency-Key
    const res2 = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      },
      env
    );
    expect(res2.status).toBe(201);
    const data2 = (await res2.json()) as any;

    // Must return identical order details
    expect(data2.data.orderId).toBe(data1.data.orderId);
    expect(data2.data.orderNumber).toBe(data1.data.orderNumber);

    // Stock must have decremented ONLY ONCE: 5 - 1 = 4
    const variantAfter = await env.DB.prepare('SELECT stock_quantity FROM product_variants WHERE id = ?')
      .bind('var_mouse_black')
      .first<any>();
    expect(variantAfter.stock_quantity).toBe(4);
  });

  it('6. Secure Guest Order Tracking: Allows lookup with valid token and rejects unauthorized lookup', async () => {
    const sessionId = 'guest_sess_tracking';
    await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({ variantId: 'var_pad_rgb', quantity: 1 }),
      },
      env
    );

    const checkoutRes = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({
          customerEmail: 'tracker@guest.vn',
          shippingAddress: {
            recipientName: 'Người Cần Tra Cứu',
            phone: '0988776655',
            province: 'Hải Phòng',
            ward: 'Lê Chân',
            streetAddress: '45 Cầu Đất',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );
    const checkoutData = (await checkoutRes.json()) as any;
    const { orderNumber, orderAccessToken } = checkoutData.data;

    // A. Valid token and matching orderNumber -> 200 OK (via query param)
    const trackRes = await app.request(
      `/api/v1/orders/guest/track?orderNumber=${orderNumber}&token=${orderAccessToken}`,
      { method: 'GET' },
      env
    );
    expect(trackRes.status).toBe(200);
    const trackData = (await trackRes.json()) as any;
    expect(trackData.success).toBe(true);
    expect(trackData.data.orderNumber).toBe(orderNumber);
    expect(trackData.data.shippingName).toBe('Người Cần Tra Cứu');
    expect(trackData.data.items.length).toBe(1);

    // A2. Valid token via X-Order-Token header -> 200 OK
    const trackHeaderRes = await app.request(
      `/api/v1/orders/guest/track?orderNumber=${orderNumber}`,
      { method: 'GET', headers: { 'X-Order-Token': orderAccessToken } },
      env
    );
    expect(trackHeaderRes.status).toBe(200);
    const trackHeaderData = (await trackHeaderRes.json()) as any;
    expect(trackHeaderData.data.orderNumber).toBe(orderNumber);

    // B. Missing token -> 400 Bad Request
    const trackNoToken = await app.request(
      `/api/v1/orders/guest/track?orderNumber=${orderNumber}`,
      { method: 'GET' },
      env
    );
    expect(trackNoToken.status).toBe(400);

    // C. Forged / invalid token -> 404 / Unauthorized
    const trackBadToken = await app.request(
      `/api/v1/orders/guest/track?orderNumber=${orderNumber}&token=forged-fake-token-123456789`,
      { method: 'GET' },
      env
    );
    expect(trackBadToken.status).toBe(404);

    // D. Non-existent orderNumber -> 404
    const trackBadNumber = await app.request(
      `/api/v1/orders/guest/track?orderNumber=EC-NON-EXISTENT&token=${orderAccessToken}`,
      { method: 'GET' },
      env
    );
    expect(trackBadNumber.status).toBe(404);
  });

  it('7. Guest Order Isolation: Registered users cannot access guest orders via /api/v1/orders/:id', async () => {
    // 1. Create a guest order
    const sessionId = 'guest_sess_iso';
    await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({ variantId: 'var_pad_rgb', quantity: 1 }),
      },
      env
    );
    const checkoutRes = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({
          customerEmail: 'secret.guest@vn.com',
          shippingAddress: {
            recipientName: 'Khách Bí Mật',
            phone: '0988776655',
            province: 'Hà Nội',
            ward: 'Dịch Vọng',
            streetAddress: '123 Cầu Giấy',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );
    const guestOrder = ((await checkoutRes.json()) as any).data;

    // 2. Logged-in user attempts to query the guest order ID via GET /api/v1/orders/:id
    const userAccessGuestOrder = await app.request(
      `/api/v1/orders/${guestOrder.orderId}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${registeredToken}` },
      },
      env
    );
    // Must be blocked!
    expect(userAccessGuestOrder.status).toBe(404);

    // 3. Guest cannot track registered user's order using guest tracking endpoint
    // Seed registered user order
    await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registeredToken}` },
        body: JSON.stringify({ variantId: 'var_pad_rgb', quantity: 1 }),
      },
      env
    );
    const regOrderRes = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registeredToken}` },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: 'Nguyễn Khách Hàng',
            phone: '0912345678',
            province: 'Hà Nội',
            ward: 'Dịch Vọng',
            streetAddress: '88 Cầu Giấy',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );
    const regOrder = ((await regOrderRes.json()) as any).data;

    // Guest tries to track registered user order via /guest/track
    const guestTracksRegOrder = await app.request(
      `/api/v1/orders/guest/track?orderNumber=${regOrder.orderNumber}&token=some-random-valid-token-321`,
      { method: 'GET' },
      env
    );
    // Must be blocked because user_id !== null!
    expect(guestTracksRegOrder.status).toBe(404);
  });

  it('8. Registered User Checkout & Order History: Preserves full existing functionality', async () => {
    // 1. Registered user adds item
    await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registeredToken}` },
        body: JSON.stringify({ variantId: 'var_mouse_black', quantity: 1 }),
      },
      env
    );

    // 2. Registered user checks out without needing customerEmail in payload
    const regCheckout = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registeredToken}` },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: 'Nguyễn Khách Hàng',
            phone: '0912345678',
            province: 'Hà Nội',
            ward: 'Dịch Vọng',
            streetAddress: '88 Cầu Giấy',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );
    expect(regCheckout.status).toBe(201);
    const regData = (await regCheckout.json()) as any;
    expect(regData.data.orderId).toBeDefined();

    // 3. Order is bound to registered user
    const dbOrder = await env.DB.prepare('SELECT * FROM orders WHERE id = ?')
      .bind(regData.data.orderId)
      .first<any>();
    expect(dbOrder.user_id).toBe(registeredUserId);
    expect(dbOrder.customer_email).toBe('customer@edgecart.vn');

    // 4. Query order history via GET /api/v1/orders
    const historyRes = await app.request(
      '/api/v1/orders',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${registeredToken}` },
      },
      env
    );
    expect(historyRes.status).toBe(200);
    const historyData = (await historyRes.json()) as any;
    expect(historyData.data.length).toBeGreaterThanOrEqual(1);
    const matched = historyData.data.find((o: any) => o.id === regData.data.orderId);
    expect(matched).toBeDefined();
    expect(matched.customerEmail).toBe('customer@edgecart.vn');
  });

  it('9. Admin Order Access: Admin can view both registered and guest orders', async () => {
    // Seed admin
    const adminReg = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin.super@edgecart.com',
          password: 'Password123!',
          fullName: 'Super Admin',
        }),
      },
      env
    );
    const adminToken = ((await adminReg.json()) as any).data.accessToken;
    // Elevate to SUPER_ADMIN in DB
    env.DB.prepare("UPDATE users SET role = 'SUPER_ADMIN' WHERE email = 'admin.super@edgecart.com'").run();

    // Query admin orders list
    const adminOrdersRes = await app.request(
      '/api/v1/admin/orders',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      env
    );
    expect(adminOrdersRes.status).toBe(200);
    const adminOrders = (await adminOrdersRes.json()) as any;
    expect(adminOrders.success).toBe(true);
    expect(Array.isArray(adminOrders.data)).toBe(true);
  });
});
