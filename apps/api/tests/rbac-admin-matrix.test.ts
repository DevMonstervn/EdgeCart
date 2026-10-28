import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import { hashPassword } from '../src/utils/crypto.js';
import { signJwt } from '../src/utils/jwt.js';
import type { Env } from '../src/types/env.js';

describe('Phase 2: Admin RBAC Matrix, Account Lock Revocation & Anti-Privilege-Escalation', () => {
  let env: Env;
  let superAdminToken: string;
  let productManagerToken: string;
  let orderOperatorToken: string;
  let customerToken: string;

  beforeEach(async () => {
    env = createTestEnv();
    const pwHash = await hashPassword('SecurePass123!');

    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, is_seller, status)
      VALUES
        ('usr_sa', 'superadmin@edgecart.com', ?, 'Super Admin', 'SUPER_ADMIN', 0, 'ACTIVE'),
        ('usr_pm', 'pm@edgecart.com', ?, 'Product Manager', 'PRODUCT_MANAGER', 0, 'ACTIVE'),
        ('usr_op', 'operator@edgecart.com', ?, 'Order Operator', 'ORDER_OPERATOR', 0, 'ACTIVE'),
        ('usr_cust', 'buyer@edgecart.com', ?, 'Buyer User', 'CUSTOMER', 0, 'ACTIVE'),
        ('usr_seller', 'seller@edgecart.com', ?, 'Seller Owner', 'CUSTOMER', 1, 'ACTIVE');
    `)
      .bind(pwHash, pwHash, pwHash, pwHash, pwHash)
      .run();

    await env.DB.prepare(`
      INSERT INTO stores (id, owner_user_id, name, slug, status)
      VALUES ('store_01', 'usr_seller', 'Shop Công Nghệ', 'shop-cong-nghe', 'ACTIVE');
    `).run();

    await env.DB.prepare(`
      INSERT INTO categories (id, name, slug, is_active)
      VALUES ('cat_sys', 'Thiết Bị Số', 'thiet-bi-so', 1);
    `).run();

    // Seed 1 system product (store_id IS NULL) and 1 seller product (store_id = 'store_01')
    await env.DB.prepare(`
      INSERT INTO products (id, category_id, store_id, name, slug, base_price, is_active)
      VALUES
        ('prd_sys', 'cat_sys', NULL, 'Chuột EdgeCart Official', 'chuot-edgecart-official', 350000, 1),
        ('prd_seller', 'cat_sys', 'store_01', 'Bàn Phím Cơ Seller', 'ban-phim-co-seller', 890000, 1);
    `).run();

    await env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES
        ('var_sys', 'prd_sys', 'SYS-MOUSE-01', 'Đen', 350000, 20, 1),
        ('var_seller', 'prd_seller', 'SEL-KB-01', 'Trắng', 890000, 15, 1);
    `).run();

    // Seed 1 order
    await env.DB.prepare(`
      INSERT INTO orders (
        id, order_number, user_id, customer_email, customer_phone,
        shipping_name, shipping_address, shipping_province, shipping_district, shipping_ward,
        payment_method, payment_status, shipping_status, subtotal, shipping_fee, total_amount
      ) VALUES (
        'ord_01', 'EC-900001-111', 'usr_cust', 'buyer@edgecart.com', '0912345678',
        'Buyer User', '123 Lê Lợi', 'TP.HCM', 'Quận 1', 'Bến Nghé',
        'COD', 'UNPAID', 'PENDING', 350000, 30000, 380000
      );
    `).run();

    await env.DB.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, variant_id, store_id, product_name, variant_title, sku, unit_price, quantity, total_price
      ) VALUES (
        'oi_01', 'ord_01', 'prd_sys', 'var_sys', NULL, 'Chuột EdgeCart Official', 'Đen', 'SYS-MOUSE-01', 350000, 1, 350000
      );
    `).run();

    superAdminToken = await signJwt({ sub: 'usr_sa', email: 'superadmin@edgecart.com', role: 'SUPER_ADMIN' }, env.JWT_SECRET, 900);
    productManagerToken = await signJwt({ sub: 'usr_pm', email: 'pm@edgecart.com', role: 'PRODUCT_MANAGER' }, env.JWT_SECRET, 900);
    orderOperatorToken = await signJwt({ sub: 'usr_op', email: 'operator@edgecart.com', role: 'ORDER_OPERATOR' }, env.JWT_SECRET, 900);
    customerToken = await signJwt({ sub: 'usr_cust', email: 'buyer@edgecart.com', role: 'CUSTOMER' }, env.JWT_SECRET, 900);
  });

  it('should allow PRODUCT_MANAGER to manage system products/inventory ONLY and forbid orders, users & seller products', async () => {
    // 1. Allowed: dashboard stats
    const statsRes = await app.request(
      '/api/v1/admin/dashboard/stats',
      { headers: { Authorization: `Bearer ${productManagerToken}` } },
      env
    );
    expect(statsRes.status).toBe(200);

    // 2. Allowed: create system product (always storeId = null)
    const createRes = await app.request(
      '/api/v1/admin/products',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${productManagerToken}` },
        body: JSON.stringify({
          name: 'Tai Nghe Official',
          slug: 'tai-nghe-official',
          categoryId: 'cat_sys',
          basePrice: 490000,
          variants: [{ sku: 'SYS-HP-01', title: 'Tiêu chuẩn', price: 490000, stockQuantity: 30 }],
        }),
      },
      env
    );
    expect(createRes.status).toBe(201);
    const createdBody = (await createRes.json()) as any;
    expect(createdBody.data.storeId).toBeNull();

    // 3. Allowed: adjust system product inventory
    const sysInvRes = await app.request(
      '/api/v1/admin/inventory/adjust',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${productManagerToken}` },
        body: JSON.stringify({
          variantId: 'var_sys',
          changeQuantity: 5,
          type: 'MANUAL_IMPORT',
          notes: 'Nhập thêm kho hệ thống',
        }),
      },
      env
    );
    expect(sysInvRes.status).toBe(200);

    // 4. FORBIDDEN: PRODUCT_MANAGER cannot edit/delete/adjust Seller's product
    const editSellerPrdRes = await app.request(
      '/api/v1/admin/products/prd_seller',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${productManagerToken}` },
        body: JSON.stringify({ name: 'PM cố sửa SP của Seller' }),
      },
      env
    );
    expect(editSellerPrdRes.status).toBe(403);

    const adjustSellerInvRes = await app.request(
      '/api/v1/admin/inventory/adjust',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${productManagerToken}` },
        body: JSON.stringify({
          variantId: 'var_seller',
          changeQuantity: 10,
          type: 'MANUAL_ADJUST',
        }),
      },
      env
    );
    expect(adjustSellerInvRes.status).toBe(403);

    // 5. FORBIDDEN: PRODUCT_MANAGER cannot access orders, users, seller-requests, store status, or audit-logs
    for (const [method, path] of [
      ['GET', '/api/v1/admin/orders'],
      ['PATCH', '/api/v1/admin/orders/ord_01/status'],
      ['GET', '/api/v1/admin/users'],
      ['PATCH', '/api/v1/admin/users/usr_cust/status'],
      ['PATCH', '/api/v1/admin/users/usr_cust/role'],
      ['GET', '/api/v1/admin/seller-requests'],
      ['PATCH', '/api/v1/admin/stores/store_01/status'],
      ['GET', '/api/v1/admin/audit-logs'],
    ] as const) {
      const res = await app.request(
        path,
        {
          method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${productManagerToken}` },
          ...(method !== 'GET' ? { body: JSON.stringify({ status: 'CONFIRMED' }) } : {}),
        },
        env
      );
      expect(res.status).toBe(403);
    }
  });

  it('should allow ORDER_OPERATOR to manage orders ONLY and forbid products, inventory, users & seller approvals', async () => {
    // 1. Allowed: list & update order status
    const listOrdersRes = await app.request(
      '/api/v1/admin/orders',
      { headers: { Authorization: `Bearer ${orderOperatorToken}` } },
      env
    );
    expect(listOrdersRes.status).toBe(200);
    const listBody = (await listOrdersRes.json()) as any;
    expect(listBody.data.length).toBe(1);

    const patchOrderRes = await app.request(
      '/api/v1/admin/orders/ord_01/status',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orderOperatorToken}` },
        body: JSON.stringify({ status: 'CONFIRMED', note: 'Đã gọi xác nhận khách' }),
      },
      env
    );
    expect(patchOrderRes.status).toBe(200);

    // 2. FORBIDDEN: ORDER_OPERATOR cannot touch products, categories, inventory, uploads, users, seller-requests, stores
    for (const [method, path] of [
      ['GET', '/api/v1/admin/products'],
      ['POST', '/api/v1/admin/products'],
      ['POST', '/api/v1/admin/categories'],
      ['GET', '/api/v1/admin/inventory'],
      ['GET', '/api/v1/admin/users'],
      ['GET', '/api/v1/admin/seller-requests'],
      ['GET', '/api/v1/admin/stores'],
      ['POST', '/api/v1/uploads/presigned-url'],
    ] as const) {
      const res = await app.request(
        path,
        {
          method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orderOperatorToken}` },
          ...(method !== 'GET' ? { body: JSON.stringify({}) } : {}),
        },
        env
      );
      expect(res.status).toBe(403);
    }
  });

  it('should prevent self-privilege escalation on register, forged role claims, and unauthorized role transitions', async () => {
    // 1. Attempting to inject role or isSeller in /auth/register MUST fail with 422
    const registerEscalateRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'attacker@edgecart.com',
          password: 'Password123!',
          fullName: 'Attacker',
          role: 'SUPER_ADMIN',
          isSeller: true,
        }),
      },
      env
    );
    expect(registerEscalateRes.status).toBe(422);

    // 2. Even if JWT payload has stale/forged role SUPER_ADMIN, D1 authoritative check sees usr_cust is CUSTOMER -> 403
    const staleAdminJwtForCustomer = await signJwt(
      { sub: 'usr_cust', email: 'buyer@edgecart.com', role: 'SUPER_ADMIN' },
      env.JWT_SECRET,
      900
    );
    const forgedAttemptRes = await app.request(
      '/api/v1/admin/users',
      { headers: { Authorization: `Bearer ${staleAdminJwtForCustomer}` } },
      env
    );
    expect(forgedAttemptRes.status).toBe(403);

    // 3. SUPER_ADMIN can assign operational roles (PRODUCT_MANAGER, ORDER_OPERATOR, CUSTOMER) + writes audit log,
    //    but CANNOT assign SUPER_ADMIN, BUYER, or SELLER via API, and CANNOT self-demote or self-lock!
    const validRoleChangeRes = await app.request(
      '/api/v1/admin/users/usr_cust/role',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
        body: JSON.stringify({ role: 'ORDER_OPERATOR', reason: 'Bổ nhiệm nhân viên vận hành đơn' }),
      },
      env
    );
    expect(validRoleChangeRes.status).toBe(200);
    const updatedUserBody = (await validRoleChangeRes.json()) as any;
    expect(updatedUserBody.data.role).toBe('ORDER_OPERATOR');
    expect(updatedUserBody.data.password_hash).toBeUndefined();

    for (const invalidRole of ['SUPER_ADMIN', 'SELLER', 'BUYER']) {
      const invalidRoleRes = await app.request(
        '/api/v1/admin/users/usr_cust/role',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
          body: JSON.stringify({ role: invalidRole }),
        },
        env
      );
      expect(invalidRoleRes.status).toBe(422);
    }

    // Anti self-lockout & anti self-demotion
    const selfLockRes = await app.request(
      '/api/v1/admin/users/usr_sa/status',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
        body: JSON.stringify({ status: 'BANNED', reason: 'Tự khóa nhầm' }),
      },
      env
    );
    expect(selfLockRes.status).toBe(400);

    const selfDemoteRes = await app.request(
      '/api/v1/admin/users/usr_sa/role',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
        body: JSON.stringify({ role: 'CUSTOMER' }),
      },
      env
    );
    expect(selfDemoteRes.status).toBe(400);
  });

  it('should immediately revoke active JWT & refresh sessions when SUPER_ADMIN locks an account, and log audit trail', async () => {
    // Register & login a real customer to get both accessToken & refreshToken in KV
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'locktarget@edgecart.com',
          password: 'Password123!',
          fullName: 'Target User',
        }),
      },
      env
    );
    expect(regRes.status).toBe(201);
    const regData = (await regRes.json()) as any;
    const targetId = regData.data.user.id;
    const targetAccessToken = regData.data.accessToken;
    const targetRefreshToken = regData.data.refreshToken;

    // Customercannot lock anyone
    const customerLockAttempt = await app.request(
      `/api/v1/admin/users/${targetId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
        body: JSON.stringify({ status: 'BANNED' }),
      },
      env
    );
    expect(customerLockAttempt.status).toBe(403);

    // SUPER_ADMIN locks the account
    const lockRes = await app.request(
      `/api/v1/admin/users/${targetId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
        body: JSON.stringify({ status: 'BANNED', reason: 'Vi phạm chính sách sàn' }),
      },
      env
    );
    expect(lockRes.status).toBe(200);

    // 1. Existing valid JWT is IMMEDIATELY blocked on /auth/me, /cart, /orders
    const meBlockedRes = await app.request(
      '/api/v1/auth/me',
      { headers: { Authorization: `Bearer ${targetAccessToken}` } },
      env
    );
    expect(meBlockedRes.status).toBe(403);
    expect(((await meBlockedRes.json()) as any).error.code).toBe('ACCOUNT_LOCKED');

    const cartBlockedRes = await app.request(
      '/api/v1/cart',
      { headers: { Authorization: `Bearer ${targetAccessToken}` } },
      env
    );
    expect(cartBlockedRes.status).toBe(403);
    expect(((await cartBlockedRes.json()) as any).error.code).toBe('ACCOUNT_LOCKED');

    // 2. Refresh token in KV was purged -> /auth/refresh fails with 401
    const refreshBlockedRes = await app.request(
      '/api/v1/auth/refresh',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: targetRefreshToken }),
      },
      env
    );
    expect(refreshBlockedRes.status).toBe(401);

    // 3. Re-login fails with 403 ACCOUNT_LOCKED
    const loginBlockedRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'locktarget@edgecart.com', password: 'Password123!' }),
      },
      env
    );
    expect(loginBlockedRes.status).toBe(403);
    expect(((await loginBlockedRes.json()) as any).error.code).toBe('ACCOUNT_LOCKED');

    // 4. Audit log recorded and readable by SUPER_ADMIN
    const auditRes = await app.request(
      '/api/v1/admin/audit-logs?action=UPDATE_USER_STATUS',
      { headers: { Authorization: `Bearer ${superAdminToken}` } },
      env
    );
    expect(auditRes.status).toBe(200);
    const auditBody = (await auditRes.json()) as any;
    expect(auditBody.data.length).toBeGreaterThanOrEqual(1);
    expect(auditBody.data[0].entityId).toBe(targetId);

    // 5. Unlocking restores access
    const unlockRes = await app.request(
      `/api/v1/admin/users/${targetId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
        body: JSON.stringify({ status: 'ACTIVE', reason: 'Đã xác minh mở khóa' }),
      },
      env
    );
    expect(unlockRes.status).toBe(200);

    const meRestoredRes = await app.request(
      '/api/v1/auth/me',
      { headers: { Authorization: `Bearer ${targetAccessToken}` } },
      env
    );
    expect(meRestoredRes.status).toBe(200);
  });
});
