<script setup lang="ts">
import { useCartStore } from '../stores/cart';
import { useAuthStore } from '../stores/auth';
import { ShoppingCart, ShieldCheck, Zap, Globe } from 'lucide-vue-next';

const cart = useCartStore();
const auth = useAuthStore();
</script>

<template>
  <div class="min-h-screen flex flex-col bg-slate-50 text-slate-900">
    <!-- Header -->
    <header class="border-b bg-white sticky top-0 z-50 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold text-xl shadow-md shadow-brand-500/20">
            EC
          </div>
          <div>
            <span class="text-xl font-bold tracking-tight text-slate-900">EdgeCart</span>
            <span class="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Edge-Native</span>
          </div>
        </div>

        <nav class="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-600">
          <a href="#features" class="hover:text-brand-600 transition">Tính năng</a>
          <a href="#architecture" class="hover:text-brand-600 transition">Kiến trúc</a>
          <a href="/api/v1" target="_blank" class="hover:text-brand-600 transition">REST API</a>
        </nav>

        <div class="flex items-center space-x-4">
          <button class="relative p-2 text-slate-700 hover:text-brand-600 transition">
            <ShoppingCart class="w-6 h-6" />
            <span v-if="cart.totalItems > 0" class="absolute -top-1 -right-1 bg-brand-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
              {{ cart.totalItems }}
            </span>
          </button>

          <button v-if="!auth.isAuthenticated" class="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition">
            Đăng nhập
          </button>
          <div v-else class="text-sm font-semibold text-slate-700">
            {{ auth.user?.fullName || 'Khách hàng' }}
          </div>
        </div>
      </div>
    </header>

    <!-- Hero Section -->
    <main class="flex-1">
      <section class="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold mb-6">
          <Zap class="w-4 h-4 text-emerald-600" />
          Phản hồi < 50ms TTFB toàn cầu trên Cloudflare Edge Network
        </div>

        <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 max-w-4xl mx-auto leading-tight">
          Nền tảng Thương mại Điện tử <br />
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">
            Chuẩn Serverless & Edge-First
          </span>
        </h1>

        <p class="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Tích hợp toàn diện Vue 3, Hono.js trên Cloudflare Workers, Cloudflare D1 (SQLite Edge DB), KV và R2 Object Storage không chi phí Egress.
        </p>

        <div class="mt-10 flex flex-wrap justify-center gap-4">
          <a href="/api/v1" target="_blank" class="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm transition shadow-md">
            Khám phá API Specs
          </a>
          <a href="/health" target="_blank" class="px-6 py-3 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium text-sm transition shadow-sm">
            Kiểm tra Edge Health Status
          </a>
        </div>
      </section>

      <!-- Key Pillars Section -->
      <section id="features" class="py-16 bg-white border-y border-slate-200">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div class="p-6 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition">
              <div class="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
                <Globe class="w-6 h-6" />
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">Cloudflare Workers & D1</h3>
              <p class="text-sm text-slate-600 leading-relaxed">
                Tốc độ khởi động isolate < 5ms, database SQLite phân tán với tính năng Atomic Batch Transactions chống over-selling trong flash-sale.
              </p>
            </div>

            <div class="p-6 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition">
              <div class="w-12 h-12 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center mb-4">
                <Zap class="w-6 h-6" />
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">Multi-Tier Edge Cache & KV</h3>
              <p class="text-sm text-slate-600 leading-relaxed">
                Cache phân tầng tại 330+ PoPs với Cloudflare Cache API và KV Store, tự động invalidation khi admin cập nhật dữ liệu.
              </p>
            </div>

            <div class="p-6 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition">
              <div class="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center mb-4">
                <ShieldCheck class="w-6 h-6" />
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">Bảo mật Native & R2 Storage</h3>
              <p class="text-sm text-slate-600 leading-relaxed">
                WebCrypto PBKDF2 hashing, Cloudflare Turnstile bot protection, và tải ảnh trực tiếp lên Cloudflare R2 với phí Egress $0.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="bg-white border-t border-slate-200 py-8">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
        &copy; 2026 EdgeCart E-Commerce. Xây dựng trên Cloudflare Edge Native Stack.
      </div>
    </footer>
  </div>
</template>
