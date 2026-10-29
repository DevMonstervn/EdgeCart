import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import { hashPassword } from '../src/utils/crypto.js';
import { signJwt } from '../src/utils/jwt.js';
import type { Env } from '../src/types/env.js';

describe('Phase 4: Complete End-to-End Marketplace Flow, Optional-Auth Token Expiry & Upload RBAC', () => {
  let env: Env;
  let superAdminToken: string;
  let productManagerToken: string;
  let orderOperatorToken: string;

  beforeEach(async () => {
    env = createTestEnv();
    const pwHash = await hashPassword('AdminPass123!');

    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, is_seller, status)
      VALUES
        ('usr_super', 'super@edgecart.com', ?, 'Super Admin', '0900000001', 'SUPER_ADMIN', 0, 'ACTIVE'),
        ('usr_pm', 'pm@edgecart.com', ?, 'Product Manager', '0900000002', 'PRODUCT_MANAGER', 0, 'ACTIVE'),
        ('usr_oo', 'oo@edgecart.com', ?, 'Order Operator', '0900000003', 'ORDER_OPERATOR', 0, 'ACTIVE');
    `)
      .bind(pwHash, pwHash, pwHash)
      .run();

    // Seed official category & legacy Official Platform Product (store_id = NULL)
    await env.DB.prepare(`
      INSERT INTO categories (id, name, slug, is_active)
      VALUES ('cat_tech', 'Thiết Bị Số', 'thiet-bi-so', 1);
    `).run();

    await env.DB.prepare(`
      INSERT INTO products (id, category_id, store_id, name, slug, base_price, sale_price, is_featured, is_active)
      VALUES ('prd_official_01', 'cat_tech', NULL, 'Chuột Không Dây EdgeCart Official', 'chuot-khong-day-official', 450000, 390000, 1, 1);
    `).run();

    await env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES ('var_official_01', 'prd_official_01', 'EC-MOUSE-01', 'Đen Nhám', 390000, 15, 1);
    `).run();

    superAdminToken = await signJwt({ sub: 'usr_super', email: 'super@edgecart.com', role: 'SUPER_ADMIN' }, env.JWT_SECRET, 900);
    productManagerToken = await signJwt({ sub: 'usr_pm', email: 'pm@edgecart.com', role: 'PRODUCT_MANAGER' }, env.JWT_SECRET, 900);
    orderOperatorToken = await signJwt({ sub: 'usr_oo', email: 'oo@edgecart.com', role: 'ORDER_OPERATOR' }, env.JWT_SECRET, 900);
  });

  it('executes complete E2E journey: Buyer register/login -> request seller -> Admin approve -> Seller re-login -> manage store & product -> Buyer view/cart/checkout -> Seller view & fulfill order', async () => {
    // 1. Future Seller registers as Buyer (CUSTOMER, isSeller = false) and logs in
    const sellerRegRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'merchant@edgecart.com',
          password: 'Password123!',
          fullName: 'Nguyễn Minh Quân',
          phone: '0912345678',
        }),
      },
      env
    );
    expect(sellerRegRes.status).toBe(201);
    const sellerRegBody = (await sellerRegRes.json()) as any;
    expect(sellerRegBody.data.user.role).toBe('CUSTOMER');
    expect(sellerRegBody.data.user.isSeller).toBe(false);

    const initialLoginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'merchant@edgecart.com',
          password: 'Password123!',
        }),
      },
      env
    );
    expect(initialLoginRes.status).toBe(200);
    const initialLoginBody = (await initialLoginRes.json()) as any;
    const preApprovalToken = initialLoginBody.data.accessToken as string;

    // Unapproved buyer is blocked from /seller/*
    const prematureSellerRes = await app.request(
      '/api/v1/seller/store',
      { method: 'GET', headers: { Authorization: `Bearer ${preApprovalToken}` } },
      env
    );
    expect(prematureSellerRes.status).toBe(403);
    expect(((await prematureSellerRes.json()) as any).error.code).toBe('SELLER_NOT_APPROVED');

    // 2. Buyer submits Seller onboarding request
    const createReqRes = await app.request(
      '/api/v1/seller-requests',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${preApprovalToken}`,
        },
        body: JSON.stringify({
          storeName: 'Quân Gear Studio',
          storeSlug: 'quan-gear-studio',
          storeDescription: 'Chuyên bàn phím cơ custom chính hãng',
          phone: '0912345678',
          businessEmail: 'contact@quangear.vn',
        }),
      },
      env
    );
    expect(createReqRes.status).toBe(201);
    const requestId = ((await createReqRes.json()) as any).data.id as string;

    // 3. PRODUCT_MANAGER and ORDER_OPERATOR cannot review seller requests (403)
    for (const staffToken of [productManagerToken, orderOperatorToken]) {
      const forbiddenReview = await app.request(
        `/api/v1/admin/seller-requests/${requestId}/review`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${staffToken}`,
          },
          body: JSON.stringify({ status: 'APPROVED' }),
        },
        env
      );
      expect(forbiddenReview.status).toBe(403);
    }

    // 4. SUPER_ADMIN approves Seller request
    const approveRes = await app.request(
      `/api/v1/admin/seller-requests/${requestId}/review`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({ status: 'APPROVED' }),
      },
      env
    );
    expect(approveRes.status).toBe(200);
    const approveBody = (await approveRes.json()) as any;
    expect(approveBody.data.request.status).toBe('APPROVED');
    expect(approveBody.data.store.slug).toBe('quan-gear-studio');
    const storeId = approveBody.data.store.id as string;

    // 5. Seller logs in again -> role remains CUSTOMER, isSeller is now true
    const sellerReLoginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'merchant@edgecart.com',
          password: 'Password123!',
        }),
      },
      env
    );
    expect(sellerReLoginRes.status).toBe(200);
    const sellerReLoginBody = (await sellerReLoginRes.json()) as any;
    expect(sellerReLoginBody.data.user.role).toBe('CUSTOMER');
    expect(sellerReLoginBody.data.user.isSeller).toBe(true);
    const sellerToken = sellerReLoginBody.data.accessToken as string;

    // Seller STILL cannot access /admin/* (403 FORBIDDEN_ACCESS)
    const sellerAdminAttempt = await app.request(
      '/api/v1/admin/dashboard/stats',
      { method: 'GET', headers: { Authorization: `Bearer ${sellerToken}` } },
      env
    );
    expect(sellerAdminAttempt.status).toBe(403);

    // 6. Seller updates store profile, creates product, updates product & restocks inventory
    const updateStoreRes = await app.request(
      '/api/v1/seller/store',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sellerToken}`,
        },
        body: JSON.stringify({
          name: 'Quân Gear Studio Official',
          description: 'Bàn phím cơ Hotswap & Switch cao cấp',
          phone: '0912345678',
          email: 'contact@quangear.vn',
        }),
      },
      env
    );
    expect(updateStoreRes.status).toBe(200);

    const createProdRes = await app.request(
      '/api/v1/seller/products',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sellerToken}`,
        },
        body: JSON.stringify({
          categoryId: 'cat_tech',
          name: 'Bàn Phím Cơ QK75 Nhôm CNC',
          slug: 'ban-phim-co-qk75-nhom-cnc',
          description: 'Khung nhôm CNC nguyên khối, mạch 3 mode',
          basePrice: 2800000,
          salePrice: 2500000,
          variants: [
            {
              sku: 'QG-QK75-NAVY',
              title: 'Navy / Linear Switch',
              price: 2500000,
              stockQuantity: 4,
              option1Name: 'Màu sắc',
              option1Value: 'Navy',
            },
          ],
        }),
      },
      env
    );
    expect(createProdRes.status).toBe(201);
    const createdProduct = ((await createProdRes.json()) as any).data;
    const sellerProductId = createdProduct.id as string;
    const sellerVariantId = createdProduct.variants[0].id as string;

    // Warm KV cache on public product detail, then verify Seller update invalidates KV cache
    const firstDetailRes = await app.request('/api/v1/products/ban-phim-co-qk75-nhom-cnc', { method: 'GET' }, env);
    expect(firstDetailRes.status).toBe(200);
    expect(((await firstDetailRes.json()) as any).data.salePrice).toBe(2500000);

    const updateProdRes = await app.request(
      `/api/v1/seller/products/${sellerProductId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sellerToken}`,
        },
        body: JSON.stringify({ salePrice: 2400000 }),
      },
      env
    );
    expect(updateProdRes.status).toBe(200);

    // Adjust inventory (+2 -> stock becomes 6)
    const adjustInvRes = await app.request(
      '/api/v1/seller/inventory/adjust',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sellerToken}`,
        },
        body: JSON.stringify({
          variantId: sellerVariantId,
          changeQuantity: 2,
          type: 'MANUAL_IMPORT',
          notes: 'Nhập thêm lô mới',
        }),
      },
      env
    );
    expect(adjustInvRes.status).toBe(200);
    const invListRes = await app.request(
      '/api/v1/seller/inventory',
      { method: 'GET', headers: { Authorization: `Bearer ${sellerToken}` } },
      env
    );
    expect(invListRes.status).toBe(200);
    expect(((await invListRes.json()) as any).data[0].stockQuantity).toBe(6);

    // 7. Second Buyer registers, browses public Store & Product (sees invalidated fresh KV data)
    const buyerRegRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'customer.hoa@edgecart.com',
          password: 'Password123!',
          fullName: 'Lê Thị Hoa',
          phone: '0987654321',
        }),
      },
      env
    );
    expect(buyerRegRes.status).toBe(201);
    const buyerToken = ((await buyerRegRes.json()) as any).data.accessToken as string;

    const storePublicRes = await app.request('/api/v1/stores/quan-gear-studio', { method: 'GET' }, env);
    expect(storePublicRes.status).toBe(200);
    const storePublicBody = (await storePublicRes.json()) as any;
    expect(storePublicBody.data.store.name).toBe('Quân Gear Studio Official');
    expect(storePublicBody.data.products.length).toBe(1);

    const freshDetailRes = await app.request('/api/v1/products/ban-phim-co-qk75-nhom-cnc', { method: 'GET' }, env);
    const freshDetailBody = (await freshDetailRes.json()) as any;
    expect(freshDetailBody.data.salePrice).toBe(2400000);
    expect(freshDetailBody.data.store.name).toBe('Quân Gear Studio Official');
    expect(freshDetailBody.data.variants[0].stockQuantity).toBe(6);

    // 8. Buyer adds Seller product + Official product to cart, tests cumulative stock guard & quantity update
    const addSellerItemRes = await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${buyerToken}`,
        },
        body: JSON.stringify({ variantId: sellerVariantId, quantity: 4 }),
      },
      env
    );
    expect(addSellerItemRes.status).toBe(200);
    const cartAfterFirstAdd = ((await addSellerItemRes.json()) as any).data;
    const sellerCartItemId = cartAfterFirstAdd.items[0].id as string;

    // Cumulative stock check: 4 already in cart + 3 more = 7 > 6 stock -> 400
    const exceedCumulativeRes = await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${buyerToken}`,
        },
        body: JSON.stringify({ variantId: sellerVariantId, quantity: 3 }),
      },
      env
    );
    expect(exceedCumulativeRes.status).toBe(400);
    expect(((await exceedCumulativeRes.json()) as any).error.message).toContain('Kho chỉ còn 6');

    // Update Seller item quantity to 2 (using real D1 cart_items.id)
    const updateCartQtyRes = await app.request(
      `/api/v1/cart/items/${sellerCartItemId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${buyerToken}`,
        },
        body: JSON.stringify({ quantity: 2 }),
      },
      env
    );
    expect(updateCartQtyRes.status).toBe(200);
    expect(((await updateCartQtyRes.json()) as any).data.items[0].quantity).toBe(2);

    // Also add Official platform product (store_id = NULL) for mixed checkout
    const addOfficialItemRes = await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${buyerToken}`,
        },
        body: JSON.stringify({ variantId: 'var_official_01', quantity: 1 }),
      },
      env
    );
    expect(addOfficialItemRes.status).toBe(200);
    const mixedCart = ((await addOfficialItemRes.json()) as any).data;
    expect(mixedCart.items.length).toBe(2);
    // 2 * 2,400,000 (synced variant price) + 1 * 390,000 = 5,190,000 (>= 500k -> shippingFee = 0)
    expect(mixedCart.subtotal).toBe(5190000);

    // 9. Buyer submits mixed checkout + replays same Idempotency-Key
    const idemKey = `e2e-idem-${crypto.randomUUID()}`;
    const checkoutPayload = {
      shippingAddress: {
        recipientName: 'Lê Thị Hoa',
        phone: '0987654321',
        province: 'TP. Hồ Chí Minh',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        streetAddress: 'Số 10 Nguyễn Huệ',
      },
      paymentMethod: 'COD',
      notes: 'Gọi trước khi giao 15 phút',
    };

    const checkoutRes1 = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${buyerToken}`,
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify(checkoutPayload),
      },
      env
    );
    expect(checkoutRes1.status).toBe(201);
    const checkoutData1 = ((await checkoutRes1.json()) as any).data;
    expect(checkoutData1.totalAmount).toBe(5190000);

    // Replay with identical Idempotency-Key -> no double stock deduction
    const checkoutRes2 = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${buyerToken}`,
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify(checkoutPayload),
      },
      env
    );
    expect(checkoutRes2.status).toBe(201);
    expect(((await checkoutRes2.json()) as any).data.orderId).toBe(checkoutData1.orderId);

    // Stock after checkout: Seller variant 6 - 2 = 4; Official variant 15 - 1 = 14
    const sellerStockAfter = await env.DB.prepare('SELECT stock_quantity FROM product_variants WHERE id = ?')
      .bind(sellerVariantId)
      .first<{ stock_quantity: number }>();
    expect(sellerStockAfter?.stock_quantity).toBe(4);

    // Public PDP KV cache must also reflect post-checkout stock = 4 (not stale 6)
    const detailAfterCheckout = await app.request('/api/v1/products/ban-phim-co-qk75-nhom-cnc', { method: 'GET' }, env);
    expect(((await detailAfterCheckout.json()) as any).data.variants[0].stockQuantity).toBe(4);

    // 10. Seller views dashboard stats & seller orders (strictly isolated to own store items)
    const sellerStatsRes = await app.request(
      '/api/v1/seller/dashboard/stats',
      { method: 'GET', headers: { Authorization: `Bearer ${sellerToken}` } },
      env
    );
    expect(sellerStatsRes.status).toBe(200);
    const sellerStats = ((await sellerStatsRes.json()) as any).data;
    expect(sellerStats.totalOrders).toBe(1);
    expect(sellerStats.totalRevenue).toBe(0); // COD order not yet DELIVERED/PAID
    expect(sellerStats.recentOrders[0].storeSubtotal).toBe(4800000); // Only Seller's 2 * 2,400,000, NOT Official's 390,000!

    const sellerOrdersRes = await app.request(
      '/api/v1/seller/orders',
      { method: 'GET', headers: { Authorization: `Bearer ${sellerToken}` } },
      env
    );
    expect(sellerOrdersRes.status).toBe(200);
    const sellerOrders = ((await sellerOrdersRes.json()) as any).data;
    expect(sellerOrders.length).toBe(1);
    expect(sellerOrders[0].items.length).toBe(1);
    expect(sellerOrders[0].items[0].storeId).toBe(storeId);
    expect(sellerOrders[0].storeSubtotal).toBe(4800000);

    // Seller cannot cancel order (400), but can advance fulfillment CONFIRMED -> SHIPPING -> DELIVERED
    const illegalSellerCancel = await app.request(
      `/api/v1/seller/orders/${checkoutData1.orderId}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sellerToken}`,
        },
        body: JSON.stringify({ status: 'CANCELLED' }),
      },
      env
    );
    expect(illegalSellerCancel.status).toBe(400);

    const confirmRes = await app.request(
      `/api/v1/seller/orders/${checkoutData1.orderId}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sellerToken}`,
        },
        body: JSON.stringify({ status: 'CONFIRMED' }),
      },
      env
    );
    expect(confirmRes.status).toBe(200);

    const shipRes = await app.request(
      `/api/v1/seller/orders/${checkoutData1.orderId}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sellerToken}`,
        },
        body: JSON.stringify({ status: 'SHIPPING' }),
      },
      env
    );
    expect(shipRes.status).toBe(200);

    const deliverRes = await app.request(
      `/api/v1/seller/orders/${checkoutData1.orderId}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sellerToken}`,
        },
        body: JSON.stringify({ status: 'DELIVERED' }),
      },
      env
    );
    expect(deliverRes.status).toBe(200);

    // Once DELIVERED, Seller's realized revenue is 4,800,000 (strictly excluding Official item's 390,000)
    const sellerStatsDelivered = (
      (await (
        await app.request(
          '/api/v1/seller/dashboard/stats',
          { method: 'GET', headers: { Authorization: `Bearer ${sellerToken}` } },
          env
        )
      ).json()) as any
    ).data;
    expect(sellerStatsDelivered.totalRevenue).toBe(4800000);

    // Buyer sees both items and updated Seller fulfillmentStatus on GET /api/v1/orders
    const buyerOrdersRes = await app.request(
      '/api/v1/orders',
      { method: 'GET', headers: { Authorization: `Bearer ${buyerToken}` } },
      env
    );
    expect(buyerOrdersRes.status).toBe(200);
    const buyerOrders = ((await buyerOrdersRes.json()) as any).data;
    expect(buyerOrders.length).toBe(1);
    expect(buyerOrders[0].items.length).toBe(2);
    const sellerOrderItem = buyerOrders[0].items.find((i: any) => i.storeId === storeId);
    const officialOrderItem = buyerOrders[0].items.find((i: any) => i.storeId === null);
    expect(sellerOrderItem.fulfillmentStatus).toBe('DELIVERED');
    expect(officialOrderItem.fulfillmentStatus).toBe('PENDING');
  });

  it('returns 401 AUTH_TOKEN_EXPIRED when expired Bearer token hits /cart or /checkout (enabling refresh), while allowing headerless Guest checkout', async () => {
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'refresh.buyer@edgecart.com',
          password: 'Password123!',
          fullName: 'Buyer Refresh',
          phone: '0911222333',
        }),
      },
      env
    );
    const regData = ((await regRes.json()) as any).data;
    const validAccessToken = regData.accessToken as string;
    const refreshToken = regData.refreshToken as string;
    const buyerId = regData.user.id as string;

    // Buyer adds item while token is valid
    await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAccessToken}`,
        },
        body: JSON.stringify({ variantId: 'var_official_01', quantity: 1 }),
      },
      env
    );

    // Simulate expired access token
    const expiredToken = await signJwt(
      { sub: buyerId, email: 'refresh.buyer@edgecart.com', role: 'CUSTOMER' },
      env.JWT_SECRET,
      -30
    );

    // /cart and /checkout MUST return 401 AUTH_TOKEN_EXPIRED instead of silently treating Buyer as Guest
    const expiredCartRes = await app.request(
      '/api/v1/cart',
      { method: 'GET', headers: { Authorization: `Bearer ${expiredToken}` } },
      env
    );
    expect(expiredCartRes.status).toBe(401);
    expect(((await expiredCartRes.json()) as any).error.code).toBe('AUTH_TOKEN_EXPIRED');

    const expiredCheckoutRes = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${expiredToken}`,
        },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: 'Buyer Refresh',
            phone: '0911222333',
            province: 'Hà Nội',
            district: 'Đống Đa',
            ward: 'Láng Hạ',
            streetAddress: 'Số 12 Láng Hạ',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );
    expect(expiredCheckoutRes.status).toBe(401);

    // Client refreshes token via POST /api/v1/auth/refresh and retries checkout -> 201 attached to buyerId
    const refreshRes = await app.request(
      '/api/v1/auth/refresh',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      },
      env
    );
    expect(refreshRes.status).toBe(200);
    const refreshedAccessToken = ((await refreshRes.json()) as any).data.accessToken as string;

    const retryCheckoutRes = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshedAccessToken}`,
        },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: 'Buyer Refresh',
            phone: '0911222333',
            province: 'Hà Nội',
            district: 'Đống Đa',
            ward: 'Láng Hạ',
            streetAddress: 'Số 12 Láng Hạ',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );
    expect(retryCheckoutRes.status).toBe(201);
    const orderRow = await env.DB.prepare('SELECT user_id FROM orders WHERE id = ?')
      .bind(((await retryCheckoutRes.json()) as any).data.orderId)
      .first<{ user_id: string | null }>();
    expect(orderRow?.user_id).toBe(buyerId);

    // Meanwhile, an unauthenticated Guest checkout without login is strictly rejected with 401
    const guestSessionId = 'guest_sess_phase4';
    const guestAddRes = await app.request(
      '/api/v1/cart/items',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': guestSessionId },
        body: JSON.stringify({ variantId: 'var_official_01', quantity: 1 }),
      },
      env
    );
    expect(guestAddRes.status).toBe(200);

    const guestCheckoutRes = await app.request(
      '/api/v1/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': guestSessionId },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: 'Khách Vãng Lai',
            phone: '0933444555',
            province: 'Đà Nẵng',
            district: 'Hải Châu',
            ward: 'Thạch Thang',
            streetAddress: 'Số 55 Bạch Đằng',
          },
          paymentMethod: 'COD',
        }),
      },
      env
    );
    expect(guestCheckoutRes.status).toBe(401);
    expect(((await guestCheckoutRes.json()) as any).error.message).toContain('đăng nhập');
  });

  it('verifies upload presigned-url RBAC across all 5 personas & suspended store restriction', async () => {
    const pwHash = await hashPassword('Pass123456!');
    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, is_seller, status)
      VALUES
        ('usr_cust_plain', 'plain@edgecart.com', ?, 'Plain Buyer', 'CUSTOMER', 0, 'ACTIVE'),
        ('usr_seller_up', 'seller.up@edgecart.com', ?, 'Upload Seller', 'CUSTOMER', 1, 'ACTIVE');
    `)
      .bind(pwHash, pwHash)
      .run();

    await env.DB.prepare(`
      INSERT INTO stores (id, owner_user_id, name, slug, status)
      VALUES ('sto_upload_01', 'usr_seller_up', 'Upload Store', 'upload-store', 'ACTIVE');
    `).run();

    const plainBuyerToken = await signJwt({ sub: 'usr_cust_plain', email: 'plain@edgecart.com', role: 'CUSTOMER' }, env.JWT_SECRET, 900);
    const sellerToken = await signJwt({ sub: 'usr_seller_up', email: 'seller.up@edgecart.com', role: 'CUSTOMER' }, env.JWT_SECRET, 900);

    // 1. Plain CUSTOMER -> 403
    const custRes = await app.request(
      '/api/v1/uploads/presigned-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${plainBuyerToken}` },
        body: JSON.stringify({ fileName: 'avatar.png' }),
      },
      env
    );
    expect(custRes.status).toBe(403);

    // 2. ORDER_OPERATOR -> 403
    const ooRes = await app.request(
      '/api/v1/uploads/presigned-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orderOperatorToken}` },
        body: JSON.stringify({ fileName: 'banner.jpg' }),
      },
      env
    );
    expect(ooRes.status).toBe(403);

    // 3. PRODUCT_MANAGER & SUPER_ADMIN -> 200 under 'products/' prefix
    for (const token of [productManagerToken, superAdminToken]) {
      const staffRes = await app.request(
        '/api/v1/uploads/presigned-url',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ fileName: 'hero.png' }),
        },
        env
      );
      expect(staffRes.status).toBe(200);
      expect(((await staffRes.json()) as any).data.r2Key).toMatch(/^products\/\d+_.*\.png$/);
    }

    // 4. Active approved SELLER -> 200 isolated under 'stores/sto_upload_01/' prefix
    const sellerOkRes = await app.request(
      '/api/v1/uploads/presigned-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({ fileName: 'keyboard.webp' }),
      },
      env
    );
    expect(sellerOkRes.status).toBe(200);
    expect(((await sellerOkRes.json()) as any).data.r2Key).toMatch(/^stores\/sto_upload_01\/\d+_.*\.webp$/);

    // 5. Suspended store -> 403 STORE_SUSPENDED
    await env.DB.prepare(`UPDATE stores SET status = 'SUSPENDED' WHERE id = 'sto_upload_01'`).run();
    const suspendedRes = await app.request(
      '/api/v1/uploads/presigned-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerToken}` },
        body: JSON.stringify({ fileName: 'keyboard.webp' }),
      },
      env
    );
    expect(suspendedRes.status).toBe(403);
    expect(((await suspendedRes.json()) as any).error.code).toBe('STORE_SUSPENDED');
  });
});
