/**
 * Basin Catalog Stream Ingestion Client (Real Data Only)
 * Endpoint: https://f8fb6f6f730b404fb2f273fd789d04df.ingest.cloudflare.com
 * Method: POST
 * Group ID: nhóm 8 sáng t6
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let streamConfig = {
  streamEndpoint: 'https://f8fb6f6f730b404fb2f273fd789d04df.ingest.cloudflare.com',
  groupId: 'nhóm 8 sáng t6',
  method: 'POST'
};

try {
  const configPath = path.join(__dirname, 'streamInfo.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    streamConfig = { ...streamConfig, ...JSON.parse(raw) };
  }
} catch {
  // Fallback to default config
}

/**
 * Fetch real client IP, Country (loc), and Cloudflare Edge info from Cloudflare trace
 * @returns {Promise<{ip: string, country: string, colo: string, tls: string, http: string}>}
 */
export async function getRealClientTrace() {
  const res = await fetch('https://cloudflare.com/cdn-cgi/trace');
  if (!res.ok) {
    throw new Error(`Failed to fetch Cloudflare trace: HTTP ${res.status}`);
  }
  const text = await res.text();
  const trace = {};
  for (const line of text.split('\n')) {
    const [key, val] = line.split('=');
    if (key && val) {
      trace[key.trim()] = val.trim();
    }
  }
  return {
    ip: trace.ip,
    country: trace.loc,
    colo: trace.colo,
    tls: trace.tls,
    http: trace.http
  };
}

/**
 * Detect real device type from OS / User-Agent
 * @param {string} [userAgent]
 * @returns {'desktop'|'mobile'|'tablet'}
 */
export function detectRealDevice(userAgent = '') {
  if (userAgent) {
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(userAgent)) {
      return 'tablet';
    }
    if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/i.test(userAgent)) {
      return 'mobile';
    }
  }
  const platform = os.platform();
  if (platform === 'android') return 'mobile';
  return 'desktop';
}

/**
 * Send real event or batch of events to the Basin Catalog stream
 * @param {Array<Object>|Object} payload 
 * @returns {Promise<{success: boolean, committed: number, error?: string, raw?: Object}>}
 */
export async function sendToBasinStream(payload) {
  const events = Array.isArray(payload) ? payload : [payload];

  const normalizedEvents = events.map(evt => ({
    id: String(evt.id || streamConfig.groupId || 'nhóm 8 sáng t6'),
    country: String(evt.country).toUpperCase().trim(),
    device: String(evt.device).toLowerCase().trim(),
    time: Number(evt.time || Date.now()),
    ip: String(evt.ip),
    meta: typeof evt.meta === 'object' && evt.meta !== null ? evt.meta : {}
  }));

  try {
    const response = await fetch(streamConfig.streamEndpoint, {
      method: streamConfig.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `EdgeCart-BasinCatalog/1.0 (${os.platform()}; ${os.arch()})`
      },
      body: JSON.stringify(normalizedEvents)
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        committed: 0,
        error: `HTTP ${response.status}: ${errText}`
      };
    }

    const data = await response.json();
    return {
      success: !!data.success,
      committed: data.result?.committed || normalizedEvents.length,
      raw: data
    };
  } catch (err) {
    return {
      success: false,
      committed: 0,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

export { streamConfig };
