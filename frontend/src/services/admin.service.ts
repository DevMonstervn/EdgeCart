import { apiClient, extractErrorMessage } from './api.js';
import type {
  AdminAuditLog,
  ApiResponse,
  Category,
  Order,
  OrderStatus,
  Product,
  ReviewSellerRequestInput,
  SellerProductUpdateInput,
  SellerRequest,
  Store,
  UpdateStoreStatusInput,
  UpdateUserRoleInput,
  UpdateUserStatusInput,
  User,
} from '@edgecart/shared';

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  lowStockCount: number;
  totalStores?: number;
  pendingSellerRequests?: number;
  recentOrders: Order[];
}

export interface InventoryItem {
  id: string;
  sku: string;
  title: string;
  productId?: string;
  productName: string;
  storeId?: string | null;
  stockQuantity: number;
  price: number;
}

export interface AdminStoreItem extends Store {
  ownerEmail: string;
  ownerFullName: string;
  productCount: number;
}

export const adminService = {
  async getStats(): Promise<DashboardStats> {
    try {
      const res = await apiClient.get<ApiResponse<DashboardStats>>('/admin/dashboard/stats');
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể lấy dữ liệu thống kê');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getAdminProducts(params?: {
    page?: number;
    limit?: number;
    q?: string;
    scope?: 'system' | 'all';
  }): Promise<{ products: Product[]; meta: ApiResponse['meta'] }> {
    try {
      const res = await apiClient.get<ApiResponse<Product[]>>('/admin/products', { params });
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể lấy danh sách sản phẩm');
      }
      return { products: res.data.data, meta: res.data.meta };
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async createProduct(data: unknown): Promise<Product> {
    try {
      const res = await apiClient.post<ApiResponse<Product>>('/admin/products', data);
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tạo sản phẩm');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async updateProduct(id: string, data: SellerProductUpdateInput): Promise<Product> {
    try {
      const res = await apiClient.put<ApiResponse<Product>>(`/admin/products/${encodeURIComponent(id)}`, data);
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể cập nhật sản phẩm');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async deleteProduct(id: string): Promise<void> {
    try {
      const res = await apiClient.delete<ApiResponse<void>>(`/admin/products/${encodeURIComponent(id)}`);
      if (!res.data.success) {
        throw new Error(res.data.error?.message || 'Không thể xóa sản phẩm');
      }
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async createCategory(data: { name: string; slug: string; description?: string }): Promise<Category> {
    try {
      const res = await apiClient.post<ApiResponse<Category>>('/admin/categories', data);
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tạo danh mục');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getAdminOrders(params?: { status?: string; page?: number; limit?: number }): Promise<{
    orders: Order[];
    meta: ApiResponse['meta'];
  }> {
    try {
      const res = await apiClient.get<ApiResponse<Order[]>>('/admin/orders', { params });
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải danh sách đơn hàng');
      }
      return { orders: res.data.data, meta: res.data.meta };
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getAdminOrderById(orderId: string): Promise<Order> {
    try {
      const res = await apiClient.get<ApiResponse<Order>>(`/admin/orders/${encodeURIComponent(orderId)}`);
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải chi tiết đơn hàng');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async updateOrderStatus(orderId: string, status: OrderStatus, note?: string): Promise<void> {
    try {
      const res = await apiClient.patch<ApiResponse<void>>(
        `/admin/orders/${encodeURIComponent(orderId)}/status`,
        { status, note }
      );
      if (!res.data.success) {
        throw new Error(res.data.error?.message || 'Không thể cập nhật trạng thái đơn hàng');
      }
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getInventory(params?: { q?: string; lowStockOnly?: boolean; storeId?: string }): Promise<InventoryItem[]> {
    try {
      const res = await apiClient.get<ApiResponse<InventoryItem[]>>('/admin/inventory', { params });
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải thông tin tồn kho');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async adjustInventory(variantId: string, changeQuantity: number, type: string, notes: string): Promise<void> {
    try {
      const res = await apiClient.post<ApiResponse<void>>('/admin/inventory/adjust', {
        variantId,
        changeQuantity,
        type,
        notes,
      });
      if (!res.data.success) {
        throw new Error(res.data.error?.message || 'Không thể điều chỉnh tồn kho');
      }
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getStores(params?: { status?: string; q?: string; page?: number; limit?: number }): Promise<{
    stores: AdminStoreItem[];
    meta: ApiResponse['meta'];
  }> {
    try {
      const res = await apiClient.get<ApiResponse<AdminStoreItem[]>>('/admin/stores', { params });
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải danh sách cửa hàng');
      }
      return { stores: res.data.data, meta: res.data.meta };
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async updateStoreStatus(storeId: string, input: UpdateStoreStatusInput): Promise<Store> {
    try {
      const res = await apiClient.patch<ApiResponse<Store>>(
        `/admin/stores/${encodeURIComponent(storeId)}/status`,
        input
      );
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể cập nhật trạng thái cửa hàng');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getSellerRequests(params?: { status?: string; page?: number; limit?: number }): Promise<{
    requests: SellerRequest[];
    meta: ApiResponse['meta'];
  }> {
    try {
      const res = await apiClient.get<ApiResponse<SellerRequest[]>>('/admin/seller-requests', { params });
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải danh sách yêu cầu mở cửa hàng');
      }
      return { requests: res.data.data, meta: res.data.meta };
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async reviewSellerRequest(
    requestId: string,
    input: ReviewSellerRequestInput
  ): Promise<{ request: SellerRequest | null; store: Store | null }> {
    try {
      const res = await apiClient.patch<ApiResponse<{ request: SellerRequest | null; store: Store | null }>>(
        `/admin/seller-requests/${encodeURIComponent(requestId)}/review`,
        input
      );
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể xét duyệt yêu cầu mở cửa hàng');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getUsers(params?: {
    role?: string;
    status?: string;
    isSeller?: boolean;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<{ users: User[]; meta: ApiResponse['meta'] }> {
    try {
      const res = await apiClient.get<ApiResponse<User[]>>('/admin/users', { params });
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải danh sách người dùng');
      }
      return { users: res.data.data, meta: res.data.meta };
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async updateUserStatus(userId: string, input: UpdateUserStatusInput): Promise<User> {
    try {
      const res = await apiClient.patch<ApiResponse<User>>(
        `/admin/users/${encodeURIComponent(userId)}/status`,
        input
      );
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể cập nhật trạng thái tài khoản');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async updateUserRole(userId: string, input: UpdateUserRoleInput): Promise<User> {
    try {
      const res = await apiClient.patch<ApiResponse<User>>(
        `/admin/users/${encodeURIComponent(userId)}/role`,
        input
      );
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể cập nhật vai trò người dùng');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getAuditLogs(params?: {
    entity?: string;
    action?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ logs: AdminAuditLog[]; meta: ApiResponse['meta'] }> {
    try {
      const res = await apiClient.get<ApiResponse<AdminAuditLog[]>>('/admin/audit-logs', { params });
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải nhật ký kiểm toán');
      }
      return { logs: res.data.data, meta: res.data.meta };
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },
};
