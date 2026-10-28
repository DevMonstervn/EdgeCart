import { apiClient } from './api.js';
import type { ApiResponse, Product, Category, ProductFilterQuery } from '@edgecart/shared';

export interface ProductsResponse {
  products: Product[];
  meta: ApiResponse['meta'];
}

export const productService = {
  async getCategories(): Promise<Category[]> {
    const res = await apiClient.get<ApiResponse<Category[]>>('/categories');
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể tải danh mục');
    }
    return res.data.data;
  },

  async getProducts(params?: Partial<ProductFilterQuery>): Promise<ProductsResponse> {
    const res = await apiClient.get<ApiResponse<Product[]>>('/products', { params });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể tải danh sách sản phẩm');
    }
    return {
      products: res.data.data,
      meta: res.data.meta,
    };
  },

  async getProductBySlug(slug: string): Promise<Product> {
    const res = await apiClient.get<ApiResponse<Product>>(`/products/${encodeURIComponent(slug)}`);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không tìm thấy sản phẩm');
    }
    return res.data.data;
  },
};
