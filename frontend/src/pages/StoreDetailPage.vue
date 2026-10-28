<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { storeService } from '../services/store.service.js';
import type { Product, Store as StoreModel } from '@edgecart/shared';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import ProductCard from '../components/ProductCard.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
import { formatDateTime } from '../utils/format.js';
import {
  Store,
  Search,
  Phone,
  Mail,
  Calendar,
  BadgeCheck,
  AlertCircle,
  PackageOpen,
} from 'lucide-vue-next';

const route = useRoute();

const store = ref<StoreModel | null>(null);
const products = ref<Product[]>([]);
const page = ref(1);
const totalPages = ref(1);
const totalProducts = ref(0);
const searchQuery = ref('');
const sortBy = ref<'newest' | 'price_asc' | 'price_desc' | 'popular'>('newest');

const isLoading = ref(true);
const error = ref<string | null>(null);

async function loadStoreData() {
  const slug = route.params.slug as string;
  if (!slug) return;

  isLoading.value = true;
  error.value = null;
  try {
    const res = await storeService.getPublicStoreBySlug(slug, {
      page: page.value,
      limit: 12,
      q: searchQuery.value.trim() || undefined,
      sort: sortBy.value,
    });
    store.value = res.store;
    products.value = res.products;
    totalPages.value = res.meta?.totalPages || 1;
    totalProducts.value = res.meta?.total ?? res.products.length;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải thông tin cửa hàng';
  } finally {
    isLoading.value = false;
  }
}

function handleSearch() {
  page.value = 1;
  loadStoreData();
}

function handlePageChange(newPage: number) {
  page.value = newPage;
  loadStoreData();
}

function resetSearch() {
  searchQuery.value = '';
  sortBy.value = 'newest';
  page.value = 1;
  loadStoreData();
}

watch(
  () => route.params.slug,
  () => {
    page.value = 1;
    searchQuery.value = '';
    loadStoreData();
  }
);

onMounted(() => {
  loadStoreData();
});
</script>

<template>
  <DefaultLayout>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8">
      <!-- Initial Loading Skeleton -->
      <div v-if="isLoading && !store" class="space-y-6">
        <div class="h-48 sm:h-60 rounded-3xl bg-slate-200 animate-pulse"></div>
        <SkeletonLoader type="card" :count="8" />
      </div>

      <!-- Store Not Found / Error State -->
      <div
        v-else-if="error && !store"
        class="p-10 sm:p-14 text-center bg-white rounded-3xl border border-rose-100 max-w-lg mx-auto my-8 shadow-sm"
      >
        <AlertCircle class="w-12 h-12 text-rose-500 mx-auto mb-3 stroke-1" />
        <h1 class="text-lg font-bold text-slate-900 mb-1">Không thể truy cập cửa hàng</h1>
        <p class="text-xs sm:text-sm text-slate-500 mb-6">
          {{ error }}
        </p>
        <div class="flex items-center justify-center gap-3">
          <button
            @click="loadStoreData"
            class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
          >
            Thử lại
          </button>
          <RouterLink
            to="/products"
            class="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs transition"
          >
            Khám phá sản phẩm khác
          </RouterLink>
        </div>
      </div>

      <!-- Storefront Content -->
      <template v-else-if="store">
        <!-- Store Header & Banner -->
        <section class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="relative h-36 sm:h-52 bg-gradient-to-r from-brand-800 via-brand-600 to-teal-500 overflow-hidden">
            <img
              v-if="store.bannerUrl"
              :src="store.bannerUrl"
              :alt="`Ảnh bìa ${store.name}`"
              class="w-full h-full object-cover opacity-90"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-slate-900/50 via-transparent to-transparent"></div>
          </div>

          <div class="px-5 sm:px-8 pb-6">
            <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-10 sm:-mt-12 relative z-10">
              <div class="flex items-end gap-4">
                <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white p-1.5 shadow-md border border-slate-100 shrink-0">
                  <div class="w-full h-full rounded-xl bg-brand-50 text-brand-700 font-black text-2xl flex items-center justify-center overflow-hidden">
                    <img
                      v-if="store.logoUrl"
                      :src="store.logoUrl"
                      :alt="store.name"
                      class="w-full h-full object-cover"
                    />
                    <Store v-else class="w-9 h-9" />
                  </div>
                </div>

                <div class="pb-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h1 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {{ store.name }}
                    </h1>
                    <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <BadgeCheck class="w-3.5 h-3.5" />
                      <span>Đối tác đã duyệt</span>
                    </span>
                  </div>
                  <p class="text-xs text-slate-400 font-mono mt-0.5">@{{ store.slug }}</p>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <div class="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-100 font-semibold">
                  Sản phẩm: <strong class="text-brand-700">{{ totalProducts }}</strong>
                </div>
                <div class="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-1.5">
                  <Calendar class="w-3.5 h-3.5 text-slate-400" />
                  <span>Tham gia {{ formatDateTime(store.createdAt) }}</span>
                </div>
              </div>
            </div>

            <div
              v-if="store.description || store.phone || store.email"
              class="mt-5 pt-5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs sm:text-sm text-slate-600"
            >
              <p v-if="store.description" class="max-w-2xl leading-relaxed">
                {{ store.description }}
              </p>
              <p v-else class="text-slate-400 italic">Chào mừng quý khách ghé thăm gian hàng chính thức trên EdgeCart.</p>

              <div class="flex flex-wrap items-center gap-4 text-xs text-slate-500 shrink-0">
                <span v-if="store.phone" class="inline-flex items-center gap-1.5">
                  <Phone class="w-3.5 h-3.5 text-brand-600" />
                  <span>{{ store.phone }}</span>
                </span>
                <span v-if="store.email" class="inline-flex items-center gap-1.5">
                  <Mail class="w-3.5 h-3.5 text-brand-600" />
                  <span>{{ store.email }}</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- Search & Sort Filter Bar -->
        <section class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <form @submit.prevent="handleSearch" class="relative flex-1">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Tìm sản phẩm trong cửa hàng này..."
              class="w-full pl-9 pr-24 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:border-brand-500 transition"
            />
            <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <button
              type="submit"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition"
            >
              Tìm
            </button>
          </form>

          <div class="flex items-center gap-2">
            <label for="store-sort" class="text-xs font-semibold text-slate-500 shrink-0">Sắp xếp:</label>
            <select
              id="store-sort"
              v-model="sortBy"
              @change="handleSearch"
              class="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-brand-500"
            >
              <option value="newest">Mới nhất</option>
              <option value="popular">Nổi bật nhất</option>
              <option value="price_asc">Giá tăng dần</option>
              <option value="price_desc">Giá giảm dần</option>
            </select>
          </div>
        </section>

        <!-- Products Grid -->
        <SkeletonLoader v-if="isLoading" type="card" :count="8" />

        <div v-else-if="error" class="p-6 bg-white rounded-2xl border border-rose-100 flex items-center justify-between">
          <span class="text-xs text-rose-600 font-semibold">{{ error }}</span>
          <button @click="loadStoreData" class="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold">
            Thử lại
          </button>
        </div>

        <EmptyState
          v-else-if="products.length === 0"
          :title="searchQuery ? 'Không tìm thấy sản phẩm phù hợp' : 'Cửa hàng chưa đăng sản phẩm'"
          :description="
            searchQuery
              ? 'Hãy thử từ khóa khác hoặc xóa bộ lọc tìm kiếm để xem toàn bộ gian hàng.'
              : 'Gian hàng đang chuẩn bị cập nhật danh mục sản phẩm mới.'
          "
          :actionText="searchQuery ? 'Xem tất cả sản phẩm của Shop' : 'Khám phá toàn sàn EdgeCart'"
          :actionTo="searchQuery ? undefined : '/products'"
          @action="resetSearch"
        >
          <template #icon>
            <PackageOpen class="w-8 h-8 text-slate-400 stroke-1" />
          </template>
        </EmptyState>

        <div v-else>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            <ProductCard v-for="item in products" :key="item.id" :product="item" />
          </div>

          <Pagination :page="page" :totalPages="totalPages" @change="handlePageChange" />
        </div>
      </template>
    </div>
  </DefaultLayout>
</template>
