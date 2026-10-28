import { apiClient } from './api.js';
import type { ApiResponse, Order, CheckoutInput } from '@edgecart/shared';

export interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  paymentMethod: string;
  paymentUrl?: string;
}

export const orderService = {
  async checkout(input: CheckoutInput, idempotencyKey?: string): Promise<CheckoutResult> {
    const key = idempotencyKey || crypto.randomUUID();
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

  async cancelOrder(id: string, reason?: string): Promise<void> {
    const res = await apiClient.post<ApiResponse<void>>(`/orders/${encodeURIComponent(id)}/cancel`, { reason });
    if (!res.data.success) {
      throw new Error(res.data.error?.message || 'Không thể hủy đơn hàng');
    }
  },
};
