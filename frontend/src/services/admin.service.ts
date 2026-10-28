import { apiClient } from './api.js';
import type { ApiResponse, Product, Order, OrderStatus } from '@edgecart/shared';

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  lowStockCount: number;
  recentOrders: Order[];
}

export interface InventoryItem {
  id: string;
  sku: string;
  title: string;
  productName: string;
  stockQuantity: number;
  price: number;
}

export const adminService = {
  async getStats(): Promise<DashboardStats> {
    const res = await apiClient.get<ApiResponse<DashboardStats>>('/admin/dashboard/stats');
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể lấy dữ liệu thống kê');
    }
    return res.data.data;
  },

  async getAdminProducts(params?: { page?: number; limit?: number; q?: string }): Promise<{ products: Product[]; meta: ApiResponse['meta'] }> {
    const res = await apiClient.get<ApiResponse<Product[]>>('/admin/products', { params });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể lấy danh sách sản phẩm');
    }
    return { products: res.data.data, meta: res.data.meta };
  },

  async createProduct(data: unknown): Promise<Product> {
    const res = await apiClient.post<ApiResponse<Product>>('/admin/products', data);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể tạo sản phẩm');
    }
    return res.data.data;
  },

  async updateProduct(id: string, data: unknown): Promise<Product> {
    const res = await apiClient.put<ApiResponse<Product>>(`/admin/products/${encodeURIComponent(id)}`, data);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể cập nhật sản phẩm');
    }
    return res.data.data;
  },

  async deleteProduct(id: string): Promise<void> {
    const res = await apiClient.delete<ApiResponse<void>>(`/admin/products/${encodeURIComponent(id)}`);
    if (!res.data.success) {
      throw new Error(res.data.error?.message || 'Không thể xóa sản phẩm');
    }
  },

  async getAdminOrders(params?: { status?: string; page?: number; limit?: number }): Promise<{ orders: Order[]; meta: ApiResponse['meta'] }> {
    const res = await apiClient.get<ApiResponse<Order[]>>('/admin/orders', { params });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể tải danh sách đơn hàng');
    }
    return { orders: res.data.data, meta: res.data.meta };
  },

  async updateOrderStatus(orderId: string, status: OrderStatus, note?: string): Promise<void> {
    const res = await apiClient.patch<ApiResponse<void>>(`/admin/orders/${encodeURIComponent(orderId)}/status`, {
      status,
      note,
    });
    if (!res.data.success) {
      throw new Error(res.data.error?.message || 'Không thể cập nhật trạng thái đơn hàng');
    }
  },

  async getInventory(params?: { q?: string; lowStockOnly?: boolean }): Promise<InventoryItem[]> {
    const res = await apiClient.get<ApiResponse<InventoryItem[]>>('/admin/inventory', { params });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể tải thông tin tồn kho');
    }
    return res.data.data;
  },

  async adjustInventory(variantId: string, changeQuantity: number, type: string, notes: string): Promise<void> {
    const res = await apiClient.post<ApiResponse<void>>('/admin/inventory/adjust', {
      variantId,
      changeQuantity,
      type,
      notes,
    });
    if (!res.data.success) {
      throw new Error(res.data.error?.message || 'Không thể điều chỉnh tồn kho');
    }
  },
};
