import { apiClient, extractErrorMessage } from './api.js';
import type {
  ApiResponse,
  CreateSellerRequestInput,
  Product,
  SellerRequest,
  Store,
} from '@edgecart/shared';

export interface PublicStoreResponse {
  store: Store;
  products: Product[];
  meta: ApiResponse['meta'];
}

export interface MySellerRequestsResponse {
  store: Store | null;
  requests: SellerRequest[];
}

export const storeService = {
  async getPublicStoreBySlug(
    slug: string,
    params?: { page?: number; limit?: number; q?: string; sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular' }
  ): Promise<PublicStoreResponse> {
    try {
      const res = await apiClient.get<ApiResponse<{ store: Store; products: Product[] }>>(
        `/stores/${encodeURIComponent(slug)}`,
        { params }
      );
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không tìm thấy cửa hàng');
      }
      return {
        store: res.data.data.store,
        products: res.data.data.products,
        meta: res.data.meta,
      };
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async submitSellerRequest(input: CreateSellerRequestInput): Promise<SellerRequest> {
    try {
      const res = await apiClient.post<ApiResponse<SellerRequest>>('/seller-requests', input);
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể gửi yêu cầu mở cửa hàng');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async getMySellerRequests(): Promise<MySellerRequestsResponse> {
    try {
      const res = await apiClient.get<ApiResponse<MySellerRequestsResponse>>('/seller-requests/me');
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể tải trạng thái yêu cầu mở cửa hàng');
      }
      return res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }
  },
};
