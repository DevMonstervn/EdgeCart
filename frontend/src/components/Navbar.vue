<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useCartStore } from '../stores/cart.js';
import { ShoppingCart, User as UserIcon, Search, Menu, X, Shield, LogOut } from 'lucide-vue-next';

const router = useRouter();
const auth = useAuthStore();
const cart = useCartStore();

const searchQuery = ref('');
const isMobileMenuOpen = ref(false);

function handleSearch() {
  if (searchQuery.value.trim()) {
    router.push({ path: '/products', query: { q: searchQuery.value.trim() } });
    isMobileMenuOpen.value = false;
  }
}

async function handleLogout() {
  await auth.logout();
  router.push('/');
}
</script>

<template>
  <header class="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16 gap-4">
        <!-- Left: Logo & Mobile Toggle -->
        <div class="flex items-center gap-3">
          <button
            @click="isMobileMenuOpen = !isMobileMenuOpen"
            class="md:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
            aria-label="Mở menu"
          >
            <Menu v-if="!isMobileMenuOpen" class="w-6 h-6" />
            <X v-else class="w-6 h-6" />
          </button>

          <RouterLink to="/" class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-brand-600/20">
              EC
            </div>
            <div class="flex flex-col">
              <span class="text-lg font-black tracking-tight text-slate-900 leading-tight">EdgeCart</span>
              <span class="text-[10px] font-semibold text-brand-600 tracking-wider uppercase -mt-0.5">Cloudflare Edge</span>
            </div>
          </RouterLink>
        </div>

        <!-- Center: Search Bar (Desktop) -->
        <div class="hidden md:flex flex-1 max-w-md mx-4">
          <form @submit.prevent="handleSearch" class="relative w-full">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Tìm kiếm sản phẩm, thương hiệu..."
              class="w-full pl-10 pr-4 py-2 bg-slate-100 focus:bg-white border border-transparent focus:border-brand-500 rounded-xl text-sm focus:outline-hidden transition shadow-2xs"
            />
            <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </form>
        </div>

        <!-- Right: Actions & Auth -->
        <div class="flex items-center gap-2 sm:gap-4">
          <!-- Cart Button -->
          <RouterLink
            to="/cart"
            class="relative p-2.5 text-slate-700 hover:text-brand-600 rounded-xl hover:bg-slate-100 transition active:scale-95"
            aria-label="Xem giỏ hàng"
          >
            <ShoppingCart class="w-5 h-5" />
            <span
              v-if="cart.totalItems > 0"
              class="absolute 0 top-1 right-1 bg-brand-600 text-white text-[11px] font-bold rounded-full h-4.5 min-w-[18px] px-1 flex items-center justify-center shadow-xs"
            >
              {{ cart.totalItems }}
            </span>
          </RouterLink>

          <!-- Desktop Navigation Links -->
          <nav class="hidden md:flex items-center gap-4 text-sm font-medium text-slate-600">
            <RouterLink to="/products" class="hover:text-brand-600 transition">Sản phẩm</RouterLink>
            <RouterLink v-if="auth.isAdmin" to="/admin" class="flex items-center gap-1 text-indigo-600 font-semibold hover:text-indigo-700 transition">
              <Shield class="w-4 h-4" />
              Admin
            </RouterLink>
          </nav>

          <!-- User Menu / Login -->
          <div v-if="auth.isAuthenticated" class="relative group hidden sm:block">
            <RouterLink
              to="/profile"
              class="flex items-center gap-2 p-1.5 pr-3 rounded-xl border border-slate-200 hover:border-brand-500 hover:bg-brand-50/50 transition text-sm font-medium text-slate-700"
            >
              <div class="w-7 h-7 rounded-lg bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-xs">
                {{ auth.user?.fullName?.charAt(0) || 'U' }}
              </div>
              <span class="max-w-[100px] truncate">{{ auth.user?.fullName }}</span>
            </RouterLink>
          </div>

          <div v-else class="hidden sm:flex items-center gap-2">
            <RouterLink
              to="/login"
              class="px-3.5 py-2 text-sm font-semibold rounded-xl text-slate-700 hover:bg-slate-100 transition"
            >
              Đăng nhập
            </RouterLink>
            <RouterLink
              to="/register"
              class="px-3.5 py-2 text-sm font-semibold rounded-xl bg-brand-600 hover:bg-brand-700 text-white shadow-xs transition"
            >
              Đăng ký
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Mobile Search Field -->
      <div class="md:hidden pb-3">
        <form @submit.prevent="handleSearch" class="relative w-full">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Tìm kiếm sản phẩm..."
            class="w-full pl-10 pr-4 py-2 bg-slate-100 focus:bg-white border border-transparent focus:border-brand-500 rounded-xl text-sm focus:outline-hidden transition"
          />
          <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </form>
      </div>
    </div>

    <!-- Mobile Drawer Menu -->
    <div
      v-if="isMobileMenuOpen"
      class="md:hidden border-t border-slate-100 bg-white px-4 pt-3 pb-6 flex flex-col gap-3 shadow-lg"
    >
      <RouterLink
        to="/"
        @click="isMobileMenuOpen = false"
        class="py-2 text-sm font-semibold text-slate-800 hover:text-brand-600"
      >
        Trang chủ
      </RouterLink>
      <RouterLink
        to="/products"
        @click="isMobileMenuOpen = false"
        class="py-2 text-sm font-semibold text-slate-800 hover:text-brand-600"
      >
        Tất cả sản phẩm
      </RouterLink>

      <div v-if="auth.isAuthenticated" class="pt-3 border-t border-slate-100 flex flex-col gap-2">
        <RouterLink
          to="/profile"
          @click="isMobileMenuOpen = false"
          class="flex items-center gap-2 py-2 text-sm font-semibold text-slate-800"
        >
          <UserIcon class="w-4 h-4 text-slate-500" />
          Hồ sơ cá nhân: {{ auth.user?.fullName }}
        </RouterLink>
        <RouterLink
          to="/orders"
          @click="isMobileMenuOpen = false"
          class="flex items-center gap-2 py-2 text-sm font-semibold text-slate-800"
        >
          Lịch sử đơn hàng
        </RouterLink>
        <RouterLink
          v-if="auth.isAdmin"
          to="/admin"
          @click="isMobileMenuOpen = false"
          class="flex items-center gap-2 py-2 text-sm font-semibold text-indigo-600"
        >
          <Shield class="w-4 h-4" />
          Admin Dashboard
        </RouterLink>
        <button
          @click="handleLogout(); isMobileMenuOpen = false"
          class="flex items-center gap-2 py-2 text-sm font-semibold text-rose-600 text-left mt-1"
        >
          <LogOut class="w-4 h-4" />
          Đăng xuất
        </button>
      </div>

      <div v-else class="pt-3 border-t border-slate-100 flex flex-col gap-2">
        <RouterLink
          to="/login"
          @click="isMobileMenuOpen = false"
          class="w-full text-center py-2.5 text-sm font-semibold rounded-xl bg-slate-100 text-slate-800"
        >
          Đăng nhập
        </RouterLink>
        <RouterLink
          to="/register"
          @click="isMobileMenuOpen = false"
          class="w-full text-center py-2.5 text-sm font-semibold rounded-xl bg-brand-600 text-white"
        >
          Đăng ký tài khoản
        </RouterLink>
      </div>
    </div>
  </header>
</template>
