<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { productService } from '../services/product.service.js';
import type { Product, Category } from '@edgecart/shared';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import ProductCard from '../components/ProductCard.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import EmptyState from '../components/EmptyState.vue';
import {
  ShieldCheck,
  Truck,
  RotateCcw,
  Headphones,
  ArrowRight,
  Sparkles,
  Layers,
} from 'lucide-vue-next';

const featuredProducts = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

async function loadData() {
  isLoading.value = true;
  error.value = null;
  try {
    const [catData, prodData] = await Promise.allSettled([
      productService.getCategories(),
      productService.getProducts({ limit: 8, sort: 'popular' }),
    ]);

    if (catData.status === 'fulfilled') {
      categories.value = catData.value;
    }
    if (prodData.status === 'fulfilled') {
      featuredProducts.value = prodData.value.products;
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải dữ liệu trang chủ';
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <DefaultLayout>
    <!-- Hero Banner -->
    <section class="relative overflow-hidden bg-gradient-to-b from-emerald-50/70 via-slate-50 to-slate-50 pt-8 pb-12 sm:pt-16 sm:pb-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center max-w-4xl mx-auto">
          <!-- Main Hero Title & Mascot Header -->
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 lg:gap-8 mb-6">
            <div class="relative shrink-0 group">
              <div class="absolute -inset-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500 rounded-full blur-md opacity-35 group-hover:opacity-60 transition duration-300"></div>
              <img
                src="/logo-dragon.jpg"
                alt="Mua Rồng Logo"
                class="relative w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 rounded-full ring-4 ring-white shadow-xl object-cover transform transition duration-300 group-hover:scale-105"
              />
            </div>

            <div class="text-center sm:text-left">
              <h1 class="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-slate-900 leading-[1.25]">
                Mua Sắm Trực Tuyến <br class="hidden sm:block" />
                <span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 block mt-1">
                  Tốc Độ Siêu Tốc Tại Mua Rồng
                </span>
              </h1>
            </div>
          </div>

          <p class="mt-4 sm:mt-6 text-sm sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Nền tảng thương mại điện tử Edge-Native thế hệ mới: Giỏ hàng tức thì, không gián đoạn kết nối, và đảm bảo trừ tồn kho chuẩn xác tuyệt đối trong các đợt flash-sale.
          </p>

          <div class="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <RouterLink
              to="/products"
              class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-md shadow-brand-600/30 active:scale-95 transition"
            >
              <span>Khám phá ngay</span>
              <ArrowRight class="w-4 h-4" />
            </RouterLink>

            <RouterLink
              to="/products?sort=popular"
              class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 font-semibold text-sm shadow-xs transition active:scale-95"
            >
              <span>Sản phẩm bán chạy</span>
            </RouterLink>
          </div>
        </div>
      </div>
    </section>

    <!-- Value Propositions -->
    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4 sm:-mt-8 mb-12 relative z-10">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div class="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Truck class="w-5 h-5" />
          </div>
          <div>
            <h4 class="text-xs sm:text-sm font-bold text-slate-900">Giao hàng nhanh</h4>
            <p class="text-[11px] text-slate-500">Miễn phí từ 500k</p>
          </div>
        </div>

        <div class="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <ShieldCheck class="w-5 h-5" />
          </div>
          <div>
            <h4 class="text-xs sm:text-sm font-bold text-slate-900">Cam kết chính hãng</h4>
            <p class="text-[11px] text-slate-500">100% chất lượng cao</p>
          </div>
        </div>

        <div class="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <RotateCcw class="w-5 h-5" />
          </div>
          <div>
            <h4 class="text-xs sm:text-sm font-bold text-slate-900">Đổi trả dễ dàng</h4>
            <p class="text-[11px] text-slate-500">30 ngày miễn phí</p>
          </div>
        </div>

        <div class="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Headphones class="w-5 h-5" />
          </div>
          <div>
            <h4 class="text-xs sm:text-sm font-bold text-slate-900">Hỗ trợ 24/7</h4>
            <p class="text-[11px] text-slate-500">Tư vấn tận tâm</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Categories Section -->
    <section v-if="categories.length > 0" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl sm:text-2xl font-bold text-slate-900">Danh Mục Nổi Bật</h2>
          <p class="text-xs sm:text-sm text-slate-500">Lựa chọn các mặt hàng yêu thích theo phân loại</p>
        </div>
        <RouterLink to="/products" class="text-xs sm:text-sm font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1">
          <span>Xem tất cả</span>
          <ArrowRight class="w-4 h-4" />
        </RouterLink>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        <RouterLink
          v-for="cat in categories"
          :key="cat.id"
          :to="`/products?category=${cat.slug}`"
          class="group p-4 bg-white rounded-2xl border border-slate-100 hover:border-brand-300 text-center shadow-2xs hover:shadow-md transition-all flex flex-col items-center"
        >
          <div class="w-14 h-14 rounded-2xl bg-slate-50 group-hover:bg-brand-50 text-slate-700 group-hover:text-brand-600 flex items-center justify-center mb-3 transition">
            <Layers class="w-7 h-7 stroke-1" />
          </div>
          <span class="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-brand-600 line-clamp-1 transition">
            {{ cat.name }}
          </span>
        </RouterLink>
      </div>
    </section>

    <!-- Featured Products Section -->
    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
      <div class="flex items-center justify-between mb-6">
        <div>
          <div class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-600 mb-1">
            <Sparkles class="w-4 h-4 text-brand-500" />
            Flash Sale & Hot Deals
          </div>
          <h2 class="text-xl sm:text-2xl font-bold text-slate-900">Sản Phẩm Đang Được Quan Tâm</h2>
        </div>
        <RouterLink to="/products" class="text-xs sm:text-sm font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1">
          <span>Xem thêm</span>
          <ArrowRight class="w-4 h-4" />
        </RouterLink>
      </div>

      <!-- Loading State -->
      <SkeletonLoader v-if="isLoading" type="card" :count="8" />

      <!-- Error State -->
      <div v-else-if="error" class="p-8 text-center bg-white rounded-2xl border border-rose-100 max-w-md mx-auto">
        <p class="text-rose-600 text-sm font-medium mb-4">{{ error }}</p>
        <button @click="loadData" class="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl">
          Thử lại
        </button>
      </div>

      <!-- Empty State -->
      <EmptyState
        v-else-if="featuredProducts.length === 0"
        title="Chưa có sản phẩm nào"
        description="Dữ liệu danh mục sản phẩm đang được cập nhật."
        actionText="Tải lại trang"
        @action="loadData"
      />

      <!-- Success Product Grid -->
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
        <ProductCard
          v-for="product in featuredProducts"
          :key="product.id"
          :product="product"
        />
      </div>
    </section>
  </DefaultLayout>
</template>
