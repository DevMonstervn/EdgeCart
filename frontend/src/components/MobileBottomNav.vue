<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useCartStore } from '../stores/cart.js';
import { useAuthStore } from '../stores/auth.js';
import { Home, Grid, ShoppingBag, ClipboardList, User } from 'lucide-vue-next';

const route = useRoute();
const cart = useCartStore();
const auth = useAuthStore();
</script>

<template>
  <nav
    class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 px-2 py-1.5 flex items-center justify-around shadow-lg pb-safe"
    aria-label="Thanh điều hướng dưới"
  >
    <!-- Home -->
    <RouterLink
      to="/"
      class="flex flex-col items-center justify-center w-14 py-1 text-slate-500 hover:text-brand-600 transition"
      :class="{ 'text-brand-600 font-bold': route.path === '/' }"
    >
      <Home class="w-5 h-5 mb-0.5" />
      <span class="text-[10px]">Trang chủ</span>
    </RouterLink>

    <!-- Products Catalog -->
    <RouterLink
      to="/products"
      class="flex flex-col items-center justify-center w-14 py-1 text-slate-500 hover:text-brand-600 transition"
      :class="{ 'text-brand-600 font-bold': route.path.startsWith('/products') }"
    >
      <Grid class="w-5 h-5 mb-0.5" />
      <span class="text-[10px]">Sản phẩm</span>
    </RouterLink>

    <!-- Cart with badge -->
    <RouterLink
      to="/cart"
      class="relative flex flex-col items-center justify-center w-14 py-1 text-slate-500 hover:text-brand-600 transition"
      :class="{ 'text-brand-600 font-bold': route.path === '/cart' }"
    >
      <div class="relative">
        <ShoppingBag class="w-5 h-5 mb-0.5" />
        <span
          v-if="cart.totalItems > 0"
          class="absolute -top-1 -right-2 bg-brand-600 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center shadow-xs"
        >
          {{ cart.totalItems }}
        </span>
      </div>
      <span class="text-[10px]">Giỏ hàng</span>
    </RouterLink>

    <!-- Orders -->
    <RouterLink
      to="/orders"
      class="flex flex-col items-center justify-center w-14 py-1 text-slate-500 hover:text-brand-600 transition"
      :class="{ 'text-brand-600 font-bold': route.path.startsWith('/orders') }"
    >
      <ClipboardList class="w-5 h-5 mb-0.5" />
      <span class="text-[10px]">Đơn hàng</span>
    </RouterLink>

    <!-- Profile or Login -->
    <RouterLink
      :to="auth.isAuthenticated ? '/profile' : '/login'"
      class="flex flex-col items-center justify-center w-14 py-1 text-slate-500 hover:text-brand-600 transition"
      :class="{ 'text-brand-600 font-bold': route.path === '/profile' || route.path === '/login' }"
    >
      <User class="w-5 h-5 mb-0.5" />
      <span class="text-[10px]">{{ auth.isAuthenticated ? 'Cá nhân' : 'Đăng nhập' }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.pb-safe {
  padding-bottom: max(0.375rem, env(safe-area-inset-bottom));
}
</style>
