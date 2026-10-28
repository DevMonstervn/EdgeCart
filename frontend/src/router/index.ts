import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const routes: RouteRecordRaw[] = [
  // Storefront Public Routes
  {
    path: '/',
    name: 'home',
    component: () => import('../pages/HomePage.vue'),
  },
  {
    path: '/products',
    name: 'products',
    component: () => import('../pages/ProductsPage.vue'),
  },
  {
    path: '/products/:slug',
    name: 'product-detail',
    component: () => import('../pages/ProductDetailPage.vue'),
  },
  {
    path: '/cart',
    name: 'cart',
    component: () => import('../pages/CartPage.vue'),
  },
  {
    path: '/checkout',
    name: 'checkout',
    component: () => import('../pages/CheckoutPage.vue'),
  },

  // Auth Routes
  {
    path: '/login',
    name: 'login',
    component: () => import('../pages/LoginPage.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../pages/RegisterPage.vue'),
    meta: { guestOnly: true },
  },

  // Customer Protected Routes
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../pages/ProfilePage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/orders',
    name: 'orders',
    component: () => import('../pages/OrdersPage.vue'),
    meta: { requiresAuth: true },
  },

  // Admin Protected Routes
  {
    path: '/admin',
    name: 'admin-dashboard',
    component: () => import('../pages/AdminDashboardPage.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/products',
    name: 'admin-products',
    component: () => import('../pages/AdminProductsPage.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/orders',
    name: 'admin-orders',
    component: () => import('../pages/AdminOrdersPage.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/inventory',
    name: 'admin-inventory',
    component: () => import('../pages/AdminInventoryPage.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },

  // 404 Catch-All
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../pages/NotFoundPage.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0, behavior: 'smooth' };
  },
});

// Navigation Guards
router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore();

  // If token exists but user profile isn't loaded, load it once
  if (auth.accessToken && !auth.user) {
    await auth.fetchProfile();
  }

  // Check guestOnly routes (e.g. login, register)
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return next('/');
  }

  // Check requiresAuth routes
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return next({ path: '/login', query: { redirect: to.fullPath } });
  }

  // Check requiresAdmin routes
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return next('/');
  }

  next();
});

export default router;
