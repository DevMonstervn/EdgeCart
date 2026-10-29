import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import type { Env } from '../src/types/env.js';

describe('Authentication & Authorization API Integration Tests', () => {
  let env: Env;

  beforeEach(() => {
    env = createTestEnv();
  });

  it('should register a new customer successfully', async () => {
    const res = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'customer@edgecart.com',
          password: 'Password123!',
          fullName: 'Nguyễn Văn A',
          phone: '0912345678',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('customer@edgecart.com');
    expect(body.data.user.role).toBe('CUSTOMER');
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
  });

  it('should reject registration with duplicate email', async () => {
    // 1st register
    await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'duplicate@edgecart.com',
          password: 'Password123!',
          fullName: 'User One',
        }),
      },
      env
    );

    // 2nd register with same email
    const res = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'DUPLICATE@edgecart.com', // Case insensitive check
          password: 'Password123!',
          fullName: 'User Two',
        }),
      },
      env
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('đã được sử dụng');
  });

  it('should login successfully with correct credentials', async () => {
    // Register first
    await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'login-test@edgecart.com',
          password: 'ValidPassword123!',
          fullName: 'Login User',
        }),
      },
      env
    );

    // Login
    const res = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'login-test@edgecart.com',
          password: 'ValidPassword123!',
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();
  });

  it('should fail login with incorrect password', async () => {
    await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'wrong-pass@edgecart.com',
          password: 'RealPassword123!',
          fullName: 'Test User',
        }),
      },
      env
    );

    const res = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'wrong-pass@edgecart.com',
          password: 'WrongPassword!',
        }),
      },
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });

  it('should fetch user profile with valid Bearer token', async () => {
    // Register
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'profile@edgecart.com',
          password: 'Password123!',
          fullName: 'Profile User',
        }),
      },
      env
    );
    const regData = (await regRes.json()) as any;
    const token = regData.data.accessToken;

    // Get /me
    const res = await app.request(
      '/api/v1/auth/me',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('profile@edgecart.com');
  });

  it('should update user profile information and avatar', async () => {
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'update-profile@edgecart.com',
          password: 'Password123!',
          fullName: 'Original Name',
        }),
      },
      env
    );
    const regData = (await regRes.json()) as any;
    const token = regData.data.accessToken;

    const updateRes = await app.request(
      '/api/v1/auth/profile',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: 'Updated Name',
          phone: '0987654321',
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
        }),
      },
      env
    );

    expect(updateRes.status).toBe(200);
    const updateBody = (await updateRes.json()) as any;
    expect(updateBody.success).toBe(true);
    expect(updateBody.data.fullName).toBe('Updated Name');
    expect(updateBody.data.phone).toBe('0987654321');
    expect(updateBody.data.avatarUrl).toBe('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200');

    // Verify GET /me reflects updated data
    const meRes = await app.request(
      '/api/v1/auth/me',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    const meBody = (await meRes.json()) as any;
    expect(meBody.data.fullName).toBe('Updated Name');
    expect(meBody.data.phone).toBe('0987654321');
    expect(meBody.data.avatarUrl).toBe('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200');
  });

  it('should reject access to protected routes without Authorization header', async () => {
    const res = await app.request('/api/v1/auth/me', { method: 'GET' }, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });
});
