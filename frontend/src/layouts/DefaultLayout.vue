<script setup lang="ts">
import Navbar from '../components/Navbar.vue';
import MobileBottomNav from '../components/MobileBottomNav.vue';
import Toast from '../components/Toast.vue';
import AIChatLauncher from '../components/chat/AIChatLauncher.vue';
import AIChatDrawer from '../components/chat/AIChatDrawer.vue';
import { Zap, ShieldCheck, Heart } from 'lucide-vue-next';
</script>

<template>
  <div class="min-h-screen flex flex-col bg-slate-50 text-slate-800">
    <Navbar />

    <!-- Main Content Slot with padding for mobile bottom bar -->
    <main class="flex-1 pb-16 md:pb-0">
      <slot />
    </main>

    <!-- Desktop Footer -->
    <footer class="bg-white border-t border-slate-200 mt-16 pb-20 md:pb-8 pt-10 text-slate-600 text-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <img
                src="/logo-dragon.jpg"
                alt="Mua Rồng Logo"
                class="w-8 h-8 rounded-lg object-cover ring-1 ring-slate-200"
              />
              <span class="text-base font-bold text-slate-900">Mua Rồng</span>
            </div>
            <p class="text-xs text-slate-500 leading-relaxed">
              Nền tảng thương mại điện tử Edge-Native hiệu năng cao, vận hành 100% trên mạng lưới Cloudflare Workers, D1, KV và R2.
            </p>
          </div>

          <div>
            <h4 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Sản phẩm</h4>
            <ul class="space-y-2 text-xs text-slate-500">
              <li><RouterLink to="/products" class="hover:text-brand-600">Tất cả sản phẩm</RouterLink></li>
              <li><RouterLink to="/products?sort=newest" class="hover:text-brand-600">Sản phẩm mới nhất</RouterLink></li>
              <li><RouterLink to="/products?sort=popular" class="hover:text-brand-600">Bán chạy nhất</RouterLink></li>
            </ul>
          </div>

          <div>
            <h4 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Tài khoản & Hỗ trợ</h4>
            <ul class="space-y-2 text-xs text-slate-500">
              <li><RouterLink to="/cart" class="hover:text-brand-600">Giỏ hàng</RouterLink></li>
              <li><RouterLink to="/orders" class="hover:text-brand-600">Theo dõi đơn hàng</RouterLink></li>
              <li><RouterLink to="/profile" class="hover:text-brand-600">Sổ địa chỉ</RouterLink></li>
            </ul>
          </div>

          <div>
            <h4 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Edge Performance</h4>
            <div class="space-y-2 text-xs text-slate-500">
              <div class="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                <Zap class="w-4 h-4 shrink-0 text-emerald-600" />
                <span>330+ Cloudflare Edge PoPs</span>
              </div>
              <div class="flex items-center gap-2 text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                <ShieldCheck class="w-4 h-4 shrink-0 text-indigo-600" />
                <span>Zero Trust & WAF Protected</span>
              </div>
            </div>
          </div>
        </div>

        <div class="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <div>&copy; 2026 EdgeCart E-Commerce. All rights reserved.</div>
          <div class="flex items-center gap-1">
            Build with <Heart class="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> on Cloudflare Edge.
          </div>
        </div>
      </div>
    </footer>

    <!-- Mobile-First Bottom Navigation Bar -->
    <MobileBottomNav />

    <!-- Global Toast Alert Container -->
    <Toast />

    <!-- EdgeCart AI Assistant Widgets -->
    <AIChatLauncher />
    <AIChatDrawer />
  </div>
</template>
