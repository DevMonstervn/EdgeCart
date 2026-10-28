<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { productService } from '../services/product.service.js';
import type { Product, Category } from '@edgecart/shared';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import ProductCard from '../components/ProductCard.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
import { SlidersHorizontal, X, Search, RotateCcw } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();

const products = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

const totalPages = ref(1);
const totalProducts = ref(0);
const currentPage = ref(1);
const isFilterDrawerOpen = ref(false);

// Filter Form States
const selectedCategory = ref<string>((route.query.category as string) || '');
const searchQuery = ref<string>((route.query.q as string) || '');
const selectedSort = ref<string>((route.query.sort as string) || 'newest');
const minPrice = ref<string>((route.query.minPrice as string) || '');
const maxPrice = ref<string>((route.query.maxPrice as string) || '');

async function fetchProducts() {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await productService.getProducts({
      category: selectedCategory.value || undefined,
      q: searchQuery.value || undefined,
      sort: (selectedSort.value as any) || 'newest',
      minPrice: minPrice.value ? Number(minPrice.value) : undefined,
      maxPrice: maxPrice.value ? Number(maxPrice.value) : undefined,
      page: currentPage.value,
      limit: 12,
    });

    products.value = res.products;
    if (res.meta) {
      totalPages.value = res.meta.totalPages || 1;
      totalProducts.value = res.meta.total || res.products.length;
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải danh sách sản phẩm';
  } finally {
    isLoading.value = false;
  }
}

async function loadCategories() {
  try {
    categories.value = await productService.getCategories();
  } catch {
    // Categories failure is non-fatal
  }
}

function applyFilters() {
  currentPage.value = 1;
  isFilterDrawerOpen.value = false;

  const query: Record<string, string> = {};
  if (selectedCategory.value) query.category = selectedCategory.value;
  if (searchQuery.value) query.q = searchQuery.value;
  if (selectedSort.value) query.sort = selectedSort.value;
  if (minPrice.value) query.minPrice = minPrice.value;
  if (maxPrice.value) query.maxPrice = maxPrice.value;

  router.push({ path: '/products', query });
  fetchProducts();
}

function resetFilters() {
  selectedCategory.value = '';
  searchQuery.value = '';
  selectedSort.value = 'newest';
  minPrice.value = '';
  maxPrice.value = '';
  applyFilters();
}

function handlePageChange(newPage: number) {
  currentPage.value = newPage;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  fetchProducts();
}

watch(
  () => route.query,
  (newQ) => {
    selectedCategory.value = (newQ.category as string) || '';
    searchQuery.value = (newQ.q as string) || '';
    selectedSort.value = (newQ.sort as string) || 'newest';
    minPrice.value = (newQ.minPrice as string) || '';
    maxPrice.value = (newQ.maxPrice as string) || '';
    fetchProducts();
  }
);

onMounted(() => {
  loadCategories();
  fetchProducts();
});
</script>

<template>
  <DefaultLayout>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <!-- Header & Active Filters Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 mb-6">
        <div>
          <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Cửa Hàng Sản Phẩm</h1>
          <p class="text-xs sm:text-sm text-slate-500 mt-1">
            Hiển thị {{ products.length }} / {{ totalProducts }} sản phẩm
          </p>
        </div>

        <!-- Controls: Sort & Filter Toggle -->
        <div class="flex items-center gap-3">
          <!-- Mobile Filter Button -->
          <button
            @click="isFilterDrawerOpen = true"
            class="lg:hidden flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
          >
            <SlidersHorizontal class="w-4 h-4 text-slate-500" />
            <span>Bộ lọc</span>
          </button>

          <!-- Sort Dropdown -->
          <select
            v-model="selectedSort"
            @change="applyFilters"
            class="flex-1 sm:flex-none px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-2xs focus:outline-hidden focus:border-brand-500 transition"
          >
            <option value="newest">Mới nhất</option>
            <option value="popular">Bán chạy nhất</option>
            <option value="price_asc">Giá: Thấp đến Cao</option>
            <option value="price_desc">Giá: Cao đến Thấp</option>
          </select>
        </div>
      </div>

      <div class="flex flex-col lg:flex-row gap-8">
        <!-- Desktop Filter Sidebar -->
        <aside class="hidden lg:block w-64 shrink-0 space-y-6">
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-6 sticky top-24">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100">
              <span class="font-bold text-sm text-slate-900">Bộ Lọc Tìm Kiếm</span>
              <button
                @click="resetFilters"
                class="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1"
              >
                <RotateCcw class="w-3 h-3" />
                Đặt lại
              </button>
            </div>

            <!-- Categories -->
            <div>
              <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">Danh mục</h3>
              <div class="space-y-1.5 max-h-48 overflow-y-auto">
                <button
                  @click="selectedCategory = ''; applyFilters()"
                  class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition"
                  :class="selectedCategory === '' ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-600 hover:bg-slate-50'"
                >
                  Tất cả danh mục
                </button>
                <button
                  v-for="cat in categories"
                  :key="cat.id"
                  @click="selectedCategory = cat.slug; applyFilters()"
                  class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition"
                  :class="selectedCategory === cat.slug ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-600 hover:bg-slate-50'"
                >
                  {{ cat.name }}
                </button>
              </div>
            </div>

            <!-- Price Range -->
            <div>
              <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">Khoảng giá (VNĐ)</h3>
              <div class="flex items-center gap-2">
                <input
                  v-model="minPrice"
                  type="number"
                  placeholder="Từ"
                  class="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-brand-500"
                />
                <span class="text-slate-400">-</span>
                <input
                  v-model="maxPrice"
                  type="number"
                  placeholder="Đến"
                  class="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-brand-500"
                />
              </div>
              <button
                @click="applyFilters"
                class="mt-3 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition"
              >
                Áp dụng giá
              </button>
            </div>
          </div>
        </aside>

        <!-- Product Grid Area -->
        <div class="flex-1">
          <!-- Loading State -->
          <SkeletonLoader v-if="isLoading" type="card" :count="8" />

          <!-- Error State -->
          <div v-else-if="error" class="p-8 text-center bg-white rounded-2xl border border-rose-100">
            <p class="text-rose-600 text-sm font-medium mb-4">{{ error }}</p>
            <button @click="fetchProducts" class="px-5 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl">
              Thử lại
            </button>
          </div>

          <!-- Empty State -->
          <EmptyState
            v-else-if="products.length === 0"
            title="Không tìm thấy sản phẩm"
            description="Không có sản phẩm nào phù hợp với bộ lọc hiện tại của bạn."
            actionText="Xóa bộ lọc"
            @action="resetFilters"
          />

          <!-- Success Grid -->
          <div v-else>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
              <ProductCard
                v-for="product in products"
                :key="product.id"
                :product="product"
              />
            </div>

            <!-- Pagination -->
            <Pagination
              :page="currentPage"
              :totalPages="totalPages"
              @change="handlePageChange"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile Filter Drawer Modal -->
    <div
      v-if="isFilterDrawerOpen"
      class="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end"
      @click.self="isFilterDrawerOpen = false"
    >
      <div class="w-full max-w-xs bg-white h-full p-6 flex flex-col justify-between shadow-2xl overflow-y-auto">
        <div class="space-y-6">
          <div class="flex items-center justify-between pb-4 border-b border-slate-100">
            <span class="font-bold text-base text-slate-900">Bộ Lọc Sản Phẩm</span>
            <button @click="isFilterDrawerOpen = false" class="p-1 rounded-lg text-slate-400 hover:text-slate-600">
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- Categories -->
          <div>
            <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">Danh mục</h3>
            <div class="space-y-1 max-h-56 overflow-y-auto">
              <button
                @click="selectedCategory = ''"
                class="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold"
                :class="selectedCategory === '' ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'"
              >
                Tất cả
              </button>
              <button
                v-for="cat in categories"
                :key="cat.id"
                @click="selectedCategory = cat.slug"
                class="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold"
                :class="selectedCategory === cat.slug ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'"
              >
                {{ cat.name }}
              </button>
            </div>
          </div>

          <!-- Price Range -->
          <div>
            <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">Khoảng giá</h3>
            <div class="flex items-center gap-2">
              <input
                v-model="minPrice"
                type="number"
                placeholder="Từ (VNĐ)"
                class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
              <span class="text-slate-400">-</span>
              <input
                v-model="maxPrice"
                type="number"
                placeholder="Đến (VNĐ)"
                class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>
        </div>

        <div class="pt-6 border-t border-slate-100 flex gap-2">
          <button
            @click="resetFilters"
            class="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            Đặt lại
          </button>
          <button
            @click="applyFilters"
            class="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl transition"
          >
            Xem kết quả
          </button>
        </div>
      </div>
    </div>
  </DefaultLayout>
</template>
