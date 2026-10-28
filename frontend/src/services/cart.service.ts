import { apiClient } from './api.js';
import type { ApiResponse, Cart, CartItemAddInput, CartItemUpdateSchema } from '@edgecart/shared';

export const cartService = {
  async getCart(): Promise<Cart> {
    const res = await apiClient.get<ApiResponse<Cart>>('/cart');
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể lấy thông tin giỏ hàng');
    }
    return res.data.data;
  },

  async addItem(input: CartItemAddInput): Promise<Cart> {
    const res = await apiClient.post<ApiResponse<Cart>>('/cart/items', input);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể thêm vào giỏ hàng');
    }
    return res.data.data;
  },

  async updateItemQuantity(itemId: string, quantity: number): Promise<Cart> {
    const res = await apiClient.patch<ApiResponse<Cart>>(`/cart/items/${encodeURIComponent(itemId)}`, { quantity });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể cập nhật số lượng');
    }
    return res.data.data;
  },

  async removeItem(itemId: string): Promise<Cart> {
    const res = await apiClient.delete<ApiResponse<Cart>>(`/cart/items/${encodeURIComponent(itemId)}`);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể xóa sản phẩm khỏi giỏ hàng');
    }
    return res.data.data;
  },

  async mergeCart(guestItems: Array<{ variantId: string; quantity: number }>): Promise<Cart> {
    const res = await apiClient.post<ApiResponse<Cart>>('/cart/merge', { guestItems });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể đồng bộ giỏ hàng');
    }
    return res.data.data;
  },
};
