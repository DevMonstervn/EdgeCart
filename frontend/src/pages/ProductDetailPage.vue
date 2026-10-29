<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { productService } from '../services/product.service.js';
import { useCartStore } from '../stores/cart.js';
import { useAuthStore } from '../stores/auth.js';
import { useToastStore } from '../stores/toast.js';
import type { Product, ProductVariant } from '@edgecart/shared';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import {
  ArrowLeft,
  ShoppingBag,
  ShieldCheck,
  Truck,
  RotateCcw,
  Check,
  AlertCircle,
  Plus,
  Minus,
  Store,
  BadgeCheck,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const cart = useCartStore();
const toast = useToastStore();

const product = ref<Product | null>(null);
const selectedVariant = ref<ProductVariant | null>(null);
const selectedImageIndex = ref(0);
const isLightboxOpen = ref(false);
const zoomScale = ref(1);
const quantity = ref(1);
const isLoading = ref(true);
const error = ref<string | null>(null);

const currentPrice = computed(() => {
  if (selectedVariant.value) {
    return selectedVariant.value.price;
  }
  return product.value?.salePrice || product.value?.basePrice || 0;
});

const currentComparePrice = computed(() => {
  if (selectedVariant.value && selectedVariant.value.compareAtPrice) {
    return selectedVariant.value.compareAtPrice;
  }
  return product.value?.basePrice || 0;
});

const isOutOfStock = computed(() => {
  if (selectedVariant.value) {
    return selectedVariant.value.stockQuantity <= 0;
  }
  return false;
});

const images = computed(() => {
  if (product.value?.images && product.value.images.length > 0) {
    return product.value.images.map((i) => i.imageUrl);
  }
  return ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80'];
});

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function handleImageError(e: Event) {
  const target = e.target as HTMLImageElement;
  if (target && target.src !== 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80') {
    target.src = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80';
  }
}

function handleQuantityChange(delta: number) {
  const newQty = quantity.value + delta;
  const maxStock = selectedVariant.value?.stockQuantity || 1;
  if (newQty >= 1 && newQty <= maxStock) {
    quantity.value = newQty;
  }
}

async function handleAddToCart() {
  if (!auth.isAuthenticated) {
    toast.info('Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng');
    router.push({ path: '/login', query: { redirect: route.fullPath } });
    return;
  }

  if (!product.value || !selectedVariant.value || isOutOfStock.value) return;

  const success = await cart.addItem({
    variantId: selectedVariant.value.id,
    productName: product.value.name,
    variantTitle: selectedVariant.value.title,
    sku: selectedVariant.value.sku,
    unitPrice: currentPrice.value,
    quantity: quantity.value,
    currentStock: selectedVariant.value.stockQuantity,
    imageUrl: images.value[0],
  });

  if (success) {
    quantity.value = 1;
  }
}

async function loadProduct() {
  const slug = route.params.slug as string;
  if (!slug) return;

  isLoading.value = true;
  error.value = null;
  try {
    const data = await productService.getProductBySlug(slug);
    product.value = data;
    if (data.variants && data.variants.length > 0) {
      selectedVariant.value = data.variants[0];
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không tìm thấy sản phẩm';
  } finally {
    isLoading.value = false;
  }
}

function openLightbox(idx?: number) {
  if (typeof idx === 'number') {
    selectedImageIndex.value = idx;
  }
  zoomScale.value = 1;
  isLightboxOpen.value = true;
}

function closeLightbox() {
  isLightboxOpen.value = false;
  zoomScale.value = 1;
}

function prevImage() {
  if (images.value.length <= 1) return;
  selectedImageIndex.value = (selectedImageIndex.value - 1 + images.value.length) % images.value.length;
}

function nextImage() {
  if (images.value.length <= 1) return;
  selectedImageIndex.value = (selectedImageIndex.value + 1) % images.value.length;
}

function toggleZoom() {
  if (zoomScale.value === 1) {
    zoomScale.value = 1.75;
  } else if (zoomScale.value === 1.75) {
    zoomScale.value = 2.5;
  } else {
    zoomScale.value = 1;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!isLightboxOpen.value) return;
  if (e.key === 'Escape') {
    closeLightbox();
  } else if (e.key === 'ArrowLeft') {
    prevImage();
  } else if (e.key === 'ArrowRight') {
    nextImage();
  }
}

onMounted(() => {
  loadProduct();
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <DefaultLayout>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <!-- Breadcrumb & Back button -->
      <button
        @click="router.back()"
        class="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 mb-6 transition"
      >
        <ArrowLeft class="w-4 h-4" />
        <span>Quay lại</span>
      </button>

      <!-- Loading State -->
      <SkeletonLoader v-if="isLoading" type="product-detail" />

      <!-- Error State -->
      <div v-else-if="error || !product" class="p-12 text-center bg-white rounded-3xl border border-rose-100 max-w-lg mx-auto">
        <AlertCircle class="w-12 h-12 text-rose-500 mx-auto mb-3 stroke-1" />
        <h2 class="text-lg font-bold text-slate-800 mb-1">Không tìm thấy sản phẩm</h2>
        <p class="text-xs text-slate-500 mb-6">{{ error || 'Sản phẩm có thể đã bị xóa hoặc ngưng bán.' }}</p>
        <RouterLink
          to="/products"
          class="px-5 py-2.5 rounded-xl bg-brand-600 text-white font-semibold text-xs hover:bg-brand-700 transition"
        >
          Khám phá sản phẩm khác
        </RouterLink>
      </div>

      <!-- Main Product Details -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        <!-- Image Gallery Area -->
        <div class="space-y-3.5">
          <!-- Main Display Image Container -->
          <div
            @click="openLightbox()"
            class="aspect-4/3 sm:aspect-square max-h-[500px] w-full rounded-3xl overflow-hidden bg-slate-50 border border-slate-200/80 shadow-xs relative flex items-center justify-center group cursor-zoom-in select-none"
            role="button"
            tabindex="0"
            aria-label="Nhấn để phóng to ảnh chi tiết"
          >
            <img
              :src="images[selectedImageIndex] || images[0]"
              :alt="product.name"
              @error="handleImageError"
              class="w-full h-full object-contain p-2 sm:p-4 transition-transform duration-300 group-hover:scale-102"
            />

            <!-- Out of Stock Overlay -->
            <div
              v-if="isOutOfStock"
              class="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-10"
            >
              <span class="bg-slate-900 text-white text-sm font-bold px-4 py-2 rounded-xl border border-slate-700">
                Tạm hết hàng
              </span>
            </div>

            <!-- Image Navigation Arrows on Hover/Touch -->
            <button
              v-if="images.length > 1"
              @click.stop="prevImage"
              class="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 flex items-center justify-center shadow-md transition opacity-80 sm:opacity-0 group-hover:opacity-100 z-10 cursor-pointer"
              aria-label="Ảnh trước"
            >
              <ChevronLeft class="w-5 h-5" />
            </button>
            <button
              v-if="images.length > 1"
              @click.stop="nextImage"
              class="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 flex items-center justify-center shadow-md transition opacity-80 sm:opacity-0 group-hover:opacity-100 z-10 cursor-pointer"
              aria-label="Ảnh kế tiếp"
            >
              <ChevronRight class="w-5 h-5" />
            </button>

            <!-- Zoom Badge Indicator -->
            <div
              class="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-slate-900/70 hover:bg-slate-900 text-white text-xs font-bold backdrop-blur-md flex items-center gap-1.5 shadow-md transition z-10 pointer-events-none"
            >
              <ZoomIn class="w-3.5 h-3.5" />
              <span>Phóng to</span>
            </div>

            <!-- Image Counter Pill -->
            <div
              v-if="images.length > 1"
              class="absolute bottom-3 left-3 px-2.5 py-1 rounded-xl bg-slate-900/60 text-white text-[11px] font-bold backdrop-blur-md z-10 pointer-events-none"
            >
              {{ selectedImageIndex + 1 }} / {{ images.length }}
            </div>
          </div>

          <!-- Thumbnails Strip -->
          <div v-if="images.length > 1" class="flex gap-2.5 overflow-x-auto pb-1.5 pt-0.5">
            <button
              v-for="(img, idx) in images"
              :key="idx"
              @click="selectedImageIndex = idx"
              class="w-16 h-16 sm:w-20 sm:h-20 aspect-square rounded-2xl overflow-hidden border-2 transition shrink-0 bg-slate-50 p-1 cursor-pointer"
              :class="selectedImageIndex === idx ? 'border-brand-600 ring-2 ring-brand-500/20 shadow-xs scale-102' : 'border-slate-200 opacity-60 hover:opacity-100'"
              :aria-label="'Xem ảnh ' + (idx + 1)"
            >
              <img :src="img" :alt="`Thumbnail ${idx}`" class="w-full h-full object-cover rounded-xl" />
            </button>
          </div>
        </div>

        <!-- Product Details & Actions Area -->
        <div class="flex flex-col">
          <div v-if="product.category" class="text-xs uppercase font-bold tracking-wider text-brand-600 mb-2">
            {{ product.category.name }}
          </div>

          <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-snug mb-3">
            {{ product.name }}
          </h1>

          <!-- Store Attribution Card -->
          <div class="mb-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
            <div v-if="product.store" class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 font-black text-sm flex items-center justify-center overflow-hidden shrink-0">
                <img
                  v-if="product.store.logoUrl"
                  :src="product.store.logoUrl"
                  :alt="product.store.name"
                  class="w-full h-full object-cover"
                />
                <Store v-else class="w-5 h-5" />
              </div>
              <div class="min-w-0">
                <div class="text-xs font-bold text-slate-900 truncate">{{ product.store.name }}</div>
                <div class="text-[11px] text-slate-500">Gian hàng đối tác trên EdgeCart</div>
              </div>
            </div>
            <div v-else class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <BadgeCheck class="w-5 h-5" />
              </div>
              <div class="min-w-0">
                <div class="text-xs font-bold text-slate-900">EdgeCart Official</div>
                <div class="text-[11px] text-slate-500">Sản phẩm phân phối chính thức bởi hệ thống</div>
              </div>
            </div>

            <RouterLink
              v-if="product.store?.slug"
              :to="`/stores/${product.store.slug}`"
              class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-brand-500 text-xs font-bold text-brand-700 shrink-0 transition"
            >
              <span>Xem cửa hàng</span>
              <ExternalLink class="w-3.5 h-3.5" />
            </RouterLink>
          </div>

          <!-- Price Display -->
          <div class="flex items-baseline gap-3 mb-6 p-4 rounded-2xl bg-white border border-slate-100 shadow-2xs">
            <span class="text-2xl sm:text-3xl font-black text-brand-700">
              {{ formatVND(currentPrice) }}
            </span>
            <span
              v-if="currentComparePrice > currentPrice"
              class="text-sm text-slate-400 line-through"
            >
              {{ formatVND(currentComparePrice) }}
            </span>
            <span
              v-if="currentComparePrice > currentPrice"
              class="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200"
            >
              Tiết kiệm {{ formatVND(currentComparePrice - currentPrice) }}
            </span>
          </div>

          <!-- Variant Picker -->
          <div v-if="product.variants && product.variants.length > 1" class="mb-6 space-y-3">
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Phiên bản / Phân loại ({{ product.variants.length }} tùy chọn):
            </label>
            <div class="flex flex-wrap gap-2.5">
              <button
                v-for="v in product.variants"
                :key="v.id"
                @click="selectedVariant = v; quantity = 1"
                class="px-4 py-2.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5"
                :class="
                  selectedVariant?.id === v.id
                    ? 'border-brand-600 bg-brand-50/70 text-brand-700 font-bold shadow-2xs ring-1 ring-brand-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                "
              >
                <Check v-if="selectedVariant?.id === v.id" class="w-3.5 h-3.5 text-brand-600" />
                <span>{{ v.title }}</span>
                <span class="text-[10px] text-slate-400">({{ v.stockQuantity }} có sẵn)</span>
              </button>
            </div>
          </div>

          <!-- Quantity & Stock Status -->
          <div class="mb-8 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-700 uppercase tracking-wider">Số lượng:</span>
              <span class="text-xs font-semibold" :class="isOutOfStock ? 'text-rose-600' : 'text-emerald-700'">
                {{ isOutOfStock ? 'Hết hàng' : `Còn ${selectedVariant?.stockQuantity || 0} sản phẩm trong kho` }}
              </span>
            </div>

            <div class="flex items-center gap-4">
              <div class="inline-flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
                <button
                  @click="handleQuantityChange(-1)"
                  :disabled="quantity <= 1 || isOutOfStock"
                  class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition"
                  aria-label="Giảm"
                >
                  <Minus class="w-3.5 h-3.5" />
                </button>
                <span class="w-10 text-center font-bold text-sm text-slate-800">{{ quantity }}</span>
                <button
                  @click="handleQuantityChange(1)"
                  :disabled="isOutOfStock || quantity >= (selectedVariant?.stockQuantity || 1)"
                  class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition"
                  aria-label="Tăng"
                >
                  <Plus class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- Add to Cart CTA -->
              <button
                @click="handleAddToCart"
                :disabled="isOutOfStock || !selectedVariant"
                class="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm shadow-md shadow-brand-600/20 active:scale-98 transition"
              >
                <ShoppingBag class="w-4 h-4" />
                <span>{{ isOutOfStock ? 'Hết hàng' : 'Thêm vào giỏ hàng' }}</span>
              </button>
            </div>
          </div>

          <!-- Assurances List -->
          <div class="border-t border-slate-200 pt-6 space-y-3 text-xs text-slate-600">
            <div class="flex items-center gap-3">
              <Truck class="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Giao hàng tiêu chuẩn toàn quốc từ 2 - 4 ngày làm việc</span>
            </div>
            <div class="flex items-center gap-3">
              <RotateCcw class="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Chính sách đổi trả hàng linh hoạt trong 30 ngày</span>
            </div>
            <div class="flex items-center gap-3">
              <ShieldCheck class="w-4 h-4 text-teal-600 shrink-0" />
              <span>Bảo mật giao dịch tại điểm biên với chữ ký mã hóa WebCrypto</span>
            </div>
          </div>

          <!-- Description / Markdown Content -->
          <div v-if="product.description || product.contentMarkdown" class="mt-8 pt-6 border-t border-slate-200">
            <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">Mô tả sản phẩm</h3>
            <p v-if="product.description" class="text-sm text-slate-600 leading-relaxed mb-4 whitespace-pre-line">
              {{ product.description }}
            </p>
            <div v-if="product.contentMarkdown" class="prose prose-sm max-w-none text-slate-600">
              {{ product.contentMarkdown }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Image Zoom / Lightbox Fullscreen Modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isLightboxOpen && product"
          class="fixed inset-0 z-[9998] bg-slate-950/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 select-none"
          role="dialog"
          aria-modal="true"
          aria-label="Phóng to ảnh sản phẩm"
          @click.self="closeLightbox"
        >
          <!-- Top Toolbar -->
          <div class="flex items-center justify-between z-20 pb-2 border-b border-white/10">
            <div class="text-white min-w-0 pr-4">
              <h4 class="text-xs sm:text-sm font-bold truncate text-slate-200">{{ product.name }}</h4>
              <p class="text-[11px] text-slate-400">Ảnh {{ selectedImageIndex + 1 }} / {{ images.length }}</p>
            </div>

            <div class="flex items-center gap-2">
              <!-- Zoom Toggle Button -->
              <button
                @click="toggleZoom"
                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition cursor-pointer"
                :title="'Độ phóng đại: ' + zoomScale + 'x'"
              >
                <ZoomIn v-if="zoomScale === 1" class="w-4 h-4" />
                <ZoomOut v-else class="w-4 h-4" />
                <span class="hidden sm:inline">{{ zoomScale }}x</span>
              </button>

              <!-- Close Button -->
              <button
                @click="closeLightbox"
                class="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                aria-label="Đóng phóng to"
              >
                <X class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- Main Zoomable Image Canvas -->
          <div class="relative flex-1 flex items-center justify-center overflow-hidden my-3">
            <!-- Left Arrow -->
            <button
              v-if="images.length > 1"
              @click="prevImage"
              class="absolute left-2 sm:left-6 z-20 w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition shadow-lg cursor-pointer"
              aria-label="Ảnh trước"
            >
              <ChevronLeft class="w-6 h-6" />
            </button>

            <!-- Image with Zoom Scale -->
            <div class="max-w-full max-h-full flex items-center justify-center overflow-auto p-2">
              <img
                :src="images[selectedImageIndex]"
                :alt="product.name"
                class="max-h-[75vh] max-w-[90vw] object-contain transition-transform duration-200 cursor-zoom-in"
                :style="{ transform: `scale(${zoomScale})` }"
                @click="toggleZoom"
              />
            </div>

            <!-- Right Arrow -->
            <button
              v-if="images.length > 1"
              @click="nextImage"
              class="absolute right-2 sm:right-6 z-20 w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition shadow-lg cursor-pointer"
              aria-label="Ảnh tiếp theo"
            >
              <ChevronRight class="w-6 h-6" />
            </button>
          </div>

          <!-- Bottom Thumbnails Strip -->
          <div v-if="images.length > 1" class="flex justify-center gap-2 overflow-x-auto pt-2 border-t border-white/10 z-20">
            <button
              v-for="(img, idx) in images"
              :key="idx"
              @click="selectedImageIndex = idx; zoomScale = 1"
              class="w-12 h-12 sm:w-14 sm:h-14 aspect-square rounded-xl overflow-hidden border-2 transition shrink-0 bg-white/5 p-0.5 cursor-pointer"
              :class="selectedImageIndex === idx ? 'border-brand-500 ring-2 ring-brand-500/40 scale-105' : 'border-white/20 opacity-50 hover:opacity-100'"
            >
              <img :src="img" :alt="`Thumbnail ${idx}`" class="w-full h-full object-cover rounded-lg" />
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </DefaultLayout>
</template>
