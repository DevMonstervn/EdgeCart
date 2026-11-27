import { Hono } from 'hono';
import { ok } from '../utils/response.js';
import { BasinService, BASIN_STREAM_CONFIG } from '../services/basin.service.js';
import type { Env } from '../types/env.js';

export const analyticsRouter = new Hono<{ Bindings: Env }>();

/**
 * POST /api/v1/analytics/visit
 * Public visitor tracking endpoint.
 * Ingests real visitor telemetry directly into Cloudflare Basin Catalog stream (nhóm 8 sáng t6)
 * and maintains 24-hour rolling analytics in Cloudflare KV.
 */
analyticsRouter.post('/visit', async (c) => {
  let body: Record<string, any> = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  // Extract real client details from Cloudflare Edge headers / request context
  const cf = (c.req.raw as any).cf;
  const cfCountry = cf?.country || c.req.header('cf-ipcountry');
  const country = body.country || cfCountry;

  const userAgent = c.req.header('user-agent') || body.userAgent || '';
  const ip =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    body.ip;

  const path = body.path || '/';
  const referrer = body.referrer || c.req.header('referer') || 'direct';

  const cfMeta: Record<string, unknown> = {};
  if (cf?.colo) cfMeta.colo = cf.colo;
  if (cf?.city) cfMeta.city = cf.city;
  if (cf?.region) cfMeta.region = cf.region;
  if (cf?.timezone) cfMeta.timezone = cf.timezone;
  if (cf?.httpProtocol) cfMeta.httpProtocol = cf.httpProtocol;
  if (cf?.asn) cfMeta.asn = cf.asn;

  const basinService = new BasinService(c.env);
  const result = await basinService.recordVisit({
    country,
    device: body.device,
    ip,
    path,
    userAgent,
    referrer,
    meta: {
      ...cfMeta,
      ...(body.meta || {}),
    },
  });

  return ok(c, result);
});

/**
 * GET /api/v1/analytics/stats-24h
 * Returns real 24-hour traffic summary:
 * - Total visits
 * - Countries breakdown
 * - Devices breakdown
 * - Hourly timeline
 * - Recent visits
 */
analyticsRouter.get('/stats-24h', async (c) => {
  const basinService = new BasinService(c.env);
  const stats = await basinService.get24hStats();
  return ok(c, stats);
});

/**
 * GET /api/v1/analytics/stream-info
 * Returns Basin Catalog stream configuration and schema details
 */
analyticsRouter.get('/stream-info', (c) => {
  return ok(c, {
    ...BASIN_STREAM_CONFIG,
    schema: {
      fields: [
        { name: 'id', type: 'string', required: false, value: BASIN_STREAM_CONFIG.groupId },
        { name: 'country', type: 'string', required: false },
        { name: 'device', type: 'string', required: false },
        { name: 'time', type: 'timestamp', required: false, unit: 'millisecond' },
        { name: 'ip', type: 'string', required: false },
        { name: 'meta', type: 'json', required: false },
      ],
    },
  });
});
