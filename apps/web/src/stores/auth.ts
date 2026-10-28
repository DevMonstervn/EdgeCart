import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User } from '@edgecart/shared';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const accessToken = ref<string | null>(localStorage.getItem('ec_access_token'));
  const refreshToken = ref<string | null>(localStorage.getItem('ec_refresh_token'));

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

  function setUser(userData: User) {
    user.value = userData;
  }

  function logout() {
    user.value = null;
    accessToken.value = null;
    refreshToken.value = null;
    localStorage.removeItem('ec_access_token');
    localStorage.removeItem('ec_refresh_token');
  }

  return {
    user,
    accessToken,
    refreshToken,
    isAuthenticated,
    isAdmin,
    setTokens,
    setUser,
    logout,
  };
});
