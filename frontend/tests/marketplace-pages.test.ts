import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { mount, flushPromises } from '@vue/test-utils';
import type { User } from '@edgecart/shared';
import { useAuthStore } from '../src/stores/auth.js';
import { createAppRouter } from '../src/router/index.js';
import { storeService } from '../src/services/store.service.js';
import { adminService } from '../src/services/admin.service.js';
import BecomeSellerPage from '../src/pages/BecomeSellerPage.vue';
import AdminStoresPage from '../src/pages/AdminStoresPage.vue';

function buildUser(overrides: Partial<User>): User {
  return {
    id: 'usr_01',
    email: 'buyer@edgecart.vn',
    fullName: 'Trần Thị B',
    phone: '0987654321',
    role: 'CUSTOMER',
    isSeller: false,
    status: 'ACTIVE',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
    ...overrides,
  };
}

describe('Phase 3 Marketplace Page Components', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('BecomeSellerPage renders rejected reason and allows re-applying', async () => {
    const router = createAppRouter(createMemoryHistory());
    const auth = useAuthStore();
    auth.accessToken = 'token_buyer';
    auth.user = buildUser({ role: 'CUSTOMER', isSeller: false });

    vi.spyOn(auth, 'fetchProfile').mockResolvedValue(auth.user);
    vi.spyOn(storeService, 'getMySellerRequests').mockResolvedValue({
      store: null,
      requests: [
        {
          id: 'sreq_01',
          userId: 'usr_01',
          storeName: 'Shop Thử Nghiệm',
          storeSlug: 'shop-thu-nghiem',
          status: 'REJECTED',
          rejectionReason: 'Vui lòng bổ sung số điện thoại chính chủ',
          reviewedAt: '2026-10-28T10:00:00Z',
          createdAt: '2026-10-28T09:00:00Z',
          updatedAt: '2026-10-28T10:00:00Z',
        },
      ],
    });

    await router.push('/become-seller');
    const wrapper = mount(BecomeSellerPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Yêu cầu gần nhất chưa được phê duyệt');
    expect(wrapper.text()).toContain('Vui lòng bổ sung số điện thoại chính chủ');

    const reapplyBtn = wrapper.findAll('button').find((b) => b.text().includes('Chỉnh sửa & Gửi lại hồ sơ mới'));
    expect(reapplyBtn).toBeDefined();
    await reapplyBtn!.trigger('click');

    expect(wrapper.text()).toContain('Thông Tin Đăng Ký Mở Gian Hàng');
  });

  it('AdminStoresPage hides status mutation button for PRODUCT_MANAGER and shows it for SUPER_ADMIN', async () => {
    const router = createAppRouter(createMemoryHistory());
    const auth = useAuthStore();

    vi.spyOn(adminService, 'getStores').mockResolvedValue({
      stores: [
        {
          id: 'store_01',
          ownerUserId: 'usr_seller',
          ownerFullName: 'Lê Văn C',
          ownerEmail: 'seller@edgecart.vn',
          name: 'TechZone Official',
          slug: 'techzone-official',
          status: 'ACTIVE',
          productCount: 12,
          createdAt: '2026-10-28T00:00:00Z',
          updatedAt: '2026-10-28T00:00:00Z',
        },
      ],
      meta: { page: 1, limit: 15, total: 1, totalPages: 1 },
    });

    // 1. PRODUCT_MANAGER (read-only store directory)
    auth.accessToken = 'token_pm';
    auth.user = buildUser({ id: 'usr_pm', role: 'PRODUCT_MANAGER' });
    await router.push('/admin/stores');

    const pmWrapper = mount(AdminStoresPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(pmWrapper.text()).toContain('TechZone Official');
    expect(pmWrapper.findAll('button').some((b) => b.text().includes('Trạng thái'))).toBe(false);

    // 2. SUPER_ADMIN (can mutate store status)
    auth.accessToken = 'token_sa';
    auth.user = buildUser({ id: 'usr_sa', role: 'SUPER_ADMIN' });
    const saWrapper = mount(AdminStoresPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(saWrapper.findAll('button').some((b) => b.text().includes('Trạng thái'))).toBe(true);
  });
});
