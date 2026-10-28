import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import { hashPassword } from '../src/utils/crypto.js';
import { signJwt } from '../src/utils/jwt.js';
import type { Env } from '../src/types/env.js';

describe('Phase 2: Seller Onboarding, Store Ownership Isolation, Mixed Checkout & Legacy Compatibility', () => {
  let env: Env;
  let superAdminToken: string;
  let legacyBuyerToken: string;
  let sellerAToken: string;
  let sellerBToken: string;

  beforeEach(async () => {
    env = createTestEnv();
    const pwHash = await hashPassword('Pass123456!');

    // Seed SUPER_ADMIN, a legacy CUSTOMER buyer, and 2 CUSTOMER accounts that will apply for Seller
    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, is_seller, status)
      VALUES
        ('usr_admin', 'root@edgecart.com', ?, 'Root Super Admin', '0900000001', 'SUPER_ADMIN', 0, 'ACTIVE'),
        ('usr_buyer_legacy', 'legacy.buyer@edgecart.com', ?, 'Người Mua Cũ', '0900000002', 'CUSTOMER', 0, 'ACTIVE'),
        ('usr_seller_a', 'sellera@edgecart.com', ?, 'Chủ Shop A', '0900000003', 'CUSTOMER', 0, 'ACTIVE'),
        ('usr_seller_b', 'sellerb@edgecart.com', ?, 'Chủ Shop B', '0900000004', 'CUSTOMER', 0, 'ACTIVE');
    `)
      .bind(pwHash, pwHash, pwHash, pwHash)
      .run();

    // Seed category & legacy official Admin product (store_id = NULL) + legacy order (store_id = NULL)
    await env.DB.prepare(`
      INSERT INTO categories (id, name, slug, is_active)
      VALUES ('cat_fashion', 'Thời Trang', 'thoi-trang', 1);
    `).run();

    await env.DB.prepare(`
      INSERT INTO products (id, category_id, store_id, name, slug, base_price, sale_price, is_active)
      VALUES ('prd_official', 'cat_fashion', NULL, 'Áo Khoác EdgeCart Official', 'ao-khoac-edgecart-official', 600000, 500000, 1);
    `).run();

    await env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES ('var_official', 'prd_official', 'OFF-JKT-01', 'Navy / L', 500000, 20, 1);
    `).run();

    await env.DB.prepare(`
      INSERT INTO orders (
        id, order_number, user_id, customer_email, customer_phone,
        shipping_name, shipping_address, shipping_province, shipping_district, shipping_ward,
        payment_method, payment_status, shipping_status, subtotal, shipping_fee, total_amount
      ) VALUES (
        'ord_legacy', 'EC-100001-999', 'usr_buyer_legacy', 'legacy.buyer@edgecart.com', '0900000002',
        'Người Mua Cũ', '10 Nguyễn Huệ', 'TP.HCM', 'Quận 1', 'Bến Nghé',
        'COD', 'UNPAID', 'PENDING', 500000, 0, 500000
      );
    `).run();

    await env.DB.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, variant_id, store_id, product_name, variant_title, sku, unit_price, quantity, total_price
      ) VALUES (
        'oi_legacy', 'ord_legacy', 'prd_official', 'var_official', NULL, 'Áo Khoác EdgeCart Official', 'Navy / L', 'OFF-JKT-01', 500000, 1, 500000
      );
    `).run();

    superAdminToken = await signJwt({ sub: 'usr_admin', email: 'root@edgecart.com', role: 'SUPER_ADMIN' }, env.JWT_SECRET, 3600);
    legacyBuyerToken = await signJwt({ sub: 'usr_buyer_legacy', email: 'legacy.buyer@edgecart.com', role: 'CUSTOMER' }, env.JWT_SECRET, 3600);
    sellerAToken = await signJwt({ sub: 'usr_seller_a', email: 'sellera@edgecart.com', role: 'CUSTOMER' }, env.JWT_SECRET, 3600);
    sellerBToken = await signJwt({ sub: 'usr_seller_b', email: 'sellerb@edgecart.com', role: 'CUSTOMER' }, env.JWT_SECRET, 3600);
  });

  async function onboardSeller(userToken: string, storeName: string, storeSlug: string): Promise<string> {
    const reqRes = await app.request(
      '/api/v1/seller-requests',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({
          storeName,
          storeSlug,
          storeDescription: `Mô tả cửa hàng ${storeName}`,
          phone: '0912345678',
          businessEmail: `${storeSlug}@shop.vn`,
        }),
      },
      env
    );
    expect(reqRes.status).toBe(201);
    const reqBody = (await reqRes.json()) as any;
    const requestId = reqBody.data.id;

    const approveRes = await app.request(
      `/api/v1/admin/seller-requests/${requestId}/review`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
        body: JSON.stringify({ status: 'APPROVED' }),
      },
      env
    );
    expect(approveRes.status).toBe(200);
    const approveBody = (await approveRes.json()) as any;
    return approveBody.data.store.id as string;
  }

  it('should enforce full Seller application workflow: pending block -> reject -> re-apply -> approve without changing users.role', async () => {
    // 1. Submit initial application
    const submitRes = await app.request(
      '/api/v1/seller-requests',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
        body: JSON.stringify({
          storeName: 'Dragon Gear VN',
          storeSlug: 'dragon-gear-vn',
          storeDescription: 'Chuyên phụ kiện chính hãng',
          phone: '0987654321',
        }),
      },
      env
    );
    expect(submitRes.status).toBe(201);
    const firstReqId = ((await submitRes.json()) as any).data.id;

    // 2. Duplicate PENDING submission from same user MUST fail with 409
    const dupRes = await app.request(
      '/api/v1/seller-requests',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
        body: JSON.stringify({
          storeName: 'Shop Thứ 2',
          storeSlug: 'shop-thu-2',
        }),
      },
      env
    );
    expect(dupRes.status).toBe(409);

    // 3. While PENDING, user is still blocked from /api/v1/seller/*
    const pendingBlockedRes = await app.request(
      '/api/v1/seller/store',
      { headers: { Authorization: `Bearer ${sellerAToken}` } },
      env
    );
    expect(pendingBlockedRes.status).toBe(403);
    expect(((await pendingBlockedRes.json()) as any).error.code).toBe('SELLER_NOT_APPROVED');

    // 4. SUPER_ADMIN rejects without reason -> 422; rejects with reason -> 200
    const badRejectRes = await app.request(
      `/api/v1/admin/seller-requests/${firstReqId}/review`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
        body: JSON.stringify({ status: 'REJECTED' }),
      },
      env
    );
    expect(badRejectRes.status).toBe(422);

    const rejectRes = await app.request(
      `/api/v1/admin/seller-requests/${firstReqId}/review`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
        body: JSON.stringify({ status: 'REJECTED', rejectionReason: 'Vui lòng bổ sung mô tả chi tiết hơn' }),
      },
      env
    );
    expect(rejectRes.status).toBe(200);

    // Still blocked after rejection
    const rejectedBlockedRes = await app.request(
      '/api/v1/seller/store',
      { headers: { Authorization: `Bearer ${sellerAToken}` } },
      env
    );
    expect(rejectedBlockedRes.status).toBe(403);

    // 5. User can re-apply after rejection, and SUPER_ADMIN approves!
    const storeAId = await onboardSeller(sellerAToken, 'Dragon Gear Official', 'dragon-gear-vn');
    expect(storeAId).toBeTruthy();

    // 6. Verify users.role remains 'CUSTOMER' while isSeller === true on /auth/me!
    const meRes = await app.request(
      '/api/v1/auth/me',
      { headers: { Authorization: `Bearer ${sellerAToken}` } },
      env
    );
    expect(meRes.status).toBe(200);
    const meData = ((await meRes.json()) as any).data;
    expect(meData.role).toBe('CUSTOMER');
    expect(meData.isSeller).toBe(true);

    // 7. Seller can now view & update their own store profile (and existing JWT still works without storeId in JWT!)
    const updateStoreRes = await app.request(
      '/api/v1/seller/store',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
        body: JSON.stringify({
          name: 'Dragon Gear Flagship',
          description: 'Cửa hàng chính hãng đã xác thực',
        }),
      },
      env
    );
    expect(updateStoreRes.status).toBe(200);
    expect(((await updateStoreRes.json()) as any).data.name).toBe('Dragon Gear Flagship');
  });

  it('should strictly isolate Seller A, Seller B, and System (store_id = NULL) products, inventory & uploads', async () => {
    const storeAId = await onboardSeller(sellerAToken, 'Shop Alpha', 'shop-alpha');
    const storeBId = await onboardSeller(sellerBToken, 'Shop Beta', 'shop-beta');

    // 1. Attempting to inject fake storeId in POST /seller/products body MUST be rejected by strict schema (422)
    const spoofStoreIdRes = await app.request(
      '/api/v1/seller/products',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
        body: JSON.stringify({
          storeId: storeBId,
          categoryId: 'cat_fashion',
          name: 'Áo Spoof',
          slug: 'ao-spoof',
          basePrice: 200000,
          variants: [{ sku: 'SPF-01', title: 'M', price: 200000, stockQuantity: 10 }],
        }),
      },
      env
    );
    expect(spoofStoreIdRes.status).toBe(422);

    // 2. Seller A & Seller B create their own products
    const prdARes = await app.request(
      '/api/v1/seller/products',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
        body: JSON.stringify({
          categoryId: 'cat_fashion',
          name: 'Áo Hoodie Alpha',
          slug: 'ao-hoodie-alpha',
          basePrice: 320000,
          variants: [{ sku: 'ALP-HD-01', title: 'Đen / M', price: 320000, stockQuantity: 10 }],
        }),
      },
      env
    );
    expect(prdARes.status).toBe(201);
    const prdA = ((await prdARes.json()) as any).data;
    expect(prdA.storeId).toBe(storeAId);

    const prdBRes = await app.request(
      '/api/v1/seller/products',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerBToken}` },
        body: JSON.stringify({
          categoryId: 'cat_fashion',
          name: 'Quần Jeans Beta',
          slug: 'quan-jeans-beta',
          basePrice: 450000,
          variants: [{ sku: 'BET-JN-01', title: 'Xanh / 30', price: 450000, stockQuantity: 12 }],
        }),
      },
      env
    );
    expect(prdBRes.status).toBe(201);
    const prdB = ((await prdBRes.json()) as any).data;
    expect(prdB.storeId).toBe(storeBId);

    // 3. Seller A listing /seller/products ONLY sees Alpha's product (never Beta's or Official NULL product)
    const listARes = await app.request(
      '/api/v1/seller/products',
      { headers: { Authorization: `Bearer ${sellerAToken}` } },
      env
    );
    const listAData = ((await listARes.json()) as any).data;
    expect(listAData.length).toBe(1);
    expect(listAData[0].id).toBe(prdA.id);

    // 4. Seller A CANNOT update, delete, or adjust inventory of Seller B's product OR Official Admin product
    for (const forbiddenPrdId of [prdB.id, 'prd_official']) {
      const updateForbidden = await app.request(
        `/api/v1/seller/products/${forbiddenPrdId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
          body: JSON.stringify({ name: 'Hack Tên SP' }),
        },
        env
      );
      expect(updateForbidden.status).toBe(403);

      const deleteForbidden = await app.request(
        `/api/v1/seller/products/${forbiddenPrdId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${sellerAToken}` },
        },
        env
      );
      expect(deleteForbidden.status).toBe(403);
    }

    for (const forbiddenVariantId of [prdB.variants[0].id, 'var_official']) {
      const invForbidden = await app.request(
        '/api/v1/seller/inventory/adjust',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
          body: JSON.stringify({
            variantId: forbiddenVariantId,
            changeQuantity: -5,
            type: 'MANUAL_ADJUST',
          }),
        },
        env
      );
      expect(invForbidden.status).toBe(403);
    }

    // 5. Upload isolation: Seller A gets stores/<storeAId>/..., Buyer gets 403
    const uploadARes = await app.request(
      '/api/v1/uploads/presigned-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
        body: JSON.stringify({ fileName: 'hoodie.png' }),
      },
      env
    );
    expect(uploadARes.status).toBe(200);
    expect(((await uploadARes.json()) as any).data.r2Key).toMatch(new RegExp(`^stores/${storeAId}/.+\\.png$`));

    const uploadBuyerRes = await app.request(
      '/api/v1/uploads/presigned-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${legacyBuyerToken}` },
        body: JSON.stringify({ fileName: 'avatar.png' }),
      },
      env
    );
    expect(uploadBuyerRes.status).toBe(403);

    // 6. Public store endpoint GET /api/v1/stores/:slug returns store info + only active products of that store
    const publicStoreARes = await app.request('/api/v1/stores/shop-alpha', { method: 'GET' }, env);
    expect(publicStoreARes.status).toBe(200);
    const publicStoreABody = (await publicStoreARes.json()) as any;
    expect(publicStoreABody.data.store.id).toBe(storeAId);
    expect(publicStoreABody.data.products.length).toBe(1);
    expect(publicStoreABody.data.products[0].slug).toBe('ao-hoodie-alpha');
  });

  it('should preserve legacy orders, write accurate store_id on mixed-cart checkout, isolate Seller orders & enforce store suspension', async () => {
    const storeAId = await onboardSeller(sellerAToken, 'Shop Alpha', 'shop-alpha');
    const storeBId = await onboardSeller(sellerBToken, 'Shop Beta', 'shop-beta');

    // Create 1 product for Seller A & 1 product for Seller B
    const prdARes = await app.request(
      '/api/v1/seller/products',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
        body: JSON.stringify({
          categoryId: 'cat_fashion',
          name: 'Áo Polo Alpha',
          slug: 'ao-polo-alpha',
          basePrice: 250000,
          variants: [{ sku: 'ALP-PL-01', title: 'Trắng / L', price: 250000, stockQuantity: 5 }],
        }),
      },
      env
    );
    const varAId = ((await prdARes.json()) as any).data.variants[0].id;

    const prdBRes = await app.request(
      '/api/v1/seller/products',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerBToken}` },
        body: JSON.stringify({
          categoryId: 'cat_fashion',
          name: 'Mũ Lưỡi Trai Beta',
          slug: 'mu-luoi-trai-beta',
          basePrice: 150000,
          variants: [{ sku: 'BET-CAP-01', title: 'Đen', price: 150000, stockQuantity: 5 }],
        }),
      },
      env
    );
    const varBId = ((await prdBRes.json()) as any).data.variants[0].id;

    // 1. Legacy Buyer can still read their pre-existing legacy order (store_id = NULL)
    const legacyOrdersRes = await app.request(
      '/api/v1/orders/ord_legacy',
      { headers: { Authorization: `Bearer ${legacyBuyerToken}` } },
      env
    );
    expect(legacyOrdersRes.status).toBe(200);
    const legacyOrderBody = (await legacyOrdersRes.json()) as any;
    expect(legacyOrderBody.data.items[0].storeId).toBeNull();

    // Neither Seller A nor Seller B can see the legacy order (store_id = NULL)
    const sellerALegacyAttempt = await app.request(
      '/api/v1/seller/orders/ord_legacy',
      { headers: { Authorization: `Bearer ${sellerAToken}` } },
      env
    );
    expect(sellerALegacyAttempt.status).toBe(403);

    // 2. Legacy Buyer adds Official (NULL) + Seller A + Seller B items to Cart and checks out!
    for (const [variantId, quantity] of [
      ['var_official', 1],
      [varAId, 2],
      [varBId, 1],
    ] as const) {
      const addRes = await app.request(
        '/api/v1/cart/items',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${legacyBuyerToken}` },
          body: JSON.stringify({ variantId, quantity }),
        },
        env
      );
      expect(addRes.status).toBe(200);
    }

    const checkoutRes = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${legacyBuyerToken}` },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: 'Người Mua Cũ',
            phone: '0900000002',
            province: 'TP.HCM',
            district: 'Quận 1',
            ward: 'Bến Nghé',
            streetAddress: '10 Nguyễn Huệ',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );
    expect(checkoutRes.status).toBe(201);
    const mixedOrderId = ((await checkoutRes.json()) as any).data.orderId;

    // 3. Verify D1 order_items saved exact store_id: NULL for official, storeAId for A, storeBId for B
    const buyerOrderRes = await app.request(
      `/api/v1/orders/${mixedOrderId}`,
      { headers: { Authorization: `Bearer ${legacyBuyerToken}` } },
      env
    );
    const buyerOrderItems = ((await buyerOrderRes.json()) as any).data.items as any[];
    expect(buyerOrderItems.length).toBe(3);
    expect(buyerOrderItems.find((i) => i.variantId === 'var_official')?.storeId).toBeNull();
    expect(buyerOrderItems.find((i) => i.variantId === varAId)?.storeId).toBe(storeAId);
    expect(buyerOrderItems.find((i) => i.variantId === varBId)?.storeId).toBe(storeBId);

    // 4. Seller A viewing mixed order ONLY sees Store A's item (2 * 250,000 = 500,000), NOT Store B's or Official item!
    const sellerAOrderRes = await app.request(
      `/api/v1/seller/orders/${mixedOrderId}`,
      { headers: { Authorization: `Bearer ${sellerAToken}` } },
      env
    );
    expect(sellerAOrderRes.status).toBe(200);
    const sellerAOrder = ((await sellerAOrderRes.json()) as any).data;
    expect(sellerAOrder.items.length).toBe(1);
    expect(sellerAOrder.items[0].variantId).toBe(varAId);
    expect(sellerAOrder.storeSubtotal).toBe(500000);

    // Seller A updates fulfillment status to SHIPPING -> updates Store A's item without overwriting Store B's item
    const patchSellerARes = await app.request(
      `/api/v1/seller/orders/${mixedOrderId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
        body: JSON.stringify({ status: 'SHIPPING', note: 'Shop Alpha đã bàn giao ĐVVC' }),
      },
      env
    );
    expect(patchSellerARes.status).toBe(200);

    const sellerBOrderRes = await app.request(
      `/api/v1/seller/orders/${mixedOrderId}`,
      { headers: { Authorization: `Bearer ${sellerBToken}` } },
      env
    );
    const sellerBOrder = ((await sellerBOrderRes.json()) as any).data;
    expect(sellerBOrder.items.length).toBe(1);
    expect(sellerBOrder.items[0].fulfillmentStatus).toBe('PENDING');

    // 5. Prime KV cache for Store B's product, then SUPER_ADMIN suspends Store B -> immediately hidden & blocked!
    const detailBeforeSuspend = await app.request('/api/v1/products/mu-luoi-trai-beta', { method: 'GET' }, env);
    expect(detailBeforeSuspend.status).toBe(200);

    const suspendRes = await app.request(
      `/api/v1/admin/stores/${storeBId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
        body: JSON.stringify({ status: 'SUSPENDED', reason: 'Tạm đình chỉ kiểm tra chất lượng' }),
      },
      env
    );
    expect(suspendRes.status).toBe(200);

    // Store B product & storefront immediately return 404 (KV cache invalidated!)
    const detailAfterSuspend = await app.request('/api/v1/products/mu-luoi-trai-beta', { method: 'GET' }, env);
    expect(detailAfterSuspend.status).toBe(404);

    const storePageAfterSuspend = await app.request('/api/v1/stores/shop-beta', { method: 'GET' }, env);
    expect(storePageAfterSuspend.status).toBe(404);

    // Seller B is blocked from /api/v1/seller/* with STORE_SUSPENDED
    const sellerBBlocked = await app.request(
      '/api/v1/seller/dashboard/stats',
      { headers: { Authorization: `Bearer ${sellerBToken}` } },
      env
    );
    expect(sellerBBlocked.status).toBe(403);
    expect(((await sellerBBlocked.json()) as any).error.code).toBe('STORE_SUSPENDED');

    // Adding suspended store's variant to cart is rejected, while Official & Store A products remain active!
    const addSuspendedCartRes = await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${legacyBuyerToken}` },
        body: JSON.stringify({ variantId: varBId, quantity: 1 }),
      },
      env
    );
    expect(addSuspendedCartRes.status).toBe(400);

    const activeCatalogRes = await app.request('/api/v1/products', { method: 'GET' }, env);
    const activeSlugs = ((await activeCatalogRes.json()) as any).data.map((p: any) => p.slug);
    expect(activeSlugs).toContain('ao-khoac-edgecart-official');
    expect(activeSlugs).toContain('ao-polo-alpha');
    expect(activeSlugs).not.toContain('mu-luoi-trai-beta');
  });
});
