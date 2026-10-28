import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types/env.js';

export const corsMiddleware = (): MiddlewareHandler<{ Bindings: Env }> => {
  return cors({
    origin: (origin, c) => {
      if (!origin) return '*';
      const allowedStatic = [
        'http://localhost:5173',
        'http://localhost:3000',
        c.env.APP_URL,
      ].filter(Boolean);

      if (allowedStatic.includes(origin)) {
        return origin;
      }

      // Allow official custom domains: edgecart.com, staging.edgecart.com, etc.
      const isCustomDomain = /^https:\/\/([a-zA-Z0-9-]+\.)*edgecart\.com$/.test(origin);
      // Allow ONLY the official edgecart-frontend Cloudflare Pages project and its preview deployments
      const isPagesProject = /^https:\/\/([a-zA-Z0-9-]+\.)*edgecart-frontend\.pages\.dev$/.test(origin);

      if (isCustomDomain || isPagesProject) {
        return origin;
      }

      // Reject all other origins (including untrusted arbitrary *.pages.dev)
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    credentials: true,
    maxAge: 86400,
  });
};
