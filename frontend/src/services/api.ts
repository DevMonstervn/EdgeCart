import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@edgecart/shared';
import { safeRandomUUID } from '../utils/uuid.js';
import { safeStorage } from '../utils/storage.js';

// Do NOT hardcode secrets or backend URLs without env support
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const GUEST_SESSION_KEY = 'ec_session_id';

export const AUTH_EXPIRED_EVENT = 'ec:auth-expired';
export const AUTH_CLEARED_EVENT = 'ec:auth-cleared';

export function getOrCreateGuestSessionId(): string {
  let sessionId = safeStorage.getItem(GUEST_SESSION_KEY);
  if (!sessionId) {
    sessionId = `guest_${safeRandomUUID()}`;
    safeStorage.setItem(GUEST_SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function resetGuestSessionId(): void {
  safeStorage.removeItem(GUEST_SESSION_KEY);
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

function notifySessionExpired(): void {
  safeStorage.removeItem('ec_access_token');
  safeStorage.removeItem('ec_refresh_token');
  safeStorage.removeItem('ec_user');
  delete apiClient.defaults.headers.common.Authorization;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }
}

// Request Interceptor: Attach Access Token, Guest Session ID & Request ID
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (config.headers) {
      const token = safeStorage.getItem('ec_access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        delete config.headers.Authorization;
      }

      if (!config.headers['X-Session-Id']) {
        config.headers['X-Session-Id'] = getOrCreateGuestSessionId();
      }

      // Attach X-Request-Id for edge tracing
      if (!config.headers['X-Request-Id']) {
        config.headers['X-Request-Id'] = safeRandomUUID();
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Parse errors & handle 401 token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    // Handle 401 Unauthorized & Token Refresh
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/register') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = safeStorage.getItem('ec_refresh_token');
      if (!refreshToken) {
        notifySessionExpired();
        isRefreshing = false;
        error.message = extractErrorMessage(error);
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post<ApiResponse<{ accessToken: string }>>(
          `${BASE_URL}/auth/refresh`,
          { refreshToken }
        );

        if (data.success && data.data?.accessToken) {
          const newAccessToken = data.data.accessToken;
          safeStorage.setItem('ec_access_token', newAccessToken);
          apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
          processQueue(null, newAccessToken);

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          }
          return apiClient(originalRequest);
        }

        throw new Error(data.error?.message || 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      } catch (refreshErr) {
        notifySessionExpired();
        if (refreshErr instanceof Error) {
          refreshErr.message = extractErrorMessage(refreshErr);
        }
        processQueue(refreshErr, null);
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    error.message = extractErrorMessage(error);
    return Promise.reject(error);
  }
);

// Helper to extract clean Vietnamese error message
export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data as ApiResponse | undefined;
    if (apiError?.error?.message) {
      return apiError.error.message;
    }

    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        return 'Yêu cầu quá thời gian phản hồi. Vui lòng thử lại.';
      }
      return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.';
    }

    const status = error.response.status;
    if (status === 401) {
      return 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.';
    }
    if (status === 403) {
      return 'Bạn không có quyền thực hiện thao tác này.';
    }
    if (status === 404) {
      return 'Không tìm thấy dữ liệu yêu cầu.';
    }
    if (status >= 500) {
      return 'Hệ thống đang bận hoặc gặp sự cố tạm thời. Vui lòng thử lại sau.';
    }

    if (error.message && !/^(Request failed with status code|Network Error)/i.test(error.message)) {
      return error.message;
    }
    return 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';
}
