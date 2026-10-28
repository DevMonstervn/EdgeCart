import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User, LoginInput, RegisterInput } from '@edgecart/shared';
import { authService } from '../services/auth.service.js';
import { extractErrorMessage } from '../services/api.js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const accessToken = ref<string | null>(localStorage.getItem('ec_access_token'));
  const refreshToken = ref<string | null>(localStorage.getItem('ec_refresh_token'));
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!accessToken.value);
  const isAdmin = computed(() => {
    return user.value?.role === 'SUPER_ADMIN' || user.value?.role === 'PRODUCT_MANAGER';
  });

  function setTokens(access: string, refresh: string) {
    accessToken.value = access;
    refreshToken.value = refresh;
    localStorage.setItem('ec_access_token', access);
    localStorage.setItem('ec_refresh_token', refresh);
  }

  async function login(input: LoginInput) {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await authService.login(input);
      setTokens(data.accessToken, data.refreshToken);
      user.value = data.user;
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
      return profile;
    } catch {
      logout();
      return null;
    }
  }

  async function logout() {
    try {
      await authService.logout();
    } catch {
      // Ignore logout errors
    } finally {
      user.value = null;
      accessToken.value = null;
      refreshToken.value = null;
      localStorage.removeItem('ec_access_token');
      localStorage.removeItem('ec_refresh_token');
    }
  }

  return {
    user,
    accessToken,
    refreshToken,
    isLoading,
    error,
    isAuthenticated,
    isAdmin,
    login,
    register,
    fetchProfile,
    logout,
  };
});
