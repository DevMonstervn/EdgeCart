import { apiClient, resetGuestSessionId } from './api.js';
import type { ApiResponse, Order, CheckoutInput, Cart, CartItem } from '@edgecart/shared';
import { safeStorage } from '../utils/storage.js';
import { safeRandomUUID } from '../utils/uuid.js';

export interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  paymentMethod: string;
  paymentUrl?: string;
  orderAccessToken?: string;
}

export const orderService = {
  async checkout(input: CheckoutInput, idempotencyKey?: string): Promise<CheckoutResult> {
    // Sync local guest cart items to backend guest session cart before submitting checkout
    if (!safeStorage.getItem('ec_access_token')) {
      try {
        const rawCart = safeStorage.getItem('ec_cart_items');
        const parsedItems: CartItem[] = rawCart ? JSON.parse(rawCart) : [];
        const unsyncedGuestItems = parsedItems.filter(
          (i) => i.cartId === 'local_cart' || (typeof i.id === 'string' && i.id.startsWith('temp_'))
        );

        if (unsyncedGuestItems.length > 0) {
          resetGuestSessionId();
          let latestItems: CartItem[] | null = null;
          for (const item of unsyncedGuestItems) {
            const syncRes = await apiClient.post<ApiResponse<Cart>>('/cart/items', {
              variantId: item.variantId,
              quantity: item.quantity,
            });
            if (syncRes.data.success && syncRes.data.data?.items) {
              latestItems = syncRes.data.data.items;
            }
          }
          if (latestItems) {
            safeStorage.setItem('ec_cart_items', JSON.stringify(latestItems));
          }
        }
      } catch (err) {
        throw err;
      }
    }

    const key = idempotencyKey || safeRandomUUID();
    const res = await apiClient.post<ApiResponse<CheckoutResult>>('/checkout', input, {
      headers: {
        'Idempotency-Key': key,
      },
    });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể tạo đơn hàng');
    }
    return res.data.data;
  },

  async getOrders(): Promise<Order[]> {
    const res = await apiClient.get<ApiResponse<Order[]>>('/orders');
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể tải lịch sử đơn hàng');
    }
    return res.data.data;
  },

  async getOrderById(id: string): Promise<Order> {
    const res = await apiClient.get<ApiResponse<Order>>(`/orders/${encodeURIComponent(id)}`);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không tìm thấy đơn hàng');
    }
    return res.data.data;
  },

  async getGuestOrder(orderNumber: string, token: string): Promise<Order> {
    const res = await apiClient.get<ApiResponse<Order>>('/orders/guest/track', {
      params: { orderNumber },
      headers: {
        'X-Order-Token': token,
      },
    });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể tra cứu đơn hàng');
    }
    return res.data.data;
  },

  async cancelOrder(id: string, reason?: string): Promise<void> {
    const res = await apiClient.post<ApiResponse<void>>(`/orders/${encodeURIComponent(id)}/cancel`, { reason });
    if (!res.data.success) {
      throw new Error(res.data.error?.message || 'Không thể hủy đơn hàng');
    }
  },
};
