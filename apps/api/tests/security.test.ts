import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import { signJwt } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/crypto.js';
import type { Env } from '../src/types/env.js';

describe('Security, RBAC, CORS & Input Validation Tests', () => {
  let env: Env;
  let customerToken: string;
  let adminToken: string;

  beforeEach(async () => {
    env = createTestEnv();

    const passwordHash = await hashPassword('TestPass123!');

    // Seed authoritative D1 user records required by requireAuth
    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, is_seller, status)
      VALUES
        ('usr_customer', 'customer@test.com', ?, 'Customer Test', 'CUSTOMER', 0, 'ACTIVE'),
        ('usr_admin', 'admin@test.com', ?, 'Super Admin Test', 'SUPER_ADMIN', 0, 'ACTIVE');
    `)
      .bind(passwordHash, passwordHash)
      .run();

    customerToken = await signJwt(
      { sub: 'usr_customer', email: 'customer@test.com', role: 'CUSTOMER' },
      env.JWT_SECRET,
      3600
    );

    adminToken = await signJwt(
      { sub: 'usr_admin', email: 'admin@test.com', role: 'SUPER_ADMIN' },
      env.JWT_SECRET,
      3600
    );

    // Seed product
    await env.DB.prepare(`
      INSERT INTO categories (id, name, slug) VALUES ('cat_sec', 'Bảo Mật', 'bao-mat');
    `).run();
    await env.DB.prepare(`
      INSERT INTO products (id, category_id, name, slug, base_price, is_active)
      VALUES ('prd_sec', 'cat_sec', 'Sản phẩm thử nghiệm', 'san-pham-thu-nghiem', 100000, 1);
    `).run();
  });

  it('should neutralize SQL Injection attempts in product queries', async () => {
    const sqlInjectionPayload = "' OR '1'='1' -- ";
    const res = await app.request(
      `/api/v1/products?q=${encodeURIComponent(sqlInjectionPayload)}`,
      { method: 'GET' },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(0);
  });

  it('should reject malformed input with 422 Validation Error', async () => {
    const res = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email-format',
          password: '123',
          fullName: '',
        }),
      },
      env
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.length).toBeGreaterThan(0);
  });

  it('should enforce Role-Based Access Control (RBAC) and forbid Customer from Admin & Seller endpoints', async () => {
    // Customer attempts to access Admin Dashboard
    const customerRes = await app.request(
      '/api/v1/admin/dashboard/stats',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${customerToken}` },
      },
      env
    );

    expect(customerRes.status).toBe(403);
    const customerBody = (await customerRes.json()) as any;
    expect(customerBody.success).toBe(false);
    expect(customerBody.error.code).toBe('FORBIDDEN_ACCESS');

    // Customer (not approved Seller) attempts to access Seller Dashboard
    const sellerAttemptRes = await app.request(
      '/api/v1/seller/dashboard/stats',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${customerToken}` },
      },
      env
    );

    expect(sellerAttemptRes.status).toBe(403);
    const sellerAttemptBody = (await sellerAttemptRes.json()) as any;
    expect(sellerAttemptBody.success).toBe(false);
    expect(sellerAttemptBody.error.code).toBe('SELLER_NOT_APPROVED');

    // Admin attempts to access Admin Dashboard
    const adminRes = await app.request(
      '/api/v1/admin/dashboard/stats',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      env
    );

    expect(adminRes.status).toBe(200);
    const adminBody = (await adminRes.json()) as any;
    expect(adminBody.success).toBe(true);
  });

  it('should enforce exact CORS allowlist (buydragon.pages.dev, localhost, configured APP_URL) and reject wildcards/examples', async () => {
    // 1. Localhost dev origin allowed
    const localRes = await app.request(
      '/health',
      {
        method: 'GET',
        headers: { Origin: 'http://localhost:5173' },
      },
      env
    );
    expect(localRes.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(localRes.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(localRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(localRes.headers.get('X-Frame-Options')).toBe('DENY');

    // 2. Official production Pages origin https://buydragon.pages.dev allowed + X-Session-Id preflight
    const prodPreflightRes = await app.request(
      '/api/v1/cart',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://buydragon.pages.dev',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization, X-Session-Id',
        },
      },
      env
    );
    expect(prodPreflightRes.headers.get('Access-Control-Allow-Origin')).toBe('https://buydragon.pages.dev');
    expect(prodPreflightRes.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(prodPreflightRes.headers.get('Access-Control-Allow-Headers')).toContain('X-Session-Id');

    // 3. Request without Origin header must NOT return '*' alongside credentials
    const noOriginRes = await app.request('/health', { method: 'GET' }, env);
    expect(noOriginRes.headers.get('Access-Control-Allow-Origin')).toBeNull();

    // 4. Unconfigured *.pages.dev origins & placeholder example domains MUST be rejected
    for (const untrustedOrigin of [
      'https://evil-hacker.pages.dev',
      'https://staging.edgecart-frontend.pages.dev',
      'https://edgecart.com',
      'https://staging.edgecart.com',
    ]) {
      const envWithPlaceholder = { ...env, APP_URL: 'https://edgecart.com' };
      const untrustedRes = await app.request(
        '/health',
        {
          method: 'GET',
          headers: { Origin: untrustedOrigin },
        },
        envWithPlaceholder
      );
      expect(untrustedRes.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }

    // 5. Explicit ALLOWED_ORIGINS / real APP_URL works when configured
    const envWithExplicitAllowed: Env = {
      ...env,
      ALLOWED_ORIGINS: 'https://preview-1.buydragon.pages.dev',
    };
    const explicitRes = await app.request(
      '/health',
      {
        method: 'GET',
        headers: { Origin: 'https://preview-1.buydragon.pages.dev' },
      },
      envWithExplicitAllowed
    );
    expect(explicitRes.headers.get('Access-Control-Allow-Origin')).toBe('https://preview-1.buydragon.pages.dev');
  });
});
