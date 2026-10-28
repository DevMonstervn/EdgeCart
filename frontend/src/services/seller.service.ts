import { apiClient, extractErrorMessage } from './api.js';
import type {
  ApiResponse,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Product,
  SellerInventoryAdjustInput,
  SellerProductCreateInput,
  SellerProductUpdateInput,
  Store,
  UpdateStoreInput,
} from '@edgecart/shared';

export interface SellerRecentOrderSummary {
  id: string;
  orderNumber: string;
  shippingName: string;
  shippingStatus: OrderStatus;
  fulfillmentStatus: OrderStatus;
  storeSubtotal: number;
  itemCount: number;
  createdAt: string;
}

export interface SellerDashboardStats {
  totalProducts: number;
  hiddenProducts: number;
  lowStockVariants: number;
  totalOrders: number;
  totalRevenue: number;
  recentOrders: SellerRecentOrderSummary[];
}

export interface SellerInventoryItem {
  id: string;
  sku: string;
  title: string;
  productId: string;
  productName: string;
  storeId: string | null;
  stockQuantity: number;
  price: number;
}

export interface SellerOrder {
  id: string;
  orderNumber: string;
  customerEmail: string;
  customerPhone: string;
  shippingName: string;
  shippingAddress: string;
  shippingProvince: string;
  shippingDistrict: string;
  shippingWard: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  shippingStatus: OrderStatus;
  fulfillmentStatus: OrderStatus;
  storeSubtotal: number;
  notes?: string | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export const sellerService = {
  async getDashboardStats(): Promise<SellerDashboardStats> {
    try {
      const res = await apiClient.get<ApiResponse<SellerDashboardStats>>('/seller/dashboard/stats');
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải thống kê cửa hàng');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getStoreProfile(): Promise<Store> {
    try {
      const res = await apiClient.get<ApiResponse<Store>>('/seller/store');
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải hồ sơ cửa hàng');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async updateStoreProfile(input: UpdateStoreInput): Promise<Store> {
    try {
      const res = await apiClient.put<ApiResponse<Store>>('/seller/store', input);
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể cập nhật hồ sơ cửa hàng');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getProducts(params?: { q?: string; page?: number; limit?: number }): Promise<{
    products: Product[];
    meta: ApiResponse['meta'];
  }> {
    try {
      const res = await apiClient.get<ApiResponse<Product[]>>('/seller/products', { params });
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải danh sách sản phẩm');
      }
      return { products: res.data.data, meta: res.data.meta };
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async createProduct(input: SellerProductCreateInput): Promise<Product> {
    try {
      const res = await apiClient.post<ApiResponse<Product>>('/seller/products', input);
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tạo sản phẩm mới');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async updateProduct(id: string, input: SellerProductUpdateInput): Promise<Product> {
    try {
      const res = await apiClient.put<ApiResponse<Product>>(`/seller/products/${encodeURIComponent(id)}`, input);
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
      const res = await apiClient.delete<ApiResponse<{ message: string }>>(
        `/seller/products/${encodeURIComponent(id)}`
      );
      if (!res.data.success) {
        throw new Error(res.data.error?.message || 'Không thể ẩn/xóa sản phẩm');
      }
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getInventory(params?: { q?: string; lowStockOnly?: boolean }): Promise<SellerInventoryItem[]> {
    try {
      const res = await apiClient.get<ApiResponse<SellerInventoryItem[]>>('/seller/inventory', { params });
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải danh sách tồn kho');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async adjustInventory(input: SellerInventoryAdjustInput): Promise<void> {
    try {
      const res = await apiClient.post<ApiResponse<{ message: string }>>('/seller/inventory/adjust', input);
      if (!res.data.success) {
        throw new Error(res.data.error?.message || 'Không thể điều chỉnh tồn kho');
      }
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getOrders(params?: { status?: string; page?: number; limit?: number }): Promise<{
    orders: SellerOrder[];
    meta: ApiResponse['meta'];
  }> {
    try {
      const res = await apiClient.get<ApiResponse<SellerOrder[]>>('/seller/orders', { params });
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải danh sách đơn hàng');
      }
      return { orders: res.data.data, meta: res.data.meta };
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getOrderById(id: string): Promise<SellerOrder> {
    try {
      const res = await apiClient.get<ApiResponse<SellerOrder>>(`/seller/orders/${encodeURIComponent(id)}`);
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
      const res = await apiClient.patch<ApiResponse<{ message: string }>>(
        `/seller/orders/${encodeURIComponent(orderId)}/status`,
        { status, note }
      );
      if (!res.data.success) {
        throw new Error(res.data.error?.message || 'Không thể cập nhật trạng thái đơn hàng');
      }
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },
};
