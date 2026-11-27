import { apiClient } from './api.js';

export interface Stats24hData {
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
    country: string;
    device: string;
    time: number;
    path: string;
    ipMasked: string;
  }>;
}

export function detectDevice(): 'desktop' | 'mobile' | 'tablet' {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'desktop';
  }
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

/**
 * Send non-blocking visit telemetry to EdgeCart API and Basin Catalog stream
 */
export function trackVisit(path?: string): void {
  try {
    // Avoid network requests during unit tests (Vitest / Happy-DOM)
    if (import.meta.env.MODE === 'test') {
      return;
    }

    const device = detectDevice();
    const currentPath = path || (typeof window !== 'undefined' ? window.location.pathname : '/');
    const referrer = typeof document !== 'undefined' ? document.referrer : '';

    apiClient.post('/analytics/visit', {
      device,
      path: currentPath,
      referrer,
    }).catch(() => {
      // Non-blocking telemetry, silently ignore network glitches
    });
  } catch {
    // Graceful silent fallback
  }
}

/**
 * Fetch 24-hour analytics summary
 */
export async function get24hAnalytics(): Promise<Stats24hData> {
  const res = await apiClient.get<{ success: boolean; data: Stats24hData }>('/analytics/stats-24h');
  return res.data.data;
}
