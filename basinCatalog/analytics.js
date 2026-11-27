/**
 * Basin Catalog 24-Hour Real Traffic Analytics Engine
 * Strictly processes and aggregates REAL website visits in the past 24 hours:
 * - Total real visits
 * - Real origin countries breakdown (counts & percentages)
 * - Real device breakdown (desktop, mobile, tablet)
 * - Real hourly timeline
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendToBasinStream, getRealClientTrace, detectRealDevice, streamConfig } from './ingest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'analytics-24h.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Load persisted real visit records from storage (filtering out any non-real records)
 * @returns {Array<Object>}
 */
export function loadRealVisits() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.filter(v => !v.meta?.simulated && !v.meta?.test);
      }
    }
  } catch (err) {
    console.error('Failed to read analytics data:', err);
  }
  return [];
}

/**
 * Persist real visit records, pruning entries older than 48 hours
 * @param {Array<Object>} visits 
 */
function saveRealVisits(visits) {
  try {
    const cutoff48h = Date.now() - 48 * 60 * 60 * 1000;
    const pruned = visits.filter(v => v.time >= cutoff48h && !v.meta?.simulated);
    fs.writeFileSync(DATA_FILE, JSON.stringify(pruned, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save analytics data:', err);
  }
}

/**
 * Record a REAL visit using live Cloudflare network trace and stream to Basin Catalog
 * @param {Object} [options]
 * @param {string} [options.path]
 * @param {string} [options.userAgent]
 * @param {string} [options.referrer]
 * @param {string} [options.country]
 * @param {string} [options.device]
 * @param {string} [options.ip]
 * @param {Object} [options.meta]
 */
export async function recordVisit(options = {}) {
  const apiUrl = process.env.EDGECART_API_URL || 'https://edgecart-api.hoanglongkar5ls.workers.dev';

  // 1. Try recording directly through the live Cloudflare Worker Edge API first
  // so Cloudflare Edge natively populates real cf-connecting-ip, cf.country, cf.colo, cf.city, cf.asn
  // and streams directly to Basin Catalog + persists in Production KV.
  try {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': options.userAgent || `Mozilla/5.0 (${os.type()} ${os.release()}; ${os.arch()})`
    };
    const res = await fetch(`${apiUrl}/api/v1/analytics/visit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        path: options.path || '/',
        referrer: options.referrer || 'https://buydragon.pages.dev',
        ...(options.country ? { country: options.country } : {}),
        ...(options.device ? { device: options.device } : {}),
        ...(options.meta ? { meta: options.meta } : {})
      })
    });

    if (res.ok) {
      const body = await res.json();
      if (body?.success && body.data?.visit) {
        const edgeVisit = body.data.visit;
        const visits = loadRealVisits();
        visits.push(edgeVisit);
        saveRealVisits(visits);
        return {
          success: true,
          committed: body.data.streamCommitted ?? 1,
          visit: edgeVisit
        };
      }
    }
  } catch {
    // Fallback to direct trace + stream if Worker is unreachable
  }

  // 2. Fallback: Fetch real IP, country (loc), and edge datacenter from Cloudflare trace
  const trace = await getRealClientTrace();

  const realCountry = String(options.country || trace.country).toUpperCase().trim();
  const realIp = String(options.ip || trace.ip).trim();
  const realDevice = options.device
    ? String(options.device).toLowerCase().trim()
    : detectRealDevice(options.userAgent);
  const now = Date.now();

  const visit = {
    id: streamConfig.groupId || 'nhóm 8 sáng t6',
    country: realCountry,
    device: realDevice,
    time: now,
    ip: realIp,
    meta: {
      path: options.path || '/',
      colo: trace.colo,
      tls: trace.tls,
      http: trace.http,
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      ...(options.userAgent ? { userAgent: options.userAgent } : {}),
      ...(options.referrer ? { referrer: options.referrer } : {}),
      ...(options.meta || {})
    }
  };

  // Send real event to Basin Catalog stream
  const streamResult = await sendToBasinStream(visit);

  // Persist real event locally for 24h aggregation
  const visits = loadRealVisits();
  visits.push(visit);
  saveRealVisits(visits);

  return {
    success: streamResult.success,
    committed: streamResult.committed,
    streamError: streamResult.error,
    visit
  };
}

/**
 * Synchronize real visits from live EdgeCart Production/Local API if available
 * @param {string} [apiUrl]
 */
export async function syncRealVisitsFromApi(apiUrl = process.env.EDGECART_API_URL || 'https://edgecart-api.hoanglongkar5ls.workers.dev') {
  try {
    const res = await fetch(`${apiUrl}/api/v1/analytics/stats-24h`);
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.success && Array.isArray(body.data?.recentVisits)) {
      const localVisits = loadRealVisits();
      const existingKeys = new Set(localVisits.map(v => `${v.time}_${v.ip}`));
      let added = 0;
      for (const rv of body.data.recentVisits) {
        const key = `${rv.time}_${rv.ip}`;
        if (!existingKeys.has(key) && rv.ip && !rv.meta?.simulated) {
          localVisits.push({
            id: rv.id || streamConfig.groupId || 'nhóm 8 sáng t6',
            country: rv.country,
            device: rv.device,
            time: rv.time,
            ip: rv.ip,
            meta: rv.meta || { path: rv.path || '/' }
          });
          existingKeys.add(key);
          added++;
        }
      }
      if (added > 0) {
        localVisits.sort((a, b) => a.time - b.time);
        saveRealVisits(localVisits);
      }
      return body.data;
    }
  } catch {
    // Ignore if API is offline or not yet deployed
  }
  return null;
}

/**
 * Calculate 24-hour analytics from REAL visits only
 * @param {number} [customNow]
 */
export function get24hStats(customNow = Date.now()) {
  const cutoff24h = customNow - 24 * 60 * 60 * 1000;
  const visits = loadRealVisits().filter(v => v.time >= cutoff24h && v.time <= customNow);
  const totalVisits = visits.length;

  const countryCounts = {};
  const deviceCounts = {};

  // Hourly timeline (24 buckets)
  const hourlyBuckets = [];
  for (let i = 23; i >= 0; i--) {
    const bucketTime = new Date(customNow - i * 60 * 60 * 1000);
    bucketTime.setMinutes(0, 0, 0);
    const key = bucketTime.toISOString().substring(0, 13) + ':00:00Z';
    hourlyBuckets.push({
      hour: key,
      label: `${bucketTime.getHours().toString().padStart(2, '0')}:00`,
      timestamp: bucketTime.getTime(),
      count: 0
    });
  }

  for (const v of visits) {
    const c = v.country || 'UNKNOWN';
    countryCounts[c] = (countryCounts[c] || 0) + 1;

    const d = v.device || 'desktop';
    deviceCounts[d] = (deviceCounts[d] || 0) + 1;

    const vHourTime = new Date(v.time);
    vHourTime.setMinutes(0, 0, 0);
    const match = hourlyBuckets.find(b => Math.abs(b.timestamp - vHourTime.getTime()) < 30 * 60 * 1000);
    if (match) {
      match.count += 1;
    }
  }

  const countries = Object.entries(countryCounts)
    .map(([country, count]) => ({
      country,
      count,
      percentage: totalVisits > 0 ? Number(((count / totalVisits) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const devices = Object.entries(deviceCounts)
    .map(([device, count]) => ({
      device,
      count,
      percentage: totalVisits > 0 ? Number(((count / totalVisits) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.count - a.count);

  return {
    groupId: streamConfig.groupId || 'nhóm 8 sáng t6',
    streamEndpoint: streamConfig.streamEndpoint,
    period: '24_hours',
    calculatedAt: new Date(customNow).toISOString(),
    windowStart: new Date(cutoff24h).toISOString(),
    windowEnd: new Date(customNow).toISOString(),
    totalVisits,
    countries,
    devices,
    hourlyTimeline: hourlyBuckets.map(b => ({ hour: b.hour, label: b.label, count: b.count })),
    recentVisits: visits.slice(-20).reverse()
  };
}
