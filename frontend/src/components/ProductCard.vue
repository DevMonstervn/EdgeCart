<script setup lang="ts">
import { computed } from 'vue';
import type { Product } from '@edgecart/shared';
import { useCartStore } from '../stores/cart.js';
import { ShoppingBag, Store, BadgeCheck } from 'lucide-vue-next';

const props = defineProps<{
  product: Product;
}>();

const cart = useCartStore();

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

function handleQuickAdd(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  if (!defaultVariant.value || isOutOfStock.value) return;

  cart.addItem({
    variantId: defaultVariant.value.id,
    productName: props.product.name,
    variantTitle: defaultVariant.value.title,
    sku: defaultVariant.value.sku,
    unitPrice: props.product.salePrice || props.product.basePrice,
    quantity: 1,
    currentStock: defaultVariant.value.stockQuantity,
    imageUrl: primaryImage.value,
  });
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
      <div class="mt-auto pt-2 border-t border-slate-50 flex items-center justify-between gap-2">
        <div>
          <div class="text-sm sm:text-base font-bold text-brand-700">
            {{ formatVND(product.salePrice || product.basePrice) }}
          </div>
          <div
            v-if="product.salePrice && product.salePrice < product.basePrice"
            class="text-[11px] text-slate-400 line-through -mt-0.5"
          >
            {{ formatVND(product.basePrice) }}
          </div>
        </div>

        <!-- Quick Add to Cart Button -->
        <button
          @click="handleQuickAdd"
          :disabled="isOutOfStock"
          type="button"
          class="w-10 h-10 min-w-[40px] rounded-xl flex items-center justify-center transition shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          :class="isOutOfStock ? 'bg-slate-100 text-slate-400' : 'bg-brand-50 hover:bg-brand-600 text-brand-700 hover:text-white'"
          :aria-label="`Thêm ${product.name} vào giỏ hàng`"
        >
          <ShoppingBag class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
