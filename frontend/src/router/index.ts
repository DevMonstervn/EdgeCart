import {
  createRouter,
  createWebHistory,
  type RouterHistory,
  type RouteRecordRaw,
} from 'vue-router';
import type { UserRole } from '@edgecart/shared';
import { useAuthStore } from '../stores/auth.js';

declare module 'vue-router' {
  interface RouteMeta {
    guestOnly?: boolean;
    requiresAuth?: boolean;
    requiresCustomer?: boolean;
    requiresSeller?: boolean;
    requiresAdmin?: boolean;
    allowedRoles?: UserRole[];
  }
}

export const routes: RouteRecordRaw[] = [
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
    path: '/stores/:slug',
    name: 'store-detail',
    component: () => import('../pages/StoreDetailPage.vue'),
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
  {
    path: '/order-tracking',
    name: 'order-tracking',
    component: () => import('../pages/OrderTrackingPage.vue'),
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
  {
    path: '/become-seller',
    name: 'become-seller',
    component: () => import('../pages/BecomeSellerPage.vue'),
    meta: { requiresAuth: true, requiresCustomer: true },
  },

  // Approved Seller Portal Routes
  {
    path: '/seller',
    name: 'seller-dashboard',
    component: () => import('../pages/SellerDashboardPage.vue'),
    meta: { requiresAuth: true, requiresSeller: true },
  },
  {
    path: '/seller/store',
    name: 'seller-store',
    component: () => import('../pages/SellerStorePage.vue'),
    meta: { requiresAuth: true, requiresSeller: true },
  },
  {
    path: '/seller/products',
    name: 'seller-products',
    component: () => import('../pages/SellerProductsPage.vue'),
    meta: { requiresAuth: true, requiresSeller: true },
  },
  {
    path: '/seller/inventory',
    name: 'seller-inventory',
    component: () => import('../pages/SellerInventoryPage.vue'),
    meta: { requiresAuth: true, requiresSeller: true },
  },
  {
    path: '/seller/orders',
    name: 'seller-orders',
    component: () => import('../pages/SellerOrdersPage.vue'),
    meta: { requiresAuth: true, requiresSeller: true },
  },

  // Admin Protected Routes (Role-Scoped)
  {
    path: '/admin',
    name: 'admin-dashboard',
    component: () => import('../pages/AdminDashboardPage.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      allowedRoles: ['SUPER_ADMIN', 'PRODUCT_MANAGER', 'ORDER_OPERATOR'],
    },
  },
  {
    path: '/admin/categories',
    name: 'admin-categories',
    component: () => import('../pages/AdminCategoriesPage.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      allowedRoles: ['SUPER_ADMIN', 'PRODUCT_MANAGER'],
    },
  },
  {
    path: '/admin/products',
    name: 'admin-products',
    component: () => import('../pages/AdminProductsPage.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      allowedRoles: ['SUPER_ADMIN', 'PRODUCT_MANAGER'],
    },
  },
  {
    path: '/admin/inventory',
    name: 'admin-inventory',
    component: () => import('../pages/AdminInventoryPage.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      allowedRoles: ['SUPER_ADMIN', 'PRODUCT_MANAGER'],
    },
  },
  {
    path: '/admin/orders',
    name: 'admin-orders',
    component: () => import('../pages/AdminOrdersPage.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      allowedRoles: ['SUPER_ADMIN', 'ORDER_OPERATOR'],
    },
  },
  {
    path: '/admin/stores',
    name: 'admin-stores',
    component: () => import('../pages/AdminStoresPage.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      allowedRoles: ['SUPER_ADMIN', 'PRODUCT_MANAGER'],
    },
  },
  {
    path: '/admin/seller-requests',
    name: 'admin-seller-requests',
    component: () => import('../pages/AdminSellerRequestsPage.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      allowedRoles: ['SUPER_ADMIN'],
    },
  },
  {
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('../pages/AdminUsersPage.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      allowedRoles: ['SUPER_ADMIN'],
    },
  },

  // 404 Catch-All
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../pages/NotFoundPage.vue'),
  },
];

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  const instance = createRouter({
    history,
    routes,
    scrollBehavior(_to, _from, savedPosition) {
      if (savedPosition) {
        return savedPosition;
      }
      return { top: 0, behavior: 'smooth' };
    },
  });

  // UX Navigation Guards (Authoritative enforcement remains on Backend API + D1)
  instance.beforeEach(async (to) => {
    const auth = useAuthStore();

    if (auth.accessToken && !auth.user) {
      await auth.fetchProfile();
    }

    if (to.meta.guestOnly && auth.isAuthenticated) {
      return { path: '/' };
    }

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }

    if (to.meta.requiresCustomer && !auth.isCustomer) {
      return auth.canAccessAdmin ? { path: '/admin' } : { path: '/' };
    }

    if (to.meta.requiresSeller && !auth.isSeller) {
      return auth.canAccessAdmin ? { path: '/admin' } : { path: '/become-seller' };
    }

    if (to.meta.requiresAdmin) {
      if (!auth.canAccessAdmin) {
        return { path: '/' };
      }
      if (to.meta.allowedRoles && (!auth.user || !to.meta.allowedRoles.includes(auth.user.role))) {
        return { path: '/admin' };
      }
    }

    return true;
  });

  return instance;
}

const router = createAppRouter();

export default router;
