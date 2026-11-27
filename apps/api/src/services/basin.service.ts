import type { Env } from '../types/env.js';

export interface BasinStreamEvent {
  id?: string;
  country?: string;
  device?: string;
  time?: number;
  ip?: string;
  meta?: Record<string, unknown>;
}

export interface BasinVisitInput {
  country?: string;
  device?: string;
  ip?: string;
  path?: string;
  userAgent?: string;
  referrer?: string;
  meta?: Record<string, unknown>;
}

export interface HourlyBucketData {
  hour: string;
  timestamp: number;
  total: number;
  countries: Record<string, number>;
  devices: Record<string, number>;
}

export interface Stats24hResponse {
  groupId: string;
  streamEndpoint: string;
  period: string;
  windowStart: string;
  windowEnd: string;
  totalVisits: number;
  countries: Array<{ country: string; count: number; percentage: number }>;
  devices: Array<{ device: string; count: number; percentage: number }>;
  hourlyTimeline: Array<{ hour: string; label: string; count: number }>;
  recentVisits: Array<{
    id: string;
    country: string;
    device: string;
    time: number;
    path: string;
    ip: string;
    meta?: Record<string, unknown>;
  }>;
}

export const BASIN_STREAM_CONFIG = {
  streamEndpoint: 'https://f8fb6f6f730b404fb2f273fd789d04df.ingest.cloudflare.com',
  groupId: 'nhóm 8 sáng t6',
  method: 'POST' as const,
};

export class BasinService {
  constructor(private env: Env) {}

  /**
   * Determine device category ('desktop', 'mobile', 'tablet') from real User-Agent string
   */
  detectDevice(rawDevice?: string, userAgent = ''): 'desktop' | 'mobile' | 'tablet' {
    if (rawDevice) {
      const d = rawDevice.toLowerCase().trim();
      if (d === 'mobile' || d === 'tablet' || d === 'desktop') return d;
    }
    if (!userAgent) return 'desktop';
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(userAgent)) {
      return 'tablet';
    }
    if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/i.test(userAgent)) {
      return 'mobile';
    }
    return 'desktop';
  }

  /**
   * Resolve real public IP and country from Cloudflare trace if running on localhost
   */
  async resolveRealTraceIfNeeded(ip?: string, country?: string): Promise<{ ip: string; country: string; colo?: string }> {
    const isLocalIp = !ip || ip === '127.0.0.1' || ip === '::1';
    if (!isLocalIp && country) {
      return { ip, country: country.toUpperCase().trim() };
    }

    try {
      const res = await fetch('https://cloudflare.com/cdn-cgi/trace');
      if (res.ok) {
        const text = await res.text();
        const map: Record<string, string> = {};
        for (const line of text.split('\n')) {
          const [k, v] = line.split('=');
          if (k && v) map[k.trim()] = v.trim();
        }
        return {
          ip: (!isLocalIp ? ip : map.ip) || ip || 'unknown',
          country: (country || map.loc || 'UNKNOWN').toUpperCase().trim(),
          colo: map.colo,
        };
      }
    } catch {
      // Fallback to provided headers if trace is unreachable
    }

    return {
      ip: ip || 'unknown',
      country: (country || 'UNKNOWN').toUpperCase().trim(),
    };
  }

  /**
   * Send single or multiple real events to Basin Catalog stream
   */
  async sendToBasinStream(payload: BasinStreamEvent | BasinStreamEvent[]): Promise<{
    success: boolean;
    committed: number;
    error?: string;
  }> {
    const list = Array.isArray(payload) ? payload : [payload];
    const normalized = list.map((evt) => ({
      id: String(evt.id || BASIN_STREAM_CONFIG.groupId),
      country: String(evt.country || 'UNKNOWN').toUpperCase().trim(),
      device: String(evt.device || 'desktop').toLowerCase().trim(),
      time: Number(evt.time || Date.now()),
      ip: String(evt.ip || 'unknown'),
      meta: typeof evt.meta === 'object' && evt.meta !== null ? evt.meta : {},
    }));

    try {
      const res = await fetch(BASIN_STREAM_CONFIG.streamEndpoint, {
        method: BASIN_STREAM_CONFIG.method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'EdgeCart-BasinService/1.0',
        },
        body: JSON.stringify(normalized),
      });

      if (!res.ok) {
        const text = await res.text();
        return { success: false, committed: 0, error: `HTTP ${res.status}: ${text}` };
      }

      const json = (await res.json()) as { success?: boolean; result?: { committed?: number } };
      return {
        success: !!json.success,
        committed: json.result?.committed ?? normalized.length,
      };
    } catch (err) {
      return {
        success: false,
        committed: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Format hourly KV bucket key: analytics:hourly:YYYY-MM-DD-HH
   */
  private getHourlyBucketKey(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    return `analytics:hourly:${y}-${m}-${d}-${h}`;
  }

  /**
   * Record real visit:
   * 1. Streams real visitor telemetry to Basin Catalog
   * 2. Persists aggregated rolling 24h stats in Cloudflare KV
   */
  async recordVisit(input: BasinVisitInput): Promise<{
    success: boolean;
    streamCommitted: number;
    visit: {
      id: string;
      country: string;
      device: string;
      time: number;
      ip: string;
      path: string;
      meta: Record<string, unknown>;
    };
  }> {
    const now = Date.now();
    const nowDate = new Date(now);
    const trace = await this.resolveRealTraceIfNeeded(input.ip, input.country);
    const country = trace.country;
    const ip = trace.ip;
    const device = this.detectDevice(input.device, input.userAgent);
    const path = input.path || '/';

    const meta: Record<string, unknown> = {
      path,
      userAgent: input.userAgent || 'unknown',
      referrer: input.referrer || 'direct',
      ...(trace.colo ? { colo: trace.colo } : {}),
      ...(input.meta || {}),
    };

    const event: BasinStreamEvent = {
      id: BASIN_STREAM_CONFIG.groupId,
      country,
      device,
      time: now,
      ip,
      meta,
    };

    // 1. Stream real event to Basin Catalog
    const streamRes = await this.sendToBasinStream(event);

    // 2. Persist hourly aggregation in KV
    if (this.env.KV) {
      const bucketKey = this.getHourlyBucketKey(nowDate);
      try {
        const rawBucket = await this.env.KV.get(bucketKey, 'text');
        let bucket: HourlyBucketData;
        if (rawBucket) {
          bucket = JSON.parse(rawBucket);
        } else {
          bucket = {
            hour: bucketKey,
            timestamp: new Date(now).setMinutes(0, 0, 0),
            total: 0,
            countries: {},
            devices: {},
          };
        }

        bucket.total += 1;
        bucket.countries[country] = (bucket.countries[country] || 0) + 1;
        bucket.devices[device] = (bucket.devices[device] || 0) + 1;

        // Keep hourly bucket for 48 hours
        await this.env.KV.put(bucketKey, JSON.stringify(bucket), {
          expirationTtl: 172800,
        });

        // Update recent visits ring buffer (last 50 real visits)
        const recentKey = 'analytics:recent_visits';
        const rawRecent = await this.env.KV.get(recentKey, 'text');
        let recentList: Stats24hResponse['recentVisits'] = [];

        if (rawRecent) {
          try {
            recentList = JSON.parse(rawRecent);
          } catch {
            recentList = [];
          }
        }

        recentList.unshift({
          id: BASIN_STREAM_CONFIG.groupId,
          country,
          device,
          time: now,
          path,
          ip,
          meta,
        });

        if (recentList.length > 50) {
          recentList = recentList.slice(0, 50);
        }

        await this.env.KV.put(recentKey, JSON.stringify(recentList), {
          expirationTtl: 172800,
        });
      } catch (err) {
        console.warn('[BasinService] KV update warning:', err);
      }
    }

    return {
      success: true,
      streamCommitted: streamRes.committed,
      visit: {
        id: BASIN_STREAM_CONFIG.groupId,
        country,
        device,
        time: now,
        ip,
        path,
        meta,
      },
    };
  }

  /**
   * Retrieve aggregated 24-hour analytics from real visits
   */
  async get24hStats(): Promise<Stats24hResponse> {
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000;
    const windowStart = new Date(cutoff).toISOString();
    const windowEnd = new Date(now).toISOString();

    let totalVisits = 0;
    const countryMap: Record<string, number> = {};
    const deviceMap: Record<string, number> = {};

    // Prepare 24 hourly keys
    const hourlyKeys: Array<{ key: string; label: string; hourIso: string }> = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now - i * 60 * 60 * 1000);
      const key = this.getHourlyBucketKey(d);
      const label = `${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`;
      const hourIso = d.toISOString().substring(0, 13) + ':00:00Z';
      hourlyKeys.push({ key, label, hourIso });
    }

    const hourlyTimeline: Array<{ hour: string; label: string; count: number }> = [];

    if (this.env.KV) {
      for (const item of hourlyKeys) {
        let count = 0;
        try {
          const raw = await this.env.KV.get(item.key, 'text');
          if (raw) {
            const bucket: HourlyBucketData = JSON.parse(raw);
            count = bucket.total || 0;
            totalVisits += count;

            // Merge countries
            for (const [c, cnt] of Object.entries(bucket.countries || {})) {
              countryMap[c] = (countryMap[c] || 0) + cnt;
            }

            // Merge devices
            for (const [dev, cnt] of Object.entries(bucket.devices || {})) {
              deviceMap[dev] = (deviceMap[dev] || 0) + cnt;
            }
          }
        } catch {
          // ignore error on missing key
        }
        hourlyTimeline.push({
          hour: item.hourIso,
          label: item.label,
          count,
        });
      }
    } else {
      for (const item of hourlyKeys) {
        hourlyTimeline.push({
          hour: item.hourIso,
          label: item.label,
          count: 0,
        });
      }
    }

    // Load recent real visits within last 24h
    let recentVisits: Stats24hResponse['recentVisits'] = [];
    if (this.env.KV) {
      try {
        const rawRecent = await this.env.KV.get('analytics:recent_visits', 'text');
        if (rawRecent) {
          const parsed = JSON.parse(rawRecent) as Stats24hResponse['recentVisits'];
          recentVisits = parsed.filter((v) => v.time >= cutoff);
        }
      } catch {
        recentVisits = [];
      }
    }

    // Format countries breakdown
    const countries = Object.entries(countryMap)
      .filter(([, count]) => count > 0)
      .map(([country, count]) => ({
        country,
        count,
        percentage: totalVisits > 0 ? Number(((count / totalVisits) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Format devices breakdown
    const devices = Object.entries(deviceMap)
      .filter(([, count]) => count > 0)
      .map(([device, count]) => ({
        device,
        count,
        percentage: totalVisits > 0 ? Number(((count / totalVisits) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      groupId: BASIN_STREAM_CONFIG.groupId,
      streamEndpoint: BASIN_STREAM_CONFIG.streamEndpoint,
      period: 'last_24_hours',
      windowStart,
      windowEnd,
      totalVisits,
      countries,
      devices,
      hourlyTimeline,
      recentVisits,
    };
  }
}
