import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { mount } from '@vue/test-utils';
import type { Product, User } from '@edgecart/shared';
import { useAuthStore } from '../src/stores/auth.js';
import { createAppRouter } from '../src/router/index.js';
import Navbar from '../src/components/Navbar.vue';
import AdminLayout from '../src/layouts/AdminLayout.vue';
import ProductCard from '../src/components/ProductCard.vue';

function buildUser(overrides: Partial<User>): User {
  return {
    id: 'usr_test',
    email: 'user@edgecart.vn',
    fullName: 'Nguyễn Văn A',
    phone: '0912345678',
    role: 'CUSTOMER',
    isSeller: false,
    status: 'ACTIVE',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
    ...overrides,
  };
}

function seedAuthenticatedSession(auth: ReturnType<typeof useAuthStore>, user: User) {
  auth.accessToken = 'mock_access_token';
  auth.refreshToken = 'mock_refresh_token';
  auth.user = user;
}

describe('Phase 3 Frontend RBAC, Router Guards & Menu Visibility', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  describe('useAuthStore role flags & Vietnamese buyer label', () => {
    it('displays "Người mua" for CUSTOMER while keeping DB role CUSTOMER', () => {
      const auth = useAuthStore();
      seedAuthenticatedSession(auth, buildUser({ role: 'CUSTOMER', isSeller: false }));

      expect(auth.user?.role).toBe('CUSTOMER');
      expect(auth.roleLabel).toBe('Người mua');
      expect(auth.isCustomer).toBe(true);
      expect(auth.isSeller).toBe(false);
      expect(auth.canAccessAdmin).toBe(false);
    });

    it('identifies approved Seller via isSeller flag on CUSTOMER account', () => {
      const auth = useAuthStore();
      seedAuthenticatedSession(auth, buildUser({ role: 'CUSTOMER', isSeller: true }));

      expect(auth.isCustomer).toBe(true);
      expect(auth.isSeller).toBe(true);
      expect(auth.roleLabel).toBe('Người mua • Người bán');
      expect(auth.canAccessAdmin).toBe(false);
    });

    it('distinguishes PRODUCT_MANAGER, ORDER_OPERATOR, and SUPER_ADMIN permissions', () => {
      const auth = useAuthStore();

      seedAuthenticatedSession(auth, buildUser({ role: 'PRODUCT_MANAGER' }));
      expect(auth.canAccessAdmin).toBe(true);
      expect(auth.isAdmin).toBe(true);
      expect(auth.canManageProducts).toBe(true);
      expect(auth.canViewStores).toBe(true);
      expect(auth.canManageOrders).toBe(false);
      expect(auth.isSuperAdmin).toBe(false);
      expect(auth.roleLabel).toBe('Quản lý sản phẩm');

      seedAuthenticatedSession(auth, buildUser({ role: 'ORDER_OPERATOR' }));
      expect(auth.canAccessAdmin).toBe(true);
      expect(auth.isAdmin).toBe(true);
      expect(auth.canManageOrders).toBe(true);
      expect(auth.canManageProducts).toBe(false);
      expect(auth.canViewStores).toBe(false);
      expect(auth.isSuperAdmin).toBe(false);
      expect(auth.roleLabel).toBe('Vận hành đơn hàng');

      seedAuthenticatedSession(auth, buildUser({ role: 'SUPER_ADMIN' }));
      expect(auth.canAccessAdmin).toBe(true);
      expect(auth.isSuperAdmin).toBe(true);
      expect(auth.canManageProducts).toBe(true);
      expect(auth.canManageOrders).toBe(true);
      expect(auth.canViewStores).toBe(true);
      expect(auth.roleLabel).toBe('Quản trị tối cao');
    });
  });

  describe('Vue Router Guards across all 6 personas & legacy shopping routes', () => {
    it('allows unauthenticated Guest on public shopping & storefront routes, but redirects protected routes to /login', async () => {
      const router = createAppRouter(createMemoryHistory());

      for (const publicPath of [
        '/',
        '/products',
        '/products/ao-polo',
        '/products/lego-star-wars-75192',
        '/stores/techzone',
        '/cart',
        '/checkout',
      ]) {
        await router.push(publicPath);
        expect(router.currentRoute.value.path).toBe(publicPath);
      }

      for (const protectedPath of ['/profile', '/orders', '/become-seller', '/seller', '/admin']) {
        await router.push(protectedPath);
        expect(router.currentRoute.value.path).toBe('/login');
        expect(router.currentRoute.value.query.redirect).toBe(protectedPath);
      }
    });

    it('allows unauthenticated Guest to navigate directly to product detail with search query and preserve URL state', async () => {
      const router = createAppRouter(createMemoryHistory());

      await router.push('/products?q=lego&category=do-choi');
      expect(router.currentRoute.value.path).toBe('/products');
      expect(router.currentRoute.value.query.q).toBe('lego');
      expect(router.currentRoute.value.query.category).toBe('do-choi');

      await router.push('/products/lego-ninjago-mission?ref=search');
      expect(router.currentRoute.value.path).toBe('/products/lego-ninjago-mission');
      expect(router.currentRoute.value.query.ref).toBe('search');
    });

    it('allows CUSTOMER (non-seller) on shopping & /become-seller, redirects /seller/* to /become-seller, and blocks /admin/*', async () => {
      const auth = useAuthStore();
      seedAuthenticatedSession(auth, buildUser({ role: 'CUSTOMER', isSeller: false }));
      const router = createAppRouter(createMemoryHistory());

      await router.push('/orders');
      expect(router.currentRoute.value.path).toBe('/orders');

      await router.push('/become-seller');
      expect(router.currentRoute.value.path).toBe('/become-seller');

      await router.push('/seller/products');
      expect(router.currentRoute.value.path).toBe('/become-seller');

      await router.push('/admin/users');
      expect(router.currentRoute.value.path).toBe('/');
    });

    it('allows approved Seller on all /seller/* routes while blocking /admin/*', async () => {
      const auth = useAuthStore();
      seedAuthenticatedSession(auth, buildUser({ role: 'CUSTOMER', isSeller: true }));
      const router = createAppRouter(createMemoryHistory());

      for (const sellerPath of [
        '/seller',
        '/seller/store',
        '/seller/products',
        '/seller/inventory',
        '/seller/orders',
      ]) {
        await router.push(sellerPath);
        expect(router.currentRoute.value.path).toBe(sellerPath);
      }

      await router.push('/admin/seller-requests');
      expect(router.currentRoute.value.path).toBe('/');
    });

    it('restricts PRODUCT_MANAGER to allowed admin routes and redirects forbidden admin routes to /admin', async () => {
      const auth = useAuthStore();
      seedAuthenticatedSession(auth, buildUser({ role: 'PRODUCT_MANAGER' }));
      const router = createAppRouter(createMemoryHistory());

      for (const allowed of ['/admin', '/admin/categories', '/admin/products', '/admin/inventory', '/admin/stores']) {
        await router.push(allowed);
        expect(router.currentRoute.value.path).toBe(allowed);
      }

      for (const forbidden of ['/admin/orders', '/admin/seller-requests', '/admin/users', '/seller', '/become-seller']) {
        await router.push(forbidden);
        expect(router.currentRoute.value.path).toBe('/admin');
      }
    });

    it('restricts ORDER_OPERATOR to /admin and /admin/orders only', async () => {
      const auth = useAuthStore();
      seedAuthenticatedSession(auth, buildUser({ role: 'ORDER_OPERATOR' }));
      const router = createAppRouter(createMemoryHistory());

      await router.push('/admin');
      expect(router.currentRoute.value.path).toBe('/admin');

      await router.push('/admin/orders');
      expect(router.currentRoute.value.path).toBe('/admin/orders');

      for (const forbidden of [
        '/admin/products',
        '/admin/inventory',
        '/admin/stores',
        '/admin/seller-requests',
        '/admin/users',
      ]) {
        await router.push(forbidden);
        expect(router.currentRoute.value.path).toBe('/admin');
      }
    });

    it('allows SUPER_ADMIN across all admin governance routes', async () => {
      const auth = useAuthStore();
      seedAuthenticatedSession(auth, buildUser({ role: 'SUPER_ADMIN' }));
      const router = createAppRouter(createMemoryHistory());

      for (const adminPath of [
        '/admin',
        '/admin/products',
        '/admin/inventory',
        '/admin/orders',
        '/admin/stores',
        '/admin/seller-requests',
        '/admin/users',
      ]) {
        await router.push(adminPath);
        expect(router.currentRoute.value.path).toBe(adminPath);
      }
    });
  });

  describe('Role-aware Menus & Storefront Attribution UI', () => {
    it('renders role-appropriate links in Navbar for Buyer, Seller, and Admin', async () => {
      const router = createAppRouter(createMemoryHistory());
      await router.push('/');
      const auth = useAuthStore();

      // 1. CUSTOMER (non-seller)
      seedAuthenticatedSession(auth, buildUser({ role: 'CUSTOMER', isSeller: false }));
      const buyerNav = mount(Navbar, { global: { plugins: [router] } });
      expect(buyerNav.text()).toContain('Mở cửa hàng');
      expect(buyerNav.text()).toContain('Người mua');
      expect(buyerNav.text()).not.toContain('Kênh Người Bán');
      expect(buyerNav.text()).not.toContain('Quản trị');

      // 2. Approved Seller
      seedAuthenticatedSession(auth, buildUser({ role: 'CUSTOMER', isSeller: true }));
      const sellerNav = mount(Navbar, { global: { plugins: [router] } });
      expect(sellerNav.text()).toContain('Kênh Người Bán');
      expect(sellerNav.text()).not.toContain('Quản trị');

      // 3. ORDER_OPERATOR
      seedAuthenticatedSession(auth, buildUser({ role: 'ORDER_OPERATOR', isSeller: false }));
      const operatorNav = mount(Navbar, { global: { plugins: [router] } });
      expect(operatorNav.text()).toContain('Quản trị');
      expect(operatorNav.text()).toContain('Vận hành đơn hàng');
    });

    it('filters AdminLayout sidebar navigation strictly per staff role', async () => {
      const router = createAppRouter(createMemoryHistory());
      const auth = useAuthStore();

      seedAuthenticatedSession(auth, buildUser({ role: 'ORDER_OPERATOR' }));
      await router.push('/admin');
      const operatorSidebar = mount(AdminLayout, { global: { plugins: [router] } });
      expect(operatorSidebar.text()).toContain('Tổng quan');
      expect(operatorSidebar.text()).toContain('Đơn hàng');
      expect(operatorSidebar.text()).not.toContain('Duyệt Seller');
      expect(operatorSidebar.text()).not.toContain('Người dùng');
      expect(operatorSidebar.text()).not.toContain('Quản lý Kho');
      expect(operatorSidebar.text()).not.toContain('Danh mục');

      seedAuthenticatedSession(auth, buildUser({ role: 'PRODUCT_MANAGER' }));
      const pmSidebar = mount(AdminLayout, { global: { plugins: [router] } });
      expect(pmSidebar.text()).toContain('Danh mục');
      expect(pmSidebar.text()).toContain('Sản phẩm');
      expect(pmSidebar.text()).toContain('Quản lý Kho');
      expect(pmSidebar.text()).toContain('Cửa hàng');
      expect(pmSidebar.text()).not.toContain('Đơn hàng');
      expect(pmSidebar.text()).not.toContain('Duyệt Seller');
      expect(pmSidebar.text()).not.toContain('Người dùng');

      seedAuthenticatedSession(auth, buildUser({ role: 'SUPER_ADMIN' }));
      const superSidebar = mount(AdminLayout, { global: { plugins: [router] } });
      expect(superSidebar.text()).toContain('Duyệt Seller');
      expect(superSidebar.text()).toContain('Người dùng');
      expect(superSidebar.text()).toContain('Cửa hàng');
    });

    it('renders Store link on ProductCard for Seller products and EdgeCart Official for system products', () => {
      const baseProduct: Product = {
        id: 'prd_seller_1',
        categoryId: 'cat_01',
        storeId: 'store_01',
        name: 'Tai Nghe Bluetooth ANC',
        slug: 'tai-nghe-bluetooth-anc',
        basePrice: 1200000,
        salePrice: 990000,
        isFeatured: false,
        isActive: true,
        store: {
          id: 'store_01',
          name: 'TechZone Official',
          slug: 'techzone-official',
          status: 'ACTIVE',
        },
        createdAt: '2026-10-28',
        updatedAt: '2026-10-28',
      };

      const sellerCard = mount(ProductCard, {
        props: { product: baseProduct },
        global: {
          stubs: {
            RouterLink: {
              props: ['to'],
              template: '<a :href="to"><slot /></a>',
            },
          },
        },
      });
      expect(sellerCard.text()).toContain('TechZone Official');
      expect(sellerCard.html()).toContain('/stores/techzone-official');

      const officialCard = mount(ProductCard, {
        props: { product: { ...baseProduct, storeId: null, store: null } },
        global: {
          stubs: {
            RouterLink: {
              props: ['to'],
              template: '<a :href="to"><slot /></a>',
            },
          },
        },
      });
      expect(officialCard.text()).toContain('EdgeCart Official');
    });
  });
});
