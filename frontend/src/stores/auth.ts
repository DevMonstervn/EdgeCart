import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User, LoginInput, RegisterInput, UpdateProfileInput } from '@edgecart/shared';
import { authService } from '../services/auth.service.js';
import {
  apiClient,
  extractErrorMessage,
  resetGuestSessionId,
  AUTH_EXPIRED_EVENT,
  AUTH_CLEARED_EVENT,
} from '../services/api.js';
import { getRoleDisplayLabel } from '../utils/format.js';

import { safeStorage } from '../utils/storage.js';

function getStoredUser(): User | null {
  try {
    const raw = safeStorage.getItem('ec_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(getStoredUser());
  const accessToken = ref<string | null>(safeStorage.getItem('ec_access_token'));
  const refreshToken = ref<string | null>(safeStorage.getItem('ec_refresh_token'));
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  function clearClientSessionState() {
    user.value = null;
    accessToken.value = null;
    refreshToken.value = null;
    safeStorage.removeItem('ec_user');
    safeStorage.removeItem('ec_access_token');
    safeStorage.removeItem('ec_refresh_token');
    safeStorage.removeItem('ec_cart_items');
    resetGuestSessionId();
    delete apiClient.defaults.headers.common.Authorization;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AUTH_CLEARED_EVENT));
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener(AUTH_EXPIRED_EVENT, () => {
      clearClientSessionState();
    });
  }

  const isAuthenticated = computed(() => !!accessToken.value);

  // Internal staff roles (SUPER_ADMIN, PRODUCT_MANAGER, ORDER_OPERATOR)
  const canAccessAdmin = computed(() => {
    const role = user.value?.role;
    return role === 'SUPER_ADMIN' || role === 'PRODUCT_MANAGER' || role === 'ORDER_OPERATOR';
  });

  // Alias preserved for backward compatibility across existing components
  const isAdmin = computed(() => canAccessAdmin.value);

  const isSuperAdmin = computed(() => user.value?.role === 'SUPER_ADMIN');
  const isProductManager = computed(() => user.value?.role === 'PRODUCT_MANAGER');
  const isOrderOperator = computed(() => user.value?.role === 'ORDER_OPERATOR');

  const canManageProducts = computed(
    () => user.value?.role === 'SUPER_ADMIN' || user.value?.role === 'PRODUCT_MANAGER'
  );
  const canManageOrders = computed(
    () => user.value?.role === 'SUPER_ADMIN' || user.value?.role === 'ORDER_OPERATOR'
  );
  const canViewStores = computed(
    () => user.value?.role === 'SUPER_ADMIN' || user.value?.role === 'PRODUCT_MANAGER'
  );

  // Buyer & Seller capabilities (DB role for buyer remains CUSTOMER)
  const isCustomer = computed(() => user.value?.role === 'CUSTOMER');
  const isSeller = computed(() => Boolean(user.value?.isSeller));

  const roleLabel = computed(() => getRoleDisplayLabel(user.value?.role, user.value?.isSeller));

  function setTokens(access: string, refresh: string) {
    accessToken.value = access;
    refreshToken.value = refresh;
    safeStorage.setItem('ec_access_token', access);
    safeStorage.setItem('ec_refresh_token', refresh);
  }

  async function login(input: LoginInput) {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await authService.login(input);
      setTokens(data.accessToken, data.refreshToken);
      user.value = data.user;
      safeStorage.setItem('ec_user', JSON.stringify(data.user));
      return data.user;
    } catch (err) {
      const msg = extractErrorMessage(err);
      error.value = msg;
      throw new Error(msg);
    } finally {
      isLoading.value = false;
    }
  }

  async function register(input: RegisterInput) {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await authService.register(input);
      setTokens(data.accessToken, data.refreshToken);
      user.value = data.user;
      safeStorage.setItem('ec_user', JSON.stringify(data.user));
      return data.user;
    } catch (err) {
      const msg = extractErrorMessage(err);
      error.value = msg;
      throw new Error(msg);
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchProfile() {
    if (!accessToken.value) return null;
    try {
      const profile = await authService.getProfile();
      user.value = profile;
      safeStorage.setItem('ec_user', JSON.stringify(profile));
      return profile;
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      if (
        msg.includes('Phiên đăng nhập') ||
        msg.includes('hết hạn') ||
        msg.includes('không hợp lệ') ||
        msg.includes('khóa')
      ) {
        await logout();
      }
      return null;
    }
  }

  async function updateProfile(input: UpdateProfileInput) {
    isLoading.value = true;
    error.value = null;
    try {
      const updated = await authService.updateProfile(input);
      user.value = updated;
      safeStorage.setItem('ec_user', JSON.stringify(updated));
      return updated;
    } catch (err) {
      const msg = extractErrorMessage(err);
      error.value = msg;
      throw new Error(msg);
    } finally {
      isLoading.value = false;
    }
  }

  async function logout() {
    const currentRefresh = refreshToken.value;
    try {
      await authService.logout(currentRefresh);
    } catch {
      // Ignore logout errors
    } finally {
      clearClientSessionState();
    }
  }

  return {
    user,
    accessToken,
    refreshToken,
    isLoading,
    error,
    isAuthenticated,
    canAccessAdmin,
    isAdmin,
    isSuperAdmin,
    isProductManager,
    isOrderOperator,
    canManageProducts,
    canManageOrders,
    canViewStores,
    isCustomer,
    isSeller,
    roleLabel,
    login,
    register,
    fetchProfile,
    updateProfile,
    logout,
  };
});
