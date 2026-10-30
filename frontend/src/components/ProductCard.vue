<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import type { Product } from '@edgecart/shared';
import { useCartStore } from '../stores/cart.js';
import { useAuthStore } from '../stores/auth.js';
import { useToastStore } from '../stores/toast.js';
import { ShoppingBag, Store, BadgeCheck, Zap, Loader2 } from 'lucide-vue-next';

const props = defineProps<{
  product: Product;
}>();

const router = useRouter();
const cart = useCartStore();
const auth = useAuthStore();
const toast = useToastStore();

const primaryImage = computed(() => {
  if (props.product.images && props.product.images.length > 0) {
    return props.product.images[0].imageUrl;
  }
  return 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=60';
});

const defaultVariant = computed(() => {
  if (props.product.variants && props.product.variants.length > 0) {
    return props.product.variants[0];
  }
  return null;
});

const discountPercentage = computed(() => {
  if (props.product.salePrice && props.product.basePrice > props.product.salePrice) {
    return Math.round(((props.product.basePrice - props.product.salePrice) / props.product.basePrice) * 100);
  }
  return 0;
});

const isOutOfStock = computed(() => {
  if (defaultVariant.value) {
    return defaultVariant.value.stockQuantity <= 0;
  }
  return false;
});

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

const isQuickAdding = ref(false);
const isQuickBuying = ref(false);

async function handleQuickAdd(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  if (!defaultVariant.value || isOutOfStock.value || isQuickAdding.value) return;

  if (!auth.isAuthenticated) {
    toast.info('Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng');
    router.push({ path: '/login', query: { redirect: `/products/${props.product.slug}` } });
    return;
  }

  isQuickAdding.value = true;
  try {
    await cart.addItem({
      variantId: defaultVariant.value.id,
      productName: props.product.name,
      variantTitle: defaultVariant.value.title,
      sku: defaultVariant.value.sku,
      unitPrice: props.product.salePrice || props.product.basePrice,
      quantity: 1,
      currentStock: defaultVariant.value.stockQuantity,
      imageUrl: primaryImage.value,
    });
  } finally {
    isQuickAdding.value = false;
  }
}

async function handleQuickBuy(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  if (!defaultVariant.value || isOutOfStock.value || isQuickBuying.value) return;

  const item = {
    variantId: defaultVariant.value.id,
    productName: props.product.name,
    variantTitle: defaultVariant.value.title,
    sku: defaultVariant.value.sku,
    unitPrice: props.product.salePrice || props.product.basePrice,
    quantity: 1,
    currentStock: defaultVariant.value.stockQuantity,
    imageUrl: primaryImage.value,
  };

  if (!auth.isAuthenticated) {
    await cart.addItem(item);
    toast.info('Vui lòng đăng nhập để tiến hành thanh toán');
    router.push({ path: '/login', query: { redirect: '/checkout' } });
    return;
  }

  isQuickBuying.value = true;
  try {
    const success = await cart.addItem(item);
    if (success) {
      await router.push('/checkout');
    }
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể chuyển đến trang thanh toán');
  } finally {
    isQuickBuying.value = false;
  }
}

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=60';

function handleImageError(e: Event) {
  const target = e.target as HTMLImageElement;
  if (target && target.src !== FALLBACK_IMAGE) {
    target.src = FALLBACK_IMAGE;
  }
}
</script>

<template>
  <div class="group relative bg-white rounded-2xl p-3 border border-slate-100 hover:border-brand-300 shadow-sm hover:shadow-md transition-all flex flex-col h-full">
    <!-- Image & Badges Container -->
    <RouterLink :to="`/products/${product.slug}`" class="block relative aspect-square rounded-xl overflow-hidden bg-slate-100 mb-3">
      <img
        :src="primaryImage"
        :alt="product.name"
        loading="lazy"
        @error="handleImageError"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />

      <!-- Discount Badge -->
      <span
        v-if="discountPercentage > 0"
        class="absolute top-2 left-2 bg-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm"
      >
        -{{ discountPercentage }}%
      </span>

      <!-- Out of Stock Overlay -->
      <div
        v-if="isOutOfStock"
        class="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-2"
      >
        <span class="bg-slate-900/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700">
          Tạm hết hàng
        </span>
      </div>
    </RouterLink>

    <!-- Info Section -->
    <div class="flex-1 flex flex-col">
      <div v-if="product.category" class="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
        {{ product.category.name }}
      </div>

      <RouterLink
        :to="`/products/${product.slug}`"
        class="text-sm font-semibold text-slate-800 hover:text-brand-600 line-clamp-2 leading-snug mb-1.5 transition"
      >
        {{ product.name }}
      </RouterLink>

      <!-- Store Attribution -->
      <div class="mb-2">
        <RouterLink
          v-if="product.store?.slug"
          :to="`/stores/${product.store.slug}`"
          class="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-brand-700 max-w-full truncate transition"
        >
          <Store class="w-3 h-3 text-brand-600 shrink-0" />
          <span class="truncate">{{ product.store.name }}</span>
        </RouterLink>
        <span
          v-else-if="!product.storeId"
          class="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600"
        >
          <BadgeCheck class="w-3 h-3 shrink-0" />
          <span>EdgeCart Official</span>
        </span>
      </div>

      <!-- Price & Action Section -->
      <div class="mt-auto pt-2.5 border-t border-slate-50 flex items-center justify-between gap-1.5">
        <div class="min-w-0 flex-1">
          <div class="text-xs sm:text-base font-bold text-brand-700 truncate">
            {{ formatVND(product.salePrice || product.basePrice) }}
          </div>
          <div
            v-if="product.salePrice && product.salePrice < product.basePrice"
            class="text-[10px] sm:text-[11px] text-slate-400 line-through -mt-0.5 truncate"
          >
            {{ formatVND(product.basePrice) }}
          </div>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <!-- Quick Add to Cart Button -->
          <button
            @click="handleQuickAdd"
            :disabled="isOutOfStock || isQuickAdding"
            type="button"
            class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition shadow-2xs active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-brand-600"
            :aria-label="`Thêm ${product.name} vào giỏ hàng`"
            title="Thêm vào giỏ"
          >
            <Loader2 v-if="isQuickAdding" class="w-3.5 h-3.5 animate-spin" />
            <ShoppingBag v-else class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <!-- Quick Buy Now Button -->
          <button
            @click="handleQuickBuy"
            :disabled="isOutOfStock || isQuickBuying"
            type="button"
            class="h-8 sm:h-9 px-2 sm:px-2.5 rounded-xl flex items-center justify-center gap-1 transition shadow-xs active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed bg-brand-600 hover:bg-brand-700 text-white font-bold text-[11px] sm:text-xs"
            :aria-label="`Mua ngay ${product.name}`"
            title="Mua ngay"
          >
            <Loader2 v-if="isQuickBuying" class="w-3.5 h-3.5 animate-spin" />
            <Zap v-else class="w-3.5 h-3.5 fill-current text-amber-300" />
            <span class="hidden md:inline">Mua ngay</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
