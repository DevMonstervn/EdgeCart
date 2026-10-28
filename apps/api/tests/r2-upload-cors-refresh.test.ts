import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import { hashPassword } from '../src/utils/crypto.js';
import { signJwt } from '../src/utils/jwt.js';
import { signUploadToken } from '../src/utils/r2-upload.js';
import { MAX_IMAGE_UPLOAD_BYTES } from '@edgecart/shared';

// Valid minimal 1x1 PNG binary (67 bytes) starting with 89 50 4E 47 0D 0A 1A 0A
const VALID_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

// Valid minimal RIFF....WEBP header +VP8L chunk
const VALID_WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
  0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
  0x00, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe,
  0x07, 0x00,
]);

describe('Post-Phase-4 Hardening: Cloudflare R2 Upload, Staging CORS & KV Paginated Refresh Sessions', () => {
  let env: ReturnType<typeof createTestEnv>;
  let superAdminToken: string;
  let productManagerToken: string;
  let orderOperatorToken: string;
  let buyerToken: string;
  let sellerAToken: string;
  let sellerBToken: string;

  beforeEach(async () => {
    env = createTestEnv();
    const pwHash = await hashPassword('Pass123456!');

    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, is_seller, status)
      VALUES
        ('usr_sa', 'sa@edgecart.vn', ?, 'Super Admin', 'SUPER_ADMIN', 0, 'ACTIVE'),
        ('usr_pm', 'pm@edgecart.vn', ?, 'Product Manager', 'PRODUCT_MANAGER', 0, 'ACTIVE'),
        ('usr_oo', 'oo@edgecart.vn', ?, 'Order Operator', 'ORDER_OPERATOR', 0, 'ACTIVE'),
        ('usr_buyer', 'buyer@edgecart.vn', ?, 'Buyer Customer', 'CUSTOMER', 0, 'ACTIVE'),
        ('usr_seller_a', 'seller.a@edgecart.vn', ?, 'Seller Alpha', 'CUSTOMER', 1, 'ACTIVE'),
        ('usr_seller_b', 'seller.b@edgecart.vn', ?, 'Seller Beta', 'CUSTOMER', 1, 'ACTIVE');
    `)
      .bind(pwHash, pwHash, pwHash, pwHash, pwHash, pwHash)
      .run();

    await env.DB.prepare(`
      INSERT INTO stores (id, owner_user_id, name, slug, status)
      VALUES
        ('sto_alpha', 'usr_seller_a', 'Alpha Store', 'alpha-store', 'ACTIVE'),
        ('sto_beta', 'usr_seller_b', 'Beta Store', 'beta-store', 'ACTIVE');
    `).run();

    await env.DB.prepare(`
      INSERT INTO categories (id, name, slug, sort_order, is_active)
      VALUES ('cat_tech', 'Thiết Bị Số', 'thiet-bi-so', 1, 1);
    `).run();

    superAdminToken = await signJwt({ sub: 'usr_sa', email: 'sa@edgecart.vn', role: 'SUPER_ADMIN' }, env.JWT_SECRET, 900);
    productManagerToken = await signJwt({ sub: 'usr_pm', email: 'pm@edgecart.vn', role: 'PRODUCT_MANAGER' }, env.JWT_SECRET, 900);
    orderOperatorToken = await signJwt({ sub: 'usr_oo', email: 'oo@edgecart.vn', role: 'ORDER_OPERATOR' }, env.JWT_SECRET, 900);
    buyerToken = await signJwt({ sub: 'usr_buyer', email: 'buyer@edgecart.vn', role: 'CUSTOMER' }, env.JWT_SECRET, 900);
    sellerAToken = await signJwt({ sub: 'usr_seller_a', email: 'seller.a@edgecart.vn', role: 'CUSTOMER' }, env.JWT_SECRET, 900);
    sellerBToken = await signJwt({ sub: 'usr_seller_b', email: 'seller.b@edgecart.vn', role: 'CUSTOMER' }, env.JWT_SECRET, 900);
  });

  describe('1. Real Cloudflare R2 Upload & product_images Persistence', () => {
    it('uploads binary images to R2, serves them publicly without fake CDN URLs, and persists product_images on create & update', async () => {
      // Step 1: Seller A requests signed upload URL for PNG
      const presignRes = await app.request(
        'http://localhost:8787/api/v1/uploads/presigned-url',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sellerAToken}`,
          },
          body: JSON.stringify({
            fileName: 'mech-keyboard-front.png',
            contentType: 'image/png',
            fileSize: VALID_PNG_BYTES.byteLength,
          }),
        },
        env
      );
      expect(presignRes.status).toBe(200);
      const presignJson = (await presignRes.json()) as any;
      expect(presignJson.success).toBe(true);

      const { uploadUrl, publicUrl, r2Key, contentType, maxSizeBytes } = presignJson.data;
      expect(r2Key).toMatch(/^stores\/sto_alpha\/\d+_[a-f0-9]+\.png$/);
      expect(contentType).toBe('image/png');
      expect(maxSizeBytes).toBe(MAX_IMAGE_UPLOAD_BYTES);

      // Must NOT return fake URLs or fake signatures
      expect(uploadUrl).not.toContain('r2.edgecart.com');
      expect(uploadUrl).not.toContain('test_valid_sig');
      expect(publicUrl).not.toContain('cdn.edgecart.com');
      expect(uploadUrl).toContain(`/api/v1/uploads/direct/${r2Key}?token=`);
      expect(publicUrl).toBe(`http://localhost:8787/api/v1/uploads/files/${r2Key}`);

      // Step 2: Binary PUT to uploadUrl writes object into R2 bucket
      const putRes = await app.request(
        uploadUrl,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: VALID_PNG_BYTES,
        },
        env
      );
      expect(putRes.status).toBe(201);
      const putJson = (await putRes.json()) as any;
      expect(putJson.data).toEqual({
        r2Key,
        imageUrl: publicUrl,
        contentType: 'image/png',
        size: VALID_PNG_BYTES.byteLength,
      });
      expect(env.__rawR2.has(r2Key)).toBe(true);

      // Step 3: Browser / Buyer reads GET /api/v1/uploads/files/:key without Authorization header
      const getFileRes = await app.request(publicUrl, { method: 'GET' }, env);
      expect(getFileRes.status).toBe(200);
      expect(getFileRes.headers.get('Content-Type')).toBe('image/png');
      expect(getFileRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
      const downloadedBytes = new Uint8Array(await getFileRes.arrayBuffer());
      expect(Array.from(downloadedBytes)).toEqual(Array.from(VALID_PNG_BYTES));

      // Step 4: Seller A creates product with images[] -> persisted in product_images table
      const createProdRes = await app.request(
        'http://localhost:8787/api/v1/seller/products',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sellerAToken}`,
          },
          body: JSON.stringify({
            categoryId: 'cat_tech',
            name: 'Bàn Phím Cơ Edge 75',
            slug: 'ban-phim-co-edge-75',
            basePrice: 1890000,
            salePrice: 1590000,
            images: [
              {
                imageUrl: publicUrl,
                r2Key,
                altText: 'Góc nhìn mặt trước bàn phím Edge 75',
                sortOrder: 0,
              },
            ],
            variants: [
              {
                sku: 'ALPHA-KB75-01',
                title: 'Red Switch',
                price: 1590000,
                stockQuantity: 15,
              },
            ],
          }),
        },
        env
      );
      expect(createProdRes.status).toBe(201);
      const createdProd = ((await createProdRes.json()) as any).data;
      expect(createdProd.images).toHaveLength(1);
      expect(createdProd.images[0].r2Key).toBe(r2Key);
      expect(createdProd.images[0].imageUrl).toBe(publicUrl);
      expect(createdProd.images[0].altText).toBe('Góc nhìn mặt trước bàn phím Edge 75');

      // Verify raw D1 product_images row & cart thumbnail join (sort_order = 0)
      const dbImages = await env.DB.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC')
        .bind(createdProd.id)
        .all<any>();
      expect(dbImages.results).toHaveLength(1);
      expect(dbImages.results[0].r2_key).toBe(r2Key);
      expect(dbImages.results[0].sort_order).toBe(0);

      const addCartRes = await app.request(
        'http://localhost:8787/api/v1/cart/items',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${buyerToken}` },
          body: JSON.stringify({ variantId: createdProd.variants[0].id, quantity: 1 }),
        },
        env
      );
      expect(addCartRes.status).toBe(200);
      const cartData = ((await addCartRes.json()) as any).data;
      expect(cartData.items[0].imageUrl).toBe(publicUrl);

      // Step 5: Upload second WebP image & update product so WebP becomes cover (sortOrder = 0)
      const presign2Res = await app.request(
        'http://localhost:8787/api/v1/uploads/presigned-url',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
          body: JSON.stringify({
            fileName: 'mech-keyboard-side.webp',
            contentType: 'image/webp',
            fileSize: VALID_WEBP_BYTES.byteLength,
          }),
        },
        env
      );
      const presign2 = ((await presign2Res.json()) as any).data;
      const put2Res = await app.request(
        presign2.uploadUrl,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'image/webp' },
          body: VALID_WEBP_BYTES,
        },
        env
      );
      expect(put2Res.status).toBe(201);

      const updateProdRes = await app.request(
        `http://localhost:8787/api/v1/seller/products/${createdProd.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
          body: JSON.stringify({
            images: [
              { imageUrl: presign2.publicUrl, r2Key: presign2.r2Key, altText: 'Ảnh nghiêng mới', sortOrder: 0 },
              { imageUrl: publicUrl, r2Key, altText: 'Ảnh mặt trước', sortOrder: 1 },
            ],
          }),
        },
        env
      );
      expect(updateProdRes.status).toBe(200);
      const updatedProd = ((await updateProdRes.json()) as any).data;
      expect(updatedProd.images).toHaveLength(2);
      expect(updatedProd.images[0].r2Key).toBe(presign2.r2Key);
      expect(updatedProd.images[1].r2Key).toBe(r2Key);

      // Step 6: Official Admin (PRODUCT_MANAGER) can also upload under products/ and create official product with image
      const adminPresignRes = await app.request(
        'http://localhost:8787/api/v1/uploads/presigned-url',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${productManagerToken}` },
          body: JSON.stringify({
            fileName: 'official-hub.png',
            contentType: 'image/png',
            fileSize: VALID_PNG_BYTES.byteLength,
          }),
        },
        env
      );
      expect(adminPresignRes.status).toBe(200);
      const adminPresign = ((await adminPresignRes.json()) as any).data;
      expect(adminPresign.r2Key).toMatch(/^products\/\d+_[a-f0-9]+\.png$/);

      const adminPutRes = await app.request(
        adminPresign.uploadUrl,
        { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG_BYTES },
        env
      );
      expect(adminPutRes.status).toBe(201);

      const adminCreateRes = await app.request(
        'http://localhost:8787/api/v1/admin/products',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${productManagerToken}` },
          body: JSON.stringify({
            categoryId: 'cat_tech',
            name: 'USB-C Hub EdgeCart Official',
            slug: 'usb-c-hub-edgecart-official',
            basePrice: 590000,
            images: [{ imageUrl: adminPresign.publicUrl, r2Key: adminPresign.r2Key, altText: 'USB-C Hub' }],
            variants: [{ sku: 'EC-HUB-01', title: 'Xám không gian', price: 590000, stockQuantity: 30 }],
          }),
        },
        env
      );
      expect(adminCreateRes.status).toBe(201);
      expect(((await adminCreateRes.json()) as any).data.images).toHaveLength(1);
    });

    it('rejects invalid file extensions, MIME mismatches, oversized (>5MB) files, empty payloads, and spoofed magic bytes', async () => {
      // 1. Disallowed extensions (.svg, .exe, missing extension) -> 400
      for (const badBody of [
        { fileName: 'xss.svg', contentType: 'image/svg+xml', fileSize: 512 },
        { fileName: 'payload.exe', fileSize: 1024 },
        { fileName: 'noextension', fileSize: 512 },
        { fileName: 'mismatch.png', contentType: 'image/jpeg', fileSize: 512 },
        { fileName: 'empty.png', contentType: 'image/png', fileSize: 0 },
        { fileName: 'huge.png', contentType: 'image/png', fileSize: MAX_IMAGE_UPLOAD_BYTES + 1 },
      ]) {
        const res = await app.request(
          'http://localhost:8787/api/v1/uploads/presigned-url',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
            body: JSON.stringify(badBody),
          },
          env
        );
        expect(res.status).toBe(400);
      }

      // 2. Spoofed binary content (HTML/script disguised as .png) -> 400 on PUT and NOT stored in R2
      const fakePngPayload = new TextEncoder().encode('<html><script>alert("xss")</script></html>');
      const presignRes = await app.request(
        'http://localhost:8787/api/v1/uploads/presigned-url',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
          body: JSON.stringify({
            fileName: 'disguised.png',
            contentType: 'image/png',
            fileSize: fakePngPayload.byteLength,
          }),
        },
        env
      );
      expect(presignRes.status).toBe(200);
      const { uploadUrl, r2Key } = ((await presignRes.json()) as any).data;

      const spoofPutRes = await app.request(
        uploadUrl,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: fakePngPayload,
        },
        env
      );
      expect(spoofPutRes.status).toBe(400);
      expect(env.__rawR2.has(r2Key)).toBe(false);

      // 3. Empty binary body on PUT -> 400
      const presignNoSizeRes = await app.request(
        'http://localhost:8787/api/v1/uploads/presigned-url',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
          body: JSON.stringify({ fileName: 'valid-name.png' }),
        },
        env
      );
      const { uploadUrl: noSizeUploadUrl } = ((await presignNoSizeRes.json()) as any).data;
      const emptyPutRes = await app.request(
        noSizeUploadUrl,
        { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(0) },
        env
      );
      expect(emptyPutRes.status).toBe(400);
    });

    it('enforces authentication, Seller RBAC, signed token integrity, post-presign suspension, and cross-store r2Key isolation', async () => {
      // 1. Unauthenticated -> 401
      const unauthRes = await app.request(
        'http://localhost:8787/api/v1/uploads/presigned-url',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: 'a.png' }) },
        env
      );
      expect(unauthRes.status).toBe(401);

      // 2. Plain CUSTOMER & ORDER_OPERATOR -> 403
      for (const forbiddenToken of [buyerToken, orderOperatorToken]) {
        const res = await app.request(
          'http://localhost:8787/api/v1/uploads/presigned-url',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${forbiddenToken}` },
            body: JSON.stringify({ fileName: 'a.png', contentType: 'image/png', fileSize: 100 }),
          },
          env
        );
        expect(res.status).toBe(403);
      }

      // 3. Forged token, expired token, or mismatched r2Key path on PUT -> 401 / 403
      const validPresign = await app.request(
        'http://localhost:8787/api/v1/uploads/presigned-url',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
          body: JSON.stringify({ fileName: 'item.png', contentType: 'image/png', fileSize: VALID_PNG_BYTES.byteLength }),
        },
        env
      );
      const { uploadUrl, r2Key } = ((await validPresign.json()) as any).data;
      const tokenParam = new URL(uploadUrl).searchParams.get('token')!;

      const tamperedRes = await app.request(
        `http://localhost:8787/api/v1/uploads/direct/${r2Key}?token=${tokenParam}tampered`,
        { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG_BYTES },
        env
      );
      expect(tamperedRes.status).toBe(401);

      const expiredUploadToken = await signUploadToken(
        {
          sub: 'usr_seller_a',
          storeId: 'sto_alpha',
          r2Key,
          contentType: 'image/png',
          maxBytes: VALID_PNG_BYTES.byteLength,
          expectedSize: VALID_PNG_BYTES.byteLength,
        },
        env.JWT_SECRET,
        -10
      );
      const expiredPutRes = await app.request(
        `http://localhost:8787/api/v1/uploads/direct/${r2Key}?token=${encodeURIComponent(expiredUploadToken)}`,
        { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG_BYTES },
        env
      );
      expect(expiredPutRes.status).toBe(401);
      expect(((await expiredPutRes.json()) as any).error.code).toBe('AUTH_TOKEN_EXPIRED');

      // Replay Seller A's valid token against Seller B's store prefix -> 403
      const wrongPathRes = await app.request(
        `http://localhost:8787/api/v1/uploads/direct/stores/sto_beta/hijack.png?token=${encodeURIComponent(tokenParam)}`,
        { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG_BYTES },
        env
      );
      expect(wrongPathRes.status).toBe(403);

      // 4. Seller B cannot attach Seller A's r2Key or Official products/ r2Key when creating a product -> 403
      const crossStoreProdRes = await app.request(
        'http://localhost:8787/api/v1/seller/products',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerBToken}` },
          body: JSON.stringify({
            categoryId: 'cat_tech',
            name: 'Chuột Không Dây Beta',
            slug: 'chuot-khong-day-beta',
            basePrice: 450000,
            images: [{ imageUrl: `http://localhost:8787/api/v1/uploads/files/${r2Key}`, r2Key }],
            variants: [{ sku: 'BETA-M-01', title: 'Đen', price: 450000, stockQuantity: 10 }],
          }),
        },
        env
      );
      expect(crossStoreProdRes.status).toBe(403);

      // 5. Store suspended AFTER presigning blocks PUT -> 403 STORE_SUSPENDED
      await env.DB.prepare(`UPDATE stores SET status = 'SUSPENDED' WHERE id = 'sto_alpha'`).run();
      const suspendedPutRes = await app.request(
        uploadUrl,
        { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG_BYTES },
        env
      );
      expect(suspendedPutRes.status).toBe(403);
      expect(((await suspendedPutRes.json()) as any).error.code).toBe('STORE_SUSPENDED');
    });

    it('returns 500 INTERNAL_SERVER_ERROR cleanly when R2 storage fails during upload or read', async () => {
      const presignRes = await app.request(
        'http://localhost:8787/api/v1/uploads/presigned-url',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sellerAToken}` },
          body: JSON.stringify({
            fileName: 'r2-error.png',
            contentType: 'image/png',
            fileSize: VALID_PNG_BYTES.byteLength,
          }),
        },
        env
      );
      const { uploadUrl, publicUrl } = ((await presignRes.json()) as any).data;

      env.__rawR2.simulatePutError = true;
      const failPutRes = await app.request(
        uploadUrl,
        { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG_BYTES },
        env
      );
      expect(failPutRes.status).toBe(500);
      expect(((await failPutRes.json()) as any).error.code).toBe('INTERNAL_SERVER_ERROR');

      // Recover R2 put, upload succeeds, then simulate R2 get failure -> 500
      env.__rawR2.simulatePutError = false;
      const okPutRes = await app.request(
        uploadUrl,
        { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: VALID_PNG_BYTES },
        env
      );
      expect(okPutRes.status).toBe(201);

      env.__rawR2.simulateGetError = true;
      const failGetRes = await app.request(publicUrl, { method: 'GET' }, env);
      expect(failGetRes.status).toBe(500);
    });
  });

  describe('2. Staging & Production Explicit CORS Origins (No Arbitrary Wildcards)', () => {
    it('allows explicit Staging & Production Pages origins (including PUT preflight) and rejects wildcards / unapproved *.pages.dev', async () => {
      const stagingEnv = {
        ...env,
        ENVIRONMENT: 'staging',
        APP_URL: 'https://staging.buydragon.pages.dev',
        ALLOWED_ORIGINS: 'https://staging.buydragon.pages.dev,https://buydragon.pages.dev,*.pages.dev,*',
      };

      for (const validOrigin of ['https://staging.buydragon.pages.dev', 'https://buydragon.pages.dev', 'http://localhost:5173']) {
        const preflightRes = await app.request(
          'https://edgecart-api-staging.hoanglongkar5ls.workers.dev/api/v1/uploads/direct/products/test.png',
          {
            method: 'OPTIONS',
            headers: {
              Origin: validOrigin,
              'Access-Control-Request-Method': 'PUT',
              'Access-Control-Request-Headers': 'Content-Type',
            },
          },
          stagingEnv
        );
        expect(preflightRes.headers.get('Access-Control-Allow-Origin')).toBe(validOrigin);
        expect(preflightRes.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
      }

      // Evil *.pages.dev and placeholder domains MUST be rejected even if someone misconfigured '*' in ALLOWED_ORIGINS
      for (const untrustedOrigin of [
        'https://evil-attacker.pages.dev',
        'https://preview-spoof.buydragon.pages.dev.evil.com',
        'https://edgecart.com',
        'https://staging.edgecart.com',
      ]) {
        const res = await app.request(
          'https://edgecart-api-staging.hoanglongkar5ls.workers.dev/health',
          { method: 'GET', headers: { Origin: untrustedOrigin } },
          stagingEnv
        );
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
      }

      // Production environment only trusts explicit production origin(s), not localhost or staging
      const prodEnv = {
        ...env,
        ENVIRONMENT: 'production',
        APP_URL: 'https://buydragon.pages.dev',
        ALLOWED_ORIGINS: 'https://buydragon.pages.dev',
      };
      const prodAllowed = await app.request(
        'https://api.buydragon.vn/health',
        { method: 'GET', headers: { Origin: 'https://buydragon.pages.dev' } },
        prodEnv
      );
      expect(prodAllowed.headers.get('Access-Control-Allow-Origin')).toBe('https://buydragon.pages.dev');

      const prodLocalRejected = await app.request(
        'https://api.buydragon.vn/health',
        { method: 'GET', headers: { Origin: 'http://localhost:5173' } },
        prodEnv
      );
      expect(prodLocalRejected.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  describe('3. AuthService.refresh KV Pagination (>1,000 Sessions) & O(1) Lookup Compatibility', () => {
    it('refreshes in O(1) without KV.list for indexed sessions, paginates cleanly for legacy >1,000 KV keys, and honors Admin lock revocation', async () => {
      const pwHash = await hashPassword('Pass123456!');
      // User ID 'usr_zzzz_late' sorts lexicographically AFTER 'usr_0000'..'usr_1249' (page 2 of KV.list!)
      await env.DB.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, role, is_seller, status)
        VALUES ('usr_zzzz_late', 'late.user@edgecart.vn', ?, 'Late Page User', 'CUSTOMER', 0, 'ACTIVE');
      `)
        .bind(pwHash)
        .run();

      // Seed 1,250 active session keys in KV (exceeding Cloudflare KV's 1,000-key page limit)
      for (let i = 0; i < 1250; i++) {
        const padded = String(i).padStart(4, '0');
        await env.KV.put(
          `session:usr_${padded}:tok_${padded}`,
          JSON.stringify({ userId: `usr_${padded}`, email: `u${padded}@edgecart.vn` }),
          { expirationTtl: 604800 }
        );
      }

      // Case A: Standard login writes both session: and refresh_idx:, so refresh uses O(1) KV.get (0 KV.list calls!)
      const loginRes = await app.request(
        'http://localhost:8787/api/v1/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'late.user@edgecart.vn', password: 'Pass123456!' }),
        },
        env
      );
      expect(loginRes.status).toBe(200);
      const { refreshToken } = ((await loginRes.json()) as any).data;

      env.__rawKV.listCallCount = 0;
      const fastRefreshRes = await app.request(
        'http://localhost:8787/api/v1/auth/refresh',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        },
        env
      );
      expect(fastRefreshRes.status).toBe(200);
      expect(env.__rawKV.listCallCount).toBe(0);

      // Case B: Pre-existing legacy session on page 2 (no refresh_idx: key yet) paginates KV.list and backfills index!
      const legacyToken = 'legacy_unindexed_token_on_page_2';
      await env.KV.put(
        `session:usr_zzzz_late:${legacyToken}`,
        JSON.stringify({ userId: 'usr_zzzz_late', email: 'late.user@edgecart.vn' }),
        { expirationTtl: 604800 }
      );

      env.__rawKV.listCallCount = 0;
      const legacyRefreshRes = await app.request(
        'http://localhost:8787/api/v1/auth/refresh',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: legacyToken }),
        },
        env
      );
      expect(legacyRefreshRes.status).toBe(200);
      expect(env.__rawKV.listCallCount).toBe(2); // Page 1 (1,000 keys) + Page 2 (found usr_zzzz_late!)

      // Subsequent refresh of that legacy token now hits backfilled O(1) index (0 KV.list calls!)
      env.__rawKV.listCallCount = 0;
      const secondLegacyRefresh = await app.request(
        'http://localhost:8787/api/v1/auth/refresh',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: legacyToken }),
        },
        env
      );
      expect(secondLegacyRefresh.status).toBe(200);
      expect(env.__rawKV.listCallCount).toBe(0);

      // Case C: SUPER_ADMIN locks account -> revokes both session: and refresh_idx: immediately
      const lockRes = await app.request(
        'http://localhost:8787/api/v1/admin/users/usr_zzzz_late/status',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
          body: JSON.stringify({ status: 'BANNED', reason: 'Vi phạm chính sách' }),
        },
        env
      );
      expect(lockRes.status).toBe(200);

      for (const revokedTok of [refreshToken, legacyToken]) {
        const afterLockRefresh = await app.request(
          'http://localhost:8787/api/v1/auth/refresh',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: revokedTok }),
          },
          env
        );
        expect(afterLockRefresh.status).toBe(401);
      }
    });
  });
});
