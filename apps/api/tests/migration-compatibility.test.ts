import { describe, it, expect } from 'vitest';
import app from '../src/index.js';
import { createTestEnv, applyMigrationFile } from './helpers/test-env.js';
import { hashPassword } from '../src/utils/crypto.js';
import {
  USER_ROLES,
  STORE_STATUS,
  SELLER_REQUEST_STATUS,
  RegisterSchema,
  CreateSellerRequestSchema,
  ReviewSellerRequestSchema,
  UpdateUserRoleSchema,
  SellerProductCreateSchema,
} from '@edgecart/shared';

describe('Phase 1: D1 Migration 0001 -> 0002 Compatibility, Data Preservation & Constraints', () => {
  it('should preserve 100% of pre-existing users, roles, addresses, carts, products, orders & FKs after applying 0002', async () => {
    // 1. Initialize database ONLY up to 0001_initial_schema.sql
    const env = createTestEnv({ upToMigration: '0001_initial_schema.sql' });
    const rawD1 = env.__rawD1;

    const passwordHash = await hashPassword('LegacyPass123!');

    // 2. Seed pre-migration data for ALL 4 existing roles
    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
      VALUES
        ('usr_legacy_cust', 'buyer.legacy@edgecart.com', ?, 'Khách Hàng Cũ', '0911222333', 'CUSTOMER', 'ACTIVE'),
        ('usr_legacy_admin', 'superadmin@edgecart.com', ?, 'Super Admin Cũ', '0911222334', 'SUPER_ADMIN', 'ACTIVE'),
        ('usr_legacy_pm', 'pm@edgecart.com', ?, 'Quản Lý SP Cũ', '0911222335', 'PRODUCT_MANAGER', 'ACTIVE'),
        ('usr_legacy_op', 'operator@edgecart.com', ?, 'Vận Hành Đơn Cũ', '0911222336', 'ORDER_OPERATOR', 'ACTIVE');
    `)
      .bind(passwordHash, passwordHash, passwordHash, passwordHash)
      .run();

    // Seed pre-migration address (ON DELETE CASCADE child of users)
    await env.DB.prepare(`
      INSERT INTO addresses (id, user_id, recipient_name, phone, province, district, ward, street_address, is_default)
      VALUES ('addr_legacy_1', 'usr_legacy_cust', 'Khách Hàng Cũ', '0911222333', 'TP. Hồ Chí Minh', 'Quận 1', 'Phường Bến Nghé', '123 Lê Lợi', 1);
    `).run();

    // Seed pre-migration category, product, variant & image
    await env.DB.prepare(`
      INSERT INTO categories (id, name, slug, sort_order, is_active)
      VALUES ('cat_legacy_1', 'Áo Khoác', 'ao-khoac', 1, 1);
    `).run();

    await env.DB.prepare(`
      INSERT INTO products (id, category_id, name, slug, description, base_price, sale_price, is_featured, is_active)
      VALUES ('prd_legacy_1', 'cat_legacy_1', 'Áo Khoác EdgeCart Official', 'ao-khoac-edgecart-official', 'Sản phẩm hệ thống cũ', 450000, 399000, 1, 1);
    `).run();

    await env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES ('var_legacy_1', 'prd_legacy_1', 'SKU-LEGACY-AK-L', 'Size L', 399000, 20, 1);
    `).run();

    await env.DB.prepare(`
      INSERT INTO product_images (id, product_id, variant_id, image_url, r2_key, sort_order)
      VALUES ('img_legacy_1', 'prd_legacy_1', 'var_legacy_1', 'https://cdn.edgecart.com/products/legacy.webp', 'products/legacy.webp', 0);
    `).run();

    // Seed pre-migration active cart & cart item (ON DELETE CASCADE child of users)
    await env.DB.prepare(`
      INSERT INTO carts (id, user_id, status)
      VALUES ('cart_legacy_1', 'usr_legacy_cust', 'ACTIVE');
    `).run();

    await env.DB.prepare(`
      INSERT INTO cart_items (id, cart_id, variant_id, quantity, price_at_addition)
      VALUES ('ci_legacy_1', 'cart_legacy_1', 'var_legacy_1', 2, 399000);
    `).run();

    // Seed pre-migration completed order, order_items & audit_log
    await env.DB.prepare(`
      INSERT INTO orders (
        id, order_number, user_id, customer_email, customer_phone,
        shipping_name, shipping_address, shipping_province, shipping_district, shipping_ward,
        payment_method, payment_status, shipping_status, subtotal, shipping_fee, total_amount
      ) VALUES (
        'ord_legacy_1', 'EC-LEGACY-001', 'usr_legacy_cust', 'buyer.legacy@edgecart.com', '0911222333',
        'Khách Hàng Cũ', '123 Lê Lợi', 'TP. Hồ Chí Minh', 'Quận 1', 'Phường Bến Nghé',
        'COD', 'PAID', 'DELIVERED', 399000, 30000, 429000
      );
    `).run();

    await env.DB.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, variant_id, product_name, variant_title, sku, unit_price, quantity, total_price
      ) VALUES (
        'oi_legacy_1', 'ord_legacy_1', 'prd_legacy_1', 'var_legacy_1', 'Áo Khoác EdgeCart Official', 'Size L', 'SKU-LEGACY-AK-L', 399000, 1, 399000
      );
    `).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity, entity_id)
      VALUES ('aud_legacy_1', 'usr_legacy_admin', 'CREATE_PRODUCT', 'products', 'prd_legacy_1');
    `).run();

    // 3. Apply 0002_add_seller_marketplace.sql inside an implicit transaction (simulating Cloudflare D1)
    applyMigrationFile(rawD1, '0002_add_seller_marketplace.sql', true);

    // 4. Verify Foreign Key Integrity (0 errors)
    const fkViolations = await env.DB.prepare('PRAGMA foreign_key_check;').all();
    expect(fkViolations.results).toEqual([]);

    // 5. Verify ALL 4 legacy users & roles are intact and have is_seller = 0
    const usersAfter = await env.DB.prepare('SELECT id, role, status, is_seller FROM users ORDER BY id ASC').all<{
      id: string;
      role: string;
      status: string;
      is_seller: number;
    }>();
    expect(usersAfter.results).toEqual([
      { id: 'usr_legacy_admin', role: 'SUPER_ADMIN', status: 'ACTIVE', is_seller: 0 },
      { id: 'usr_legacy_cust', role: 'CUSTOMER', status: 'ACTIVE', is_seller: 0 },
      { id: 'usr_legacy_op', role: 'ORDER_OPERATOR', status: 'ACTIVE', is_seller: 0 },
      { id: 'usr_legacy_pm', role: 'PRODUCT_MANAGER', status: 'ACTIVE', is_seller: 0 },
    ]);

    // 6. Verify child tables were NOT cascade-wiped or nulled out
    const addressAfter = await env.DB.prepare('SELECT id, user_id, street_address FROM addresses WHERE id = ?')
      .bind('addr_legacy_1')
      .first<{ id: string; user_id: string; street_address: string }>();
    expect(addressAfter).toEqual({
      id: 'addr_legacy_1',
      user_id: 'usr_legacy_cust',
      street_address: '123 Lê Lợi',
    });

    const cartAfter = await env.DB.prepare('SELECT id, user_id, status FROM carts WHERE id = ?')
      .bind('cart_legacy_1')
      .first<{ id: string; user_id: string; status: string }>();
    expect(cartAfter).toEqual({
      id: 'cart_legacy_1',
      user_id: 'usr_legacy_cust',
      status: 'ACTIVE',
    });

    const cartItemsAfter = await env.DB.prepare('SELECT id, quantity FROM cart_items WHERE cart_id = ?')
      .bind('cart_legacy_1')
      .all<{ id: string; quantity: number }>();
    expect(cartItemsAfter.results).toEqual([{ id: 'ci_legacy_1', quantity: 2 }]);

    const orderAfter = await env.DB.prepare('SELECT id, user_id, total_amount FROM orders WHERE id = ?')
      .bind('ord_legacy_1')
      .first<{ id: string; user_id: string; total_amount: number }>();
    expect(orderAfter).toEqual({
      id: 'ord_legacy_1',
      user_id: 'usr_legacy_cust',
      total_amount: 429000,
    });

    const auditAfter = await env.DB.prepare('SELECT id, user_id FROM audit_logs WHERE id = ?')
      .bind('aud_legacy_1')
      .first<{ id: string; user_id: string }>();
    expect(auditAfter).toEqual({
      id: 'aud_legacy_1',
      user_id: 'usr_legacy_admin',
    });

    // 7. Verify legacy product & legacy order_items have store_id = NULL (Admin/Official ownership)
    const productAfter = await env.DB.prepare('SELECT id, store_id, is_active FROM products WHERE id = ?')
      .bind('prd_legacy_1')
      .first<{ id: string; store_id: string | null; is_active: number }>();
    expect(productAfter).toEqual({
      id: 'prd_legacy_1',
      store_id: null,
      is_active: 1,
    });

    const orderItemAfter = await env.DB.prepare('SELECT id, store_id, fulfillment_status FROM order_items WHERE id = ?')
      .bind('oi_legacy_1')
      .first<{ id: string; store_id: string | null; fulfillment_status: string }>();
    expect(orderItemAfter).toEqual({
      id: 'oi_legacy_1',
      store_id: null,
      fulfillment_status: 'PENDING',
    });

    // 8. Verify runtime login, profile, order history, checkout & admin dashboard still work seamlessly
    const custLoginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'buyer.legacy@edgecart.com', password: 'LegacyPass123!' }),
      },
      env
    );
    expect(custLoginRes.status).toBe(200);
    const custLoginBody = (await custLoginRes.json()) as any;
    expect(custLoginBody.data.user.role).toBe('CUSTOMER');
    const custToken = custLoginBody.data.accessToken;

    // Customer views legacy order
    const custOrdersRes = await app.request(
      '/api/v1/orders',
      { method: 'GET', headers: { Authorization: `Bearer ${custToken}` } },
      env
    );
    expect(custOrdersRes.status).toBe(200);
    const custOrdersBody = (await custOrdersRes.json()) as any;
    expect(custOrdersBody.data.length).toBe(1);
    expect(custOrdersBody.data[0].orderNumber).toBe('EC-LEGACY-001');

    // Customer checks out their pre-migration cart
    const checkoutRes = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${custToken}`,
        },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: 'Khách Hàng Cũ',
            phone: '0911222333',
            province: 'TP. Hồ Chí Minh',
            district: 'Quận 1',
            ward: 'Phường Bến Nghé',
            streetAddress: '123 Lê Lợi',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );
    expect(checkoutRes.status).toBe(201);

    // Super Admin logs in and accesses Admin Dashboard
    const adminLoginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'superadmin@edgecart.com', password: 'LegacyPass123!' }),
      },
      env
    );
    expect(adminLoginRes.status).toBe(200);
    const adminToken = ((await adminLoginRes.json()) as any).data.accessToken;

    const adminStatsRes = await app.request(
      '/api/v1/admin/dashboard/stats',
      { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } },
      env
    );
    expect(adminStatsRes.status).toBe(200);
    const adminStatsBody = (await adminStatsRes.json()) as any;
    expect(adminStatsBody.data.totalCustomers).toBe(1);
    expect(adminStatsBody.data.totalProducts).toBe(1);
  });

  it('should enforce all foreign keys, CHECK constraints, UNIQUE constraints, and indexes on 0002 schema', async () => {
    const env = createTestEnv();
    const rawD1 = env.__rawD1;

    // 1. Verify all expected indexes exist in sqlite_master
    const indexRows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all<{ name: string }>();
    const indexNames = new Set(indexRows.results.map((r) => r.name));

    const expectedIndexes = [
      'idx_users_role_status',
      'idx_users_is_seller',
      'idx_stores_owner_user_id',
      'idx_stores_slug',
      'idx_stores_status',
      'idx_seller_requests_user_status',
      'idx_seller_requests_status_created',
      'idx_seller_requests_one_pending_per_user',
      'idx_products_store_active',
      'idx_order_items_store_order',
    ];
    for (const idx of expectedIndexes) {
      expect(indexNames.has(idx)).toBe(true);
    }

    // 2. Verify users.role CHECK constraint still strictly allows only the 4 original DB roles (not BUYER or SELLER)
    expect(() => {
      rawD1
        .prepare("INSERT INTO users (id, email, password_hash, full_name, role) VALUES ('u_bad_role1', 'b1@test.com', 'h', 'Test', 'BUYER')")
        .run();
    }).toThrow();

    expect(() => {
      rawD1
        .prepare("INSERT INTO users (id, email, password_hash, full_name, role) VALUES ('u_bad_role2', 'b2@test.com', 'h', 'Test', 'SELLER')")
        .run();
    }).toThrow();

    // 3. Verify users.is_seller CHECK constraint only allows 0 or 1
    expect(() => {
      rawD1
        .prepare("INSERT INTO users (id, email, password_hash, full_name, role, is_seller) VALUES ('u_bad_flag', 'bf@test.com', 'h', 'Test', 'CUSTOMER', 2)")
        .run();
    }).toThrow();

    // Seed valid users & category for FK tests
    rawD1
      .prepare(`
        INSERT INTO users (id, email, password_hash, full_name, role, is_seller)
        VALUES
          ('u_seller_1', 'seller1@test.com', 'h', 'Seller One', 'CUSTOMER', 1),
          ('u_seller_2', 'seller2@test.com', 'h', 'Seller Two', 'CUSTOMER', 0),
          ('u_reviewer', 'admin@test.com', 'h', 'Reviewer Admin', 'SUPER_ADMIN', 0);
      `)
      .run();
    rawD1.prepare("INSERT INTO categories (id, name, slug) VALUES ('cat_t', 'Tech', 'tech')").run();

    // 4. Verify stores FK, 1-store-per-user UNIQUE, case-insensitive slug UNIQUE, status CHECK, and ON DELETE RESTRICT
    expect(() => {
      rawD1
        .prepare("INSERT INTO stores (id, owner_user_id, name, slug) VALUES ('st_ghost', 'non_existent_user', 'Ghost', 'ghost')")
        .run();
    }).toThrow();

    rawD1
      .prepare("INSERT INTO stores (id, owner_user_id, name, slug, status) VALUES ('st_1', 'u_seller_1', 'Dragon Official', 'dragon-shop', 'ACTIVE')")
      .run();

    // Duplicate owner_user_id must fail
    expect(() => {
      rawD1
        .prepare("INSERT INTO stores (id, owner_user_id, name, slug) VALUES ('st_dup_owner', 'u_seller_1', 'Second Store', 'second-store')")
        .run();
    }).toThrow();

    // Case-insensitive duplicate slug must fail
    expect(() => {
      rawD1
        .prepare("INSERT INTO stores (id, owner_user_id, name, slug) VALUES ('st_dup_slug', 'u_seller_2', 'Dragon Clone', 'DRAGON-SHOP')")
        .run();
    }).toThrow();

    // Invalid store status must fail
    expect(() => {
      rawD1.prepare("UPDATE stores SET status = 'DELETED' WHERE id = 'st_1'").run();
    }).toThrow();

    // ON DELETE RESTRICT must block hard-deleting a user who owns a store
    expect(() => {
      rawD1.prepare("DELETE FROM users WHERE id = 'u_seller_1'").run();
    }).toThrow();

    // 5. Verify seller_requests partial unique index (only 1 PENDING request per user, re-apply allowed after REJECTED)
    rawD1
      .prepare(`
        INSERT INTO seller_requests (id, user_id, store_name, store_slug, status)
        VALUES ('sr_1', 'u_seller_2', 'Shop Two', 'shop-two', 'PENDING');
      `)
      .run();

    // Concurrent/second PENDING request for same user must fail at DB engine level
    expect(() => {
      rawD1
        .prepare(`
          INSERT INTO seller_requests (id, user_id, store_name, store_slug, status)
          VALUES ('sr_2', 'u_seller_2', 'Shop Two Retry', 'shop-two-retry', 'PENDING');
        `)
        .run();
    }).toThrow();

    // Once rejected by reviewer, user CAN submit a fresh PENDING request
    rawD1
      .prepare(`
        UPDATE seller_requests
        SET status = 'REJECTED', rejection_reason = 'Thiếu thông tin liên hệ', reviewed_by = 'u_reviewer'
        WHERE id = 'sr_1';
      `)
      .run();

    rawD1
      .prepare(`
        INSERT INTO seller_requests (id, user_id, store_name, store_slug, status)
        VALUES ('sr_3', 'u_seller_2', 'Shop Two V2', 'shop-two-v2', 'PENDING');
      `)
      .run();

    const userRequests = await env.DB.prepare('SELECT id, status FROM seller_requests WHERE user_id = ? ORDER BY id ASC')
      .bind('u_seller_2')
      .all<{ id: string; status: string }>();
    expect(userRequests.results).toEqual([
      { id: 'sr_1', status: 'REJECTED' },
      { id: 'sr_3', status: 'PENDING' },
    ]);

    // 6. Verify products.store_id & order_items.store_id FKs and ON DELETE SET NULL + fulfillment_status CHECK
    expect(() => {
      rawD1
        .prepare("INSERT INTO products (id, category_id, store_id, name, slug, base_price) VALUES ('p_bad', 'cat_t', 'missing_store', 'Bad', 'bad', 1000)")
        .run();
    }).toThrow();

    rawD1
      .prepare("INSERT INTO products (id, category_id, store_id, name, slug, base_price) VALUES ('p_seller', 'cat_t', 'st_1', 'Seller Mouse', 'seller-mouse', 250000)")
      .run();

    rawD1
      .prepare(`
        INSERT INTO orders (
          id, order_number, user_id, customer_email, customer_phone,
          shipping_name, shipping_address, shipping_province, shipping_district, shipping_ward,
          payment_method, subtotal, total_amount
        ) VALUES (
          'ord_t1', 'EC-T-001', 'u_seller_2', 'seller2@test.com', '0909998888',
          'Buyer', '1 Street', 'HCM', 'Q1', 'P1', 'COD', 250000, 250000
        );
      `)
      .run();

    rawD1
      .prepare(`
        INSERT INTO order_items (
          id, order_id, product_id, variant_id, store_id, product_name, variant_title, sku, unit_price, quantity, total_price, fulfillment_status
        ) VALUES (
          'oi_t1', 'ord_t1', 'p_seller', 'var_1', 'st_1', 'Seller Mouse', 'Default', 'SKU-SM-1', 250000, 1, 250000, 'CONFIRMED'
        );
      `)
      .run();

    // Invalid fulfillment_status must fail
    expect(() => {
      rawD1.prepare("UPDATE order_items SET fulfillment_status = 'UNKNOWN' WHERE id = 'oi_t1'").run();
    }).toThrow();

    // Deleting store sets store_id to NULL on products and order_items without deleting historical records
    rawD1.prepare("DELETE FROM stores WHERE id = 'st_1'").run();

    const prodAfterStoreDel = await env.DB.prepare("SELECT store_id FROM products WHERE id = 'p_seller'").first<{ store_id: string | null }>();
    const oiAfterStoreDel = await env.DB.prepare("SELECT store_id, fulfillment_status FROM order_items WHERE id = 'oi_t1'").first<{
      store_id: string | null;
      fulfillment_status: string;
    }>();
    expect(prodAfterStoreDel?.store_id).toBeNull();
    expect(oiAfterStoreDel).toEqual({ store_id: null, fulfillment_status: 'CONFIRMED' });
  });

  it('should validate shared constants and strict Zod schemas against privilege escalation', () => {
    // 1. USER_ROLES keeps exact 4 DB roles (no BUYER or SELLER enum pollution)
    expect(Object.values(USER_ROLES)).toEqual(['CUSTOMER', 'SUPER_ADMIN', 'PRODUCT_MANAGER', 'ORDER_OPERATOR']);
    expect(Object.values(STORE_STATUS)).toEqual(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
    expect(Object.values(SELLER_REQUEST_STATUS)).toEqual(['PENDING', 'APPROVED', 'REJECTED']);

    // 2. RegisterSchema.strict() rejects attempts to inject role or isSeller during signup
    const escalationAttempt = RegisterSchema.safeParse({
      email: 'attacker@test.com',
      password: 'Password123!',
      fullName: 'Attacker',
      role: 'SUPER_ADMIN',
      isSeller: true,
    });
    expect(escalationAttempt.success).toBe(false);

    // 3. CreateSellerRequestSchema validates slug & Vietnamese phone format
    expect(
      CreateSellerRequestSchema.safeParse({
        storeName: 'Cửa Hàng Rồng Xanh',
        storeSlug: 'cua-hang-rong-xanh',
        phone: '0912345678',
      }).success
    ).toBe(true);

    expect(
      CreateSellerRequestSchema.safeParse({
        storeName: 'Bad Slug Store',
        storeSlug: 'Bad Slug With Spaces!',
      }).success
    ).toBe(false);

    // 4. ReviewSellerRequestSchema requires rejectionReason when REJECTED
    expect(
      ReviewSellerRequestSchema.safeParse({
        status: 'REJECTED',
      }).success
    ).toBe(false);

    expect(
      ReviewSellerRequestSchema.safeParse({
        status: 'REJECTED',
        rejectionReason: 'Tên cửa hàng không hợp lệ',
      }).success
    ).toBe(true);

    expect(
      ReviewSellerRequestSchema.safeParse({
        status: 'APPROVED',
      }).success
    ).toBe(true);

    // 5. UpdateUserRoleSchema forbids escalating arbitrary accounts to SUPER_ADMIN via API
    expect(UpdateUserRoleSchema.safeParse({ role: 'SUPER_ADMIN' }).success).toBe(false);
    expect(UpdateUserRoleSchema.safeParse({ role: 'PRODUCT_MANAGER' }).success).toBe(true);
    expect(UpdateUserRoleSchema.safeParse({ role: 'ORDER_OPERATOR' }).success).toBe(true);

    // 6. SellerProductCreateSchema forbids client-injected storeId (.strict())
    expect(
      SellerProductCreateSchema.safeParse({
        categoryId: 'cat_1',
        storeId: 'spoofed_store_id',
        name: 'Spoofed Product',
        slug: 'spoofed-product',
        basePrice: 100000,
        variants: [{ sku: 'SKU-1', title: 'Default', price: 100000, stockQuantity: 5 }],
      }).success
    ).toBe(false);
  });
});
