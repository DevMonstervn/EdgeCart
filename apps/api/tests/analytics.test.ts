import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import { BasinService, BASIN_STREAM_CONFIG } from '../src/services/basin.service.js';
import type { Env } from '../src/types/env.js';

describe('Basin Catalog Stream Ingestion & 24h Traffic Analytics (Group 8)', () => {
  let env: Env;

  beforeEach(() => {
    env = createTestEnv();
  });

  it('1. GET /api/v1/analytics/stream-info returns Basin Catalog configuration with group ID nhom8', async () => {
    const res = await app.request('/api/v1/analytics/stream-info', { method: 'GET' }, env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.streamEndpoint).toBe('https://f8fb6f6f730b404fb2f273fd789d04df.ingest.cloudflare.com');
    expect(body.data.groupId).toBe('nhóm 8 sáng t6');
    expect(body.data.method).toBe('POST');
    expect(body.data.schema.fields).toHaveLength(6);

    const fieldNames = body.data.schema.fields.map((f: any) => f.name);
    expect(fieldNames).toEqual(['id', 'country', 'device', 'time', 'ip', 'meta']);
  });

  it('2. BasinService correctly categorizes devices from User-Agent strings', () => {
    const service = new BasinService(env);

    // Desktop
    expect(service.detectDevice(undefined, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0')).toBe('desktop');
    expect(service.detectDevice(undefined, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('desktop');

    // Mobile
    expect(service.detectDevice(undefined, 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X)')).toBe('mobile');
    expect(service.detectDevice(undefined, 'Mozilla/5.0 (Linux; Android 13; SM-S908B) Mobile Safari/537.36')).toBe('mobile');

    // Tablet
    expect(service.detectDevice(undefined, 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X)')).toBe('tablet');
    expect(service.detectDevice(undefined, 'Mozilla/5.0 (Linux; Android 12; SM-T870) AppleWebKit/537.36')).toBe('tablet');

    // Explicit hints
    expect(service.detectDevice('mobile', 'Desktop UA')).toBe('mobile');
    expect(service.detectDevice('tablet', 'Desktop UA')).toBe('tablet');
    expect(service.detectDevice('desktop', 'Mobile UA')).toBe('desktop');
  });

  it('3. POST /api/v1/analytics/visit records a visitor, updates KV and streams to Basin Catalog', async () => {
    const payload = {
      country: 'VN',
      device: 'mobile',
      path: '/products',
      referrer: 'https://google.com',
      meta: { action: 'browse' },
    };

    const res = await app.request(
      '/api/v1/analytics/visit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '118.69.182.10',
          'cf-ipcountry': 'VN',
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5)',
        },
        body: JSON.stringify(payload),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.visit.id).toBe('nhóm 8 sáng t6');
    expect(body.data.visit.country).toBe('VN');
    expect(body.data.visit.device).toBe('mobile');
    expect(body.data.visit.path).toBe('/products');
  });

  it('4. GET /api/v1/analytics/stats-24h accurately aggregates visits by country, device, and timeline', async () => {
    // Mock global fetch for batch test to avoid hitting internet roundtrips 5 times in CI
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: { committed: 1 } }),
      text: async () => JSON.stringify({ success: true, result: { committed: 1 } }),
    } as any);

    try {
      // Record multiple visits with different countries and devices
      const testVisits = [
        { country: 'VN', device: 'desktop' },
        { country: 'VN', device: 'mobile' },
        { country: 'VN', device: 'mobile' },
        { country: 'US', device: 'desktop' },
        { country: 'JP', device: 'tablet' },
      ];

      for (const v of testVisits) {
        await app.request(
          '/api/v1/analytics/visit',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(v),
          },
          env
        );
      }

      const res = await app.request('/api/v1/analytics/stats-24h', { method: 'GET' }, env);
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.groupId).toBe('nhóm 8 sáng t6');
      expect(body.data.period).toBe('last_24_hours');
      expect(body.data.totalVisits).toBe(5);

      // Countries breakdown
      expect(body.data.countries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ country: 'VN', count: 3, percentage: 60 }),
          expect.objectContaining({ country: 'US', count: 1, percentage: 20 }),
          expect.objectContaining({ country: 'JP', count: 1, percentage: 20 }),
        ])
      );

      // Devices breakdown
      expect(body.data.devices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ device: 'desktop', count: 2, percentage: 40 }),
          expect.objectContaining({ device: 'mobile', count: 2, percentage: 40 }),
          expect.objectContaining({ device: 'tablet', count: 1, percentage: 20 }),
        ])
      );

      // 24h timeline
      expect(body.data.hourlyTimeline).toHaveLength(24);
      const sumTimeline = body.data.hourlyTimeline.reduce((acc: number, h: any) => acc + h.count, 0);
      expect(sumTimeline).toBe(5);

      // Recent visits ring buffer
      expect(body.data.recentVisits.length).toBeGreaterThanOrEqual(5);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
