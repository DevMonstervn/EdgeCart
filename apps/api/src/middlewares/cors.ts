import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types/env.js';

const PLACEHOLDER_EXAMPLE_ORIGINS = new Set<string>([
  'https://edgecart.com',
  'https://www.edgecart.com',
  'https://staging.edgecart.com',
  'https://example.com',
]);

function isExplicitConcreteOrigin(candidate: string): boolean {
  if (!candidate || candidate === '*' || candidate.includes('*')) {
    return false;
  }
  if (!candidate.startsWith('https://') && !candidate.startsWith('http://')) {
    return false;
  }
  if (PLACEHOLDER_EXAMPLE_ORIGINS.has(candidate.toLowerCase())) {
    return false;
  }
  try {
    const parsed = new URL(candidate);
    return parsed.origin === candidate;
  } catch {
    return false;
  }
}

export function resolveAllowedOrigins(env?: Partial<Pick<Env, 'APP_URL' | 'ALLOWED_ORIGINS' | 'ENVIRONMENT'>>): Set<string> {
  const allowedOrigins = new Set<string>(['https://buydragon.pages.dev']);

  // Staging & non-production environments allow the dedicated staging Pages branch domain and local dev servers
  if (env?.ENVIRONMENT !== 'production') {
    allowedOrigins.add('https://staging.buydragon.pages.dev');
    allowedOrigins.add('http://localhost:5173');
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://127.0.0.1:5173');
    allowedOrigins.add('http://127.0.0.1:3000');
  }

  if (env?.APP_URL) {
    const appUrl = env.APP_URL.trim().replace(/\/+$/, '');
    if (isExplicitConcreteOrigin(appUrl)) {
      allowedOrigins.add(appUrl);
    }
  }

  if (env?.ALLOWED_ORIGINS) {
    for (const raw of env.ALLOWED_ORIGINS.split(',')) {
      const item = raw.trim().replace(/\/+$/, '');
      if (isExplicitConcreteOrigin(item)) {
        allowedOrigins.add(item);
      }
    }
  }

  return allowedOrigins;
}

export const corsMiddleware = (): MiddlewareHandler<{ Bindings: Env }> => {
  return cors({
    origin: (origin, c) => {
      // Non-CORS / server-to-server requests have no Origin header; never return '*' with credentials: true
      if (!origin) return null;

      const normalizedOrigin = origin.trim().replace(/\/+$/, '');
      const allowedOrigins = resolveAllowedOrigins(c.env);

      if (allowedOrigins.has(normalizedOrigin)) {
        return normalizedOrigin;
      }

      // Reject all unconfigured or untrusted origins (no arbitrary *.pages.dev wildcard)
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id', 'X-Session-Id'],
    credentials: true,
    maxAge: 86400,
  });
};
