<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { sellerService } from '../services/seller.service.js';
import type { Store as StoreModel } from '@edgecart/shared';
import Toast from '../components/Toast.vue';
import {
  LayoutDashboard,
  Store,
  Package,
  Boxes,
  ShoppingBag,
  ArrowLeft,
  ExternalLink,
  LogOut,
  Menu,
  X,
} from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const isSidebarOpen = ref(false);
const currentStore = ref<StoreModel | null>(null);

const navItems = [
  { label: 'Tổng quan', path: '/seller', icon: LayoutDashboard },
  { label: 'Hồ sơ cửa hàng', path: '/seller/store', icon: Store },
  { label: 'Sản phẩm', path: '/seller/products', icon: Package },
  { label: 'Quản lý Kho', path: '/seller/inventory', icon: Boxes },
  { label: 'Đơn hàng Shop', path: '/seller/orders', icon: ShoppingBag },
];

async function handleLogout() {
  await auth.logout();
  router.push('/login');
}

onMounted(async () => {
  try {
    currentStore.value = await sellerService.getStoreProfile();
  } catch {
    // Individual pages handle error display gracefully
  }
});
</script>

<template>
  <div class="min-h-screen bg-slate-100 flex flex-col md:flex-row text-slate-800">
    <!-- Mobile Header -->
    <header class="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40">
      <div class="flex items-center gap-2">
        <button
          @click="isSidebarOpen = !isSidebarOpen"
          class="p-1 rounded-lg text-slate-300 hover:text-white"
          aria-label="Mở menu Kênh Người Bán"
        >
          <Menu v-if="!isSidebarOpen" class="w-6 h-6" />
          <X v-else class="w-6 h-6" />
        </button>
        <span class="font-bold text-sm tracking-wide truncate max-w-[180px]">
          {{ currentStore?.name || 'Kênh Người Bán' }}
        </span>
      </div>

      <RouterLink to="/" class="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1">
        <ArrowLeft class="w-3.5 h-3.5" />
        Về Storefront
      </RouterLink>
    </header>

    <!-- Sidebar Navigation -->
    <aside
      class="fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 p-5 flex flex-col transition-transform duration-200 ease-in-out md:static md:translate-x-0"
      :class="isSidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <!-- Sidebar Brand -->
      <div class="flex items-center gap-3 pb-6 border-b border-slate-800 mb-6">
        <div class="w-9 h-9 rounded-xl bg-brand-600 text-white font-black flex items-center justify-center text-base shadow-md shadow-brand-600/30 shrink-0">
          <Store class="w-5 h-5" />
        </div>
        <div class="min-w-0">
          <h2 class="font-bold text-white text-sm leading-tight truncate">
            {{ currentStore?.name || 'Kênh Người Bán' }}
          </h2>
          <span class="text-[11px] text-brand-400 font-semibold">EdgeCart Seller Center</span>
        </div>
      </div>

      <!-- Navigation Links -->
      <nav class="flex-1 space-y-1.5">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          @click="isSidebarOpen = false"
          class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition"
          :class="
            route.path === item.path
              ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
              : 'hover:bg-slate-800 text-slate-400 hover:text-white'
          "
        >
          <component :is="item.icon" class="w-4 h-4" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <!-- Sidebar Bottom -->
      <div class="pt-6 border-t border-slate-800 space-y-2">
        <RouterLink
          v-if="currentStore?.slug"
          :to="`/stores/${currentStore.slug}`"
          class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-brand-300 hover:text-white hover:bg-slate-800 transition"
        >
          <ExternalLink class="w-4 h-4" />
          Xem Gian hàng công khai
        </RouterLink>

        <RouterLink
          to="/"
          class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <ArrowLeft class="w-4 h-4" />
          Về Storefront Mua sắm
        </RouterLink>

        <button
          @click="handleLogout"
          class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-950/30 transition text-left"
        >
          <LogOut class="w-4 h-4" />
          Đăng xuất
        </button>
      </div>
    </aside>

    <!-- Backdrop on mobile -->
    <div
      v-if="isSidebarOpen"
      @click="isSidebarOpen = false"
      class="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-sm"
    ></div>

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <!-- Desktop Header -->
      <header class="hidden md:flex bg-white border-b border-slate-200 px-8 py-4 items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-slate-900">Trung Tâm Bán Hàng EdgeCart</h1>
        </div>
        <div class="flex items-center gap-3">
          <RouterLink
            v-if="currentStore?.slug"
            :to="`/stores/${currentStore.slug}`"
            class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition"
          >
            Gian hàng của tôi ↗
          </RouterLink>
          <RouterLink
            to="/"
            class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
          >
            Về Storefront
          </RouterLink>
          <div class="flex items-center gap-2 text-sm font-semibold text-slate-700 pl-2 border-l border-slate-200">
            <div class="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-xs overflow-hidden shrink-0">
              <img v-if="auth.user?.avatarUrl" :src="auth.user.avatarUrl" :alt="auth.user.fullName" class="w-full h-full object-cover" />
              <span v-else>{{ auth.user?.fullName?.charAt(0) || 'S' }}</span>
            </div>
            <div class="leading-tight">
              <div class="text-xs font-bold text-slate-900">{{ auth.user?.fullName }}</div>
              <div class="text-[10px] text-brand-600 font-semibold">Người bán đã duyệt</div>
            </div>
          </div>
        </div>
      </header>

      <!-- Page Content -->
      <main class="flex-1 p-4 sm:p-6 lg:p-8">
        <slot />
      </main>
    </div>

    <Toast />
  </div>
</template>
