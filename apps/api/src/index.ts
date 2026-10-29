import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { corsMiddleware } from './middlewares/cors.js';
import { errorHandler } from './middlewares/error.js';
import { ok } from './utils/response.js';
import { authRouter } from './controllers/auth.controller.js';
import { catalogRouter } from './controllers/catalog.controller.js';
import { cartRouter } from './controllers/cart.controller.js';
import { checkoutRouter } from './controllers/checkout.controller.js';
import { orderRouter } from './controllers/order.controller.js';
import { uploadRouter } from './controllers/upload.controller.js';
import { adminRouter } from './controllers/admin.controller.js';
import { storeRouter } from './controllers/store.controller.js';
import { sellerRouter } from './controllers/seller.controller.js';
import type { Env } from './types/env.js';

const app = new Hono<{ Bindings: Env }>();

// Global Middlewares
app.use('*', logger());
app.use(
  '*',
  secureHeaders({
    xFrameOptions: 'DENY',
    crossOriginResourcePolicy: 'cross-origin',
  })
);
app.use('*', corsMiddleware());
app.onError(errorHandler);

// Health check endpoint
app.get('/health', (c) => {
  return ok(c, {
    status: 'healthy',
    environment: c.env?.ENVIRONMENT || 'development',
    runtime: 'Cloudflare Workers (Edge)',
    timestamp: new Date().toISOString(),
  });
});

// Root API v1 router
const apiV1 = new Hono<{ Bindings: Env }>();

apiV1.get('/', (c) => {
  return ok(c, {
    name: 'EdgeCart Edge API',
    version: '1.0.0',
    documentation: '/docs',
  });
});

// Mount Resource Sub-routers
apiV1.route('/auth', authRouter);
apiV1.route('/', catalogRouter);
apiV1.route('/', storeRouter);
apiV1.route('/cart', cartRouter);
apiV1.route('/checkout', checkoutRouter);
apiV1.route('/orders', orderRouter);
apiV1.route('/uploads', uploadRouter);
apiV1.route('/seller', sellerRouter);
apiV1.route('/admin', adminRouter);

// Mount /api/v1
app.route('/api/v1', apiV1);

// 404 Handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${c.req.method} ${c.req.path} không tồn tại`,
      },
    },
    404
  );
});

export default app;
