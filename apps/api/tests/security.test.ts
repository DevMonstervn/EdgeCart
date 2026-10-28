import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import { signJwt } from '../src/utils/jwt.js';
import type { Env } from '../src/types/env.js';

describe('Security, RBAC, CORS & Input Validation Tests', () => {
  let env: Env;
  let customerToken: string;
  let adminToken: string;

  beforeEach(async () => {
    env = createTestEnv();

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
    env.DB.prepare(`
      INSERT INTO categories (id, name, slug) VALUES ('cat_sec', 'Bảo Mật', 'bao-mat');
    `).run();
    env.DB.prepare(`
      INSERT INTO products (id, category_id, name, slug, base_price, is_active)
      VALUES ('prd_sec', 'cat_sec', 'Sản phẩm thử nghiệm', 'san-pham-thu-nghiem', 100000, 1);
    `).run();
  });

  it('should neutralize SQL Injection attempts in product queries', async () => {
    // Malicious SQL injection payload targeting products
    const sqlInjectionPayload = "' OR '1'='1' -- ";
    const res = await app.request(
      `/api/v1/products?q=${encodeURIComponent(sqlInjectionPayload)}`,
      { method: 'GET' },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    // Should safely return 0 results instead of leaking all products or crashing SQL syntax
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
          password: '123', // too short (< 8 chars)
          fullName: '', // empty
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

  it('should enforce Role-Based Access Control (RBAC) and forbid Customer from Admin endpoints', async () => {
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

  it('should return strict CORS and security headers for allowed origin', async () => {
    const res = await app.request(
      '/health',
      {
        method: 'GET',
        headers: { Origin: 'http://localhost:5173' },
      },
      env
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');

    // Official staging pages origin should be allowed
    const stagingPagesRes = await app.request(
      '/health',
      {
        method: 'GET',
        headers: { Origin: 'https://staging.edgecart-frontend.pages.dev' },
      },
      env
    );
    expect(stagingPagesRes.headers.get('Access-Control-Allow-Origin')).toBe('https://staging.edgecart-frontend.pages.dev');

    // Untrusted random pages.dev origin MUST be rejected
    const untrustedRes = await app.request(
      '/health',
      {
        method: 'GET',
        headers: { Origin: 'https://evil-hacker.pages.dev' },
      },
      env
    );
    expect(untrustedRes.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
