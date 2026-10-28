import { apiClient } from './api.js';
import type { ApiResponse, User, LoginInput, RegisterInput } from '@edgecart/shared';

export interface AuthResponseData {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthResponseData> {
    const res = await apiClient.post<ApiResponse<AuthResponseData>>('/auth/register', input);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Đăng ký thất bại');
    }
    return res.data.data;
  },

  async login(input: LoginInput): Promise<AuthResponseData> {
    const res = await apiClient.post<ApiResponse<AuthResponseData>>('/auth/login', input);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Đăng nhập thất bại');
    }
    return res.data.data;
  },

  async getProfile(): Promise<User> {
    const res = await apiClient.get<ApiResponse<User>>('/auth/me');
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể lấy thông tin người dùng');
    }
    return res.data.data;
  },

  async logout(refreshToken?: string | null): Promise<void> {
    try {
      await apiClient.post('/auth/logout', refreshToken ? { refreshToken } : {});
    } finally {
      localStorage.removeItem('ec_access_token');
      localStorage.removeItem('ec_refresh_token');
    }
  },
};
