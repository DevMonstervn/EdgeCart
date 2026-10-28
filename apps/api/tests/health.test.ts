import { describe, it, expect } from 'vitest';
import app from '../src/index.js';

describe('API Health Endpoint', () => {
  it('should return 200 and healthy status', async () => {
    const res = await app.request('/health', { method: 'GET' }, {
      ENVIRONMENT: 'test',
      APP_URL: 'http://localhost:5173',
      JWT_SECRET: 'test-secret',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
    expect(body.data.runtime).toContain('Cloudflare Workers');
  });

  it('should return 404 for non-existent route', async () => {
    const res = await app.request('/unknown-route');
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
