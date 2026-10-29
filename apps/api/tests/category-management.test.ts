import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import { hashPassword } from '../src/utils/crypto.js';
import { signJwt } from '../src/utils/jwt.js';
import type { Env } from '../src/types/env.js';

describe('Admin Category Management (CRUD, Status Toggle, Product Association Guard & KV Cache)', () => {
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
        ('usr_cust', 'customer@edgecart.com', ?, 'Customer User', 'CUSTOMER', 0, 'ACTIVE');
    `)
      .bind(pwHash, pwHash, pwHash, pwHash)
      .run();

    await env.DB.prepare(`
      INSERT INTO categories (id, name, slug, description, sort_order, is_active)
      VALUES
        ('cat_active', 'Đồ Điện Tử', 'do-dien-tu', 'Thiết bị điện tử', 1, 1),
        ('cat_hidden', 'Thời Trang Cũ', 'thoi-trang-cu', 'Đang tạm ẩn', 2, 0);
    `).run();

    // Link one product to 'cat_active' to test delete restriction
    await env.DB.prepare(`
      INSERT INTO products (id, category_id, store_id, name, slug, base_price, is_active)
      VALUES ('prd_01', 'cat_active', NULL, 'Chuột Gaming', 'chuot-gaming', 500000, 1);
    `).run();

    superAdminToken = await signJwt(
      { sub: 'usr_sa', email: 'superadmin@edgecart.com', role: 'SUPER_ADMIN' },
      env.JWT_SECRET,
      900
    );
    productManagerToken = await signJwt(
      { sub: 'usr_pm', email: 'pm@edgecart.com', role: 'PRODUCT_MANAGER' },
      env.JWT_SECRET,
      900
    );
    orderOperatorToken = await signJwt(
      { sub: 'usr_op', email: 'operator@edgecart.com', role: 'ORDER_OPERATOR' },
      env.JWT_SECRET,
      900
    );
    customerToken = await signJwt(
      { sub: 'usr_cust', email: 'customer@edgecart.com', role: 'CUSTOMER' },
      env.JWT_SECRET,
      900
    );
  });

  it('lists all categories including inactive ones for Admin', async () => {
    const res = await app.request(
      '/api/v1/admin/categories',
      { headers: { Authorization: `Bearer ${superAdminToken}` } },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    const slugs = body.data.map((c: any) => c.slug);
    expect(slugs).toContain('do-dien-tu');
    expect(slugs).toContain('thoi-trang-cu');
  });

  it('creates a new category and handles slug duplication', async () => {
    const createRes = await app.request(
      '/api/v1/admin/categories',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${productManagerToken}`,
        },
        body: JSON.stringify({
          name: 'Nhà Cửa & Đời Sống',
          slug: 'nha-cua-doi-song',
          description: 'Vật dụng gia đình',
          sortOrder: 10,
        }),
      },
      env
    );
    expect(createRes.status).toBe(201);
    const body = (await createRes.json()) as any;
    expect(body.data.name).toBe('Nhà Cửa & Đời Sống');
    expect(body.data.slug).toBe('nha-cua-doi-song');
    expect(body.data.isActive).toBe(true);

    // Duplicate slug must be rejected with 409 CONFLICT
    const dupRes = await app.request(
      '/api/v1/admin/categories',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${productManagerToken}`,
        },
        body: JSON.stringify({
          name: 'Nhà Cửa Khác',
          slug: 'nha-cua-doi-song',
        }),
      },
      env
    );
    expect(dupRes.status).toBe(409);
  });

  it('updates an existing category details', async () => {
    const updateRes = await app.request(
      '/api/v1/admin/categories/cat_active',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          name: 'Đồ Điện Tử & Phụ Kiện',
          slug: 'do-dien-tu-phu-kien',
          description: 'Cập nhật mô tả mới',
          sortOrder: 5,
        }),
      },
      env
    );
    expect(updateRes.status).toBe(200);
    const body = (await updateRes.json()) as any;
    expect(body.data.name).toBe('Đồ Điện Tử & Phụ Kiện');
    expect(body.data.slug).toBe('do-dien-tu-phu-kien');
    expect(body.data.sortOrder).toBe(5);
  });

  it('toggles category active status (hide / unhide)', async () => {
    // Hide active category
    const hideRes = await app.request(
      '/api/v1/admin/categories/cat_active/status',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({ isActive: false }),
      },
      env
    );
    expect(hideRes.status).toBe(200);
    const hideBody = (await hideRes.json()) as any;
    expect(hideBody.data.isActive).toBe(false);

    // Unhide previously inactive category
    const unhideRes = await app.request(
      '/api/v1/admin/categories/cat_hidden/status',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${productManagerToken}`,
        },
        body: JSON.stringify({ isActive: true }),
      },
      env
    );
    expect(unhideRes.status).toBe(200);
    const unhideBody = (await unhideRes.json()) as any;
    expect(unhideBody.data.isActive).toBe(true);
  });

  it('protects category deletion when products are linked, and allows deletion when empty', async () => {
    // Attempting to delete 'cat_active' (linked to 'prd_01') MUST fail with 400
    const failDeleteRes = await app.request(
      '/api/v1/admin/categories/cat_active',
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${superAdminToken}` },
      },
      env
    );
    expect(failDeleteRes.status).toBe(400);

    // Deleting 'cat_hidden' (has 0 products) MUST succeed
    const okDeleteRes = await app.request(
      '/api/v1/admin/categories/cat_hidden',
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${superAdminToken}` },
      },
      env
    );
    expect(okDeleteRes.status).toBe(200);

    // Verify it is gone from database
    const verifyRes = await app.request(
      '/api/v1/admin/categories',
      { headers: { Authorization: `Bearer ${superAdminToken}` } },
      env
    );
    const body = (await verifyRes.json()) as any;
    expect(body.data.map((c: any) => c.id)).not.toContain('cat_hidden');
  });

  it('enforces RBAC: forbids ORDER_OPERATOR and CUSTOMER from managing categories', async () => {
    for (const token of [orderOperatorToken, customerToken]) {
      const getRes = await app.request(
        '/api/v1/admin/categories',
        { headers: { Authorization: `Bearer ${token}` } },
        env
      );
      expect(getRes.status).toBe(403);

      const postRes = await app.request(
        '/api/v1/admin/categories',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: 'Test', slug: 'test' }),
        },
        env
      );
      expect(postRes.status).toBe(403);
    }
  });
});
