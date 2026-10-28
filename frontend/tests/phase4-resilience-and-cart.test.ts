import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { setActivePinia, createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { mount, flushPromises } from '@vue/test-utils';
import type { User, Cart } from '@edgecart/shared';
import { apiClient, extractErrorMessage } from '../src/services/api.js';
import { useAuthStore } from '../src/stores/auth.js';
import { useCartStore } from '../src/stores/cart.js';
import { cartService } from '../src/services/cart.service.js';
import { orderService } from '../src/services/order.service.js';
import { authService } from '../src/services/auth.service.js';
import { createAppRouter } from '../src/router/index.js';
import ProductsPage from '../src/pages/ProductsPage.vue';
import SellerProductsPage from '../src/pages/SellerProductsPage.vue';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'usr_phase4_01',
    email: 'buyer.phase4@edgecart.vn',
    fullName: 'Phạm Hoàng Minh',
    phone: '0912345678',
    role: 'CUSTOMER',
    isSeller: false,
    status: 'ACTIVE',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
    ...overrides,
  };
}

const defaultAdapter = apiClient.defaults.adapter;

describe('Phase 4: Cart-Backend Synchronization, Auth Lifecycle & UI Error Resilience (Empty, Network, 401, 403, 500)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    apiClient.defaults.adapter = defaultAdapter;
  });

  afterEach(() => {
    apiClient.defaults.adapter = defaultAdapter;
  });

  it('synchronizes real D1 cart_items.id on authenticated add, updateQuantity, and removeItem, and reverts on backend 400 error', async () => {
    const auth = useAuthStore();
    auth.accessToken = 'valid_buyer_jwt';
    auth.user = buildUser();
    localStorage.setItem('ec_access_token', 'valid_buyer_jwt');

    const cart = useCartStore();

    const serverCartAfterAdd: Cart = {
      id: 'cart_real_d1_01',
      userId: auth.user.id,
      sessionId: null,
      items: [
        {
          id: 'ci_real_uuid_999',
          cartId: 'cart_real_d1_01',
          variantId: 'var_keyb_01',
          storeId: 'sto_01',
          storeName: 'Quân Gear Studio',
          productName: 'Bàn Phím Cơ QK75',
          variantTitle: 'Navy',
          sku: 'QG-QK75',
          unitPrice: 2400000,
          quantity: 1,
          totalPrice: 2400000,
          currentStock: 5,
          imageUrl: null,
        },
      ],
      subtotal: 2400000,
      totalItems: 1,
    };

    const addSpy = vi.spyOn(cartService, 'addItem').mockResolvedValueOnce(serverCartAfterAdd);
    const updateSpy = vi.spyOn(cartService, 'updateItemQuantity').mockResolvedValueOnce({
      ...serverCartAfterAdd,
      items: [{ ...serverCartAfterAdd.items[0], quantity: 3, totalPrice: 7200000 }],
      subtotal: 7200000,
      totalItems: 3,
    });
    const removeSpy = vi.spyOn(cartService, 'removeItem').mockResolvedValueOnce({
      ...serverCartAfterAdd,
      items: [],
      subtotal: 0,
      totalItems: 0,
    });

    // 1. Add item -> must replace temp_* ID with real D1 ci_real_uuid_999
    const added = await cart.addItem({
      variantId: 'var_keyb_01',
      productName: 'Bàn Phím Cơ QK75',
      variantTitle: 'Navy',
      sku: 'QG-QK75',
      unitPrice: 2400000,
      quantity: 1,
      currentStock: 5,
    });
    expect(added).toBe(true);
    expect(addSpy).toHaveBeenCalledWith({ variantId: 'var_keyb_01', quantity: 1 });
    expect(cart.items[0].id).toBe('ci_real_uuid_999');
    expect(cart.items[0].storeName).toBe('Quân Gear Studio');

    // 2. Update quantity -> must call PATCH /cart/items/ci_real_uuid_999 (NOT temp_*)
    await cart.updateQuantity('var_keyb_01', 3);
    expect(updateSpy).toHaveBeenCalledWith('ci_real_uuid_999', 3);
    expect(cart.items[0].quantity).toBe(3);

    // 3. Remove item -> must call DELETE /cart/items/ci_real_uuid_999
    await cart.removeItem('var_keyb_01');
    expect(removeSpy).toHaveBeenCalledWith('ci_real_uuid_999');
    expect(cart.items.length).toBe(0);

    // 4. If backend rejects addItem (e.g. store suspended right before click), revert optimistic item
    addSpy.mockRejectedValueOnce(new Error('Sản phẩm không tồn tại hoặc đã ngừng kinh doanh'));
    const failedAdd = await cart.addItem({
      variantId: 'var_suspended_01',
      productName: 'Sản Phẩm Tạm Ngưng',
      variantTitle: 'Tiêu chuẩn',
      sku: 'SUSP-01',
      unitPrice: 100000,
      quantity: 1,
      currentStock: 5,
    });
    expect(failedAdd).toBe(false);
    expect(cart.items.length).toBe(0);
  });

  it('prevents cross-account cart leakage on logout and loads server cart when logging in with empty local cart', async () => {
    const auth = useAuthStore();
    const cart = useCartStore();

    auth.accessToken = 'buyer_a_jwt';
    auth.refreshToken = 'buyer_a_refresh';
    auth.user = buildUser({ id: 'usr_buyer_a', email: 'a@edgecart.vn' });
    localStorage.setItem('ec_access_token', 'buyer_a_jwt');

    cart.items = [
      {
        id: 'ci_buyer_a',
        cartId: 'cart_buyer_a',
        variantId: 'var_a',
        productName: 'Tai Nghe Buyer A',
        variantTitle: 'Đen',
        sku: 'TN-A',
        unitPrice: 500000,
        quantity: 2,
        totalPrice: 1000000,
        currentStock: 10,
      },
    ];
    localStorage.setItem('ec_cart_items', JSON.stringify(cart.items));

    vi.spyOn(authService, 'logout').mockResolvedValueOnce();

    // Buyer A logs out -> reactive cart and localStorage cart must be cleared
    await auth.logout();
    expect(auth.isAuthenticated).toBe(false);
    expect(cart.items).toEqual([]);
    expect(localStorage.getItem('ec_cart_items')).toBeNull();

    // Buyer B logs in with empty local cart -> mergeGuestCart must fetch Buyer B's backend cart
    auth.accessToken = 'buyer_b_jwt';
    auth.user = buildUser({ id: 'usr_buyer_b', email: 'b@edgecart.vn' });
    localStorage.setItem('ec_access_token', 'buyer_b_jwt');

    const getCartSpy = vi.spyOn(cartService, 'getCart').mockResolvedValueOnce({
      id: 'cart_buyer_b',
      userId: 'usr_buyer_b',
      sessionId: null,
      items: [
        {
          id: 'ci_buyer_b',
          cartId: 'cart_buyer_b',
          variantId: 'var_b',
          productName: 'Bàn Phím Buyer B',
          variantTitle: 'Trắng',
          sku: 'BP-B',
          unitPrice: 900000,
          quantity: 1,
          totalPrice: 900000,
          currentStock: 8,
        },
      ],
      subtotal: 900000,
      totalItems: 1,
    });
    const mergeSpy = vi.spyOn(cartService, 'mergeCart');

    await cart.mergeGuestCart();
    expect(mergeSpy).not.toHaveBeenCalled();
    expect(getCartSpy).toHaveBeenCalledTimes(1);
    expect(cart.items.length).toBe(1);
    expect(cart.items[0].id).toBe('ci_buyer_b');
  });

  it('syncs local guest cart via X-Session-Id right before Guest checkout', async () => {
    const cart = useCartStore();
    await cart.addItem({
      variantId: 'var_guest_01',
      productName: 'Áo Khoác Guest',
      variantTitle: 'L',
      sku: 'AK-L',
      unitPrice: 350000,
      quantity: 2,
      currentStock: 10,
    });

    const recordedRequests: Array<{ url?: string; sessionId?: string }> = [];
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      recordedRequests.push({
        url: config.url,
        sessionId: String(config.headers?.['X-Session-Id'] || ''),
      });

      if (config.url === '/cart/items') {
        return {
          data: {
            success: true,
            data: {
              id: 'cart_guest_srv',
              userId: null,
              sessionId: config.headers?.['X-Session-Id'],
              items: [
                {
                  id: 'ci_guest_srv_01',
                  cartId: 'cart_guest_srv',
                  variantId: 'var_guest_01',
                  productName: 'Áo Khoác Guest',
                  variantTitle: 'L',
                  sku: 'AK-L',
                  unitPrice: 350000,
                  quantity: 2,
                  totalPrice: 700000,
                  currentStock: 10,
                },
              ],
              subtotal: 700000,
              totalItems: 2,
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }

      return {
        data: {
          success: true,
          data: {
            orderId: 'ord_guest_01',
            orderNumber: 'EC-GUEST-01',
            totalAmount: 700000,
            paymentMethod: 'COD',
          },
        },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      };
    };

    const result = await orderService.checkout({
      shippingAddress: {
        recipientName: 'Khách Mua Nhanh',
        phone: '0988777666',
        province: 'Hà Nội',
        district: 'Cầu Giấy',
        ward: 'Dịch Vọng',
        streetAddress: 'Số 1 Cầu Giấy',
      },
      paymentMethod: 'COD',
    });

    expect(result.orderId).toBe('ord_guest_01');
    expect(recordedRequests.length).toBe(2);
    expect(recordedRequests[0].url).toBe('/cart/items');
    expect(recordedRequests[1].url).toBe('/checkout');
    expect(recordedRequests[0].sessionId).toMatch(/^guest_/);
    expect(recordedRequests[0].sessionId).toBe(recordedRequests[1].sessionId);
  });

  it('handles 401 auto-refresh transparently, and clears reactive Pinia auth/cart state when refresh fails', async () => {
    const auth = useAuthStore();
    const cart = useCartStore();

    auth.accessToken = 'expired_token_1';
    auth.refreshToken = 'valid_refresh_1';
    auth.user = buildUser();
    localStorage.setItem('ec_access_token', 'expired_token_1');
    localStorage.setItem('ec_refresh_token', 'valid_refresh_1');
    cart.items = [
      {
        id: 'ci_1',
        cartId: 'c_1',
        variantId: 'v_1',
        productName: 'Test',
        variantTitle: 'M',
        sku: 'T-1',
        unitPrice: 100000,
        quantity: 1,
        totalPrice: 100000,
        currentStock: 5,
      },
    ];

    // Case A: 401 -> /auth/refresh succeeds -> retries original request with new token
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        data: { accessToken: 'fresh_token_2' },
      },
    });

    let attempt = 0;
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      attempt += 1;
      if (attempt === 1) {
        throw new AxiosError(
          'Request failed with status code 401',
          'ERR_BAD_REQUEST',
          config,
          {},
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
            data: {
              success: false,
              error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' },
            },
          }
        );
      }

      expect(config.headers?.Authorization).toBe('Bearer fresh_token_2');
      return {
        data: { success: true, data: [] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const retryRes = await apiClient.get('/orders');
    expect(retryRes.status).toBe(200);
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('ec_access_token')).toBe('fresh_token_2');

    // Case B: 401 -> /auth/refresh fails -> reactive auth & cart stores reset immediately
    postSpy.mockRejectedValueOnce(
      new AxiosError(
        'Request failed with status code 401',
        'ERR_BAD_REQUEST',
        { headers: new AxiosHeaders() },
        {},
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config: { headers: new AxiosHeaders() },
          data: {
            success: false,
            error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Phiên đăng nhập đã hết hạn' },
          },
        }
      )
    );

    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError(
        'Request failed with status code 401',
        'ERR_BAD_REQUEST',
        config,
        {},
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
          data: {
            success: false,
            error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' },
          },
        }
      );
    };

    await expect(apiClient.get('/orders')).rejects.toThrow('Phiên đăng nhập đã hết hạn');
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.user).toBeNull();
    expect(cart.items).toEqual([]);
    expect(localStorage.getItem('ec_access_token')).toBeNull();
    expect(localStorage.getItem('ec_refresh_token')).toBeNull();
  });

  it('renders clean Vietnamese UI states on Empty data ([]), Network Error, 403 Forbidden, and 500 Internal Error', async () => {
    const router = createAppRouter(createMemoryHistory());
    const auth = useAuthStore();
    auth.accessToken = 'seller_jwt';
    auth.user = buildUser({ role: 'CUSTOMER', isSeller: true });
    localStorage.setItem('ec_access_token', 'seller_jwt');
    vi.spyOn(auth, 'fetchProfile').mockResolvedValue(auth.user);

    // 1. Empty array [] on ProductsPage -> renders Vietnamese EmptyState cleanly
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => ({
      data: {
        success: true,
        data: [],
        meta: { page: 1, limit: 12, total: 0, totalPages: 1 },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });

    await router.push('/products');
    await router.isReady();
    const emptyProductsWrapper = mount(ProductsPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(emptyProductsWrapper.text()).toContain('Không tìm thấy sản phẩm');

    // 2. Network Error (no response) on ProductsPage -> renders Vietnamese offline message, NOT "Network Error"
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Network Error', 'ERR_NETWORK', config);
    };

    const networkErrWrapper = mount(ProductsPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(networkErrWrapper.text()).toContain(
      'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.'
    );
    expect(networkErrWrapper.text()).not.toContain('Network Error');

    // 3. 403 STORE_SUSPENDED on SellerProductsPage -> renders exact Vietnamese backend message
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url === '/categories') {
        return { data: { success: true, data: [] }, status: 200, statusText: 'OK', headers: {}, config };
      }
      throw new AxiosError(
        'Request failed with status code 403',
        'ERR_BAD_REQUEST',
        config,
        {},
        {
          status: 403,
          statusText: 'Forbidden',
          headers: {},
          config,
          data: {
            success: false,
            error: {
              code: 'STORE_SUSPENDED',
              message: 'Cửa hàng của bạn đang bị tạm đình chỉ hoạt động',
            },
          },
        }
      );
    };

    await router.push('/seller/products');
    const seller403Wrapper = mount(SellerProductsPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(seller403Wrapper.text()).toContain('Cửa hàng của bạn đang bị tạm đình chỉ hoạt động');

    // 4. Raw 500 Gateway failure (non-JSON body) -> renders Vietnamese 500 fallback message
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError(
        'Request failed with status code 500',
        'ERR_BAD_RESPONSE',
        config,
        {},
        {
          status: 500,
          statusText: 'Internal Server Error',
          headers: {},
          config,
          data: '<html>500 Bad Gateway</html>' as any,
        }
      );
    };

    const server500Wrapper = mount(ProductsPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(server500Wrapper.text()).toContain('Hệ thống đang bận hoặc gặp sự cố tạm thời. Vui lòng thử lại sau.');
    expect(extractErrorMessage(new AxiosError('Timeout', 'ECONNABORTED'))).toBe(
      'Yêu cầu quá thời gian phản hồi. Vui lòng thử lại.'
    );
  });
});
