import { apiClient } from './api.js';
import type { ApiResponse, Address, AddressInput } from '@edgecart/shared';

export const addressService = {
  async getAddresses(): Promise<Address[]> {
    const res = await apiClient.get<ApiResponse<Address[]>>('/addresses');
    return res.data.data || [];
  },

  async createAddress(input: AddressInput): Promise<Address> {
    const res = await apiClient.post<ApiResponse<Address>>('/addresses', input);
    if (!res.data.data) throw new Error('Không nhận được dữ liệu địa chỉ tạo mới');
    return res.data.data;
  },

  async updateAddress(id: string, input: AddressInput): Promise<Address> {
    const res = await apiClient.put<ApiResponse<Address>>(`/addresses/${id}`, input);
    if (!res.data.data) throw new Error('Không nhận được dữ liệu địa chỉ cập nhật');
    return res.data.data;
  },

  async setDefaultAddress(id: string): Promise<Address> {
    const res = await apiClient.patch<ApiResponse<Address>>(`/addresses/${id}/default`);
    if (!res.data.data) throw new Error('Không thể thiết lập địa chỉ mặc định');
    return res.data.data;
  },

  async deleteAddress(id: string): Promise<{ message: string; newDefaultId?: string }> {
    const res = await apiClient.delete<ApiResponse<{ message: string; newDefaultId?: string }>>(`/addresses/${id}`);
    return res.data.data || { message: 'Đã xóa địa chỉ' };
  },
};
