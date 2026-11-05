<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { AIProductCardData } from '@edgecart/shared';
import { useCartStore } from '../../stores/cart.js';
import { useToastStore } from '../../stores/toast.js';
import { ShoppingBag, ArrowRight, CheckCircle2, Store } from 'lucide-vue-next';

const props = defineProps<{
  product: AIProductCardData;
}>();

const emit = defineEmits<{
  (e: 'navigate'): void;
}>();

const router = useRouter();
const cart = useCartStore();
const toast = useToastStore();

const discountPercent = computed(() => {
  if (!props.product.salePrice || props.product.salePrice >= props.product.basePrice) return 0;
  return Math.round(((props.product.basePrice - props.product.salePrice) / props.product.basePrice) * 100);
});

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function handleViewProduct() {
  emit('navigate');
  router.push(`/products/${props.product.slug}`);
}

function handleQuickBuy() {
  emit('navigate');
  router.push(`/products/${props.product.slug}`);
}
</script>

<template>
  <div
    class="bg-white rounded-2xl border border-slate-200/90 hover:border-brand-300 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col group text-left"
  >
    <!-- Image Header -->
    <div
      class="relative aspect-4/3 bg-slate-50 overflow-hidden cursor-pointer"
      @click="handleViewProduct"
    >
      <img
        v-if="product.imageUrl"
        :src="product.imageUrl"
        :alt="product.name"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-slate-300 text-xs font-medium">
        Hình ảnh sản phẩm
      </div>

      <!-- Discount Badge -->
      <span
        v-if="discountPercent > 0"
        class="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black tracking-tight"
      >
        -{{ discountPercent }}%
      </span>

      <!-- Stock Status Badge -->
      <span
        class="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[9px] font-bold backdrop-blur-xs"
        :class="
          product.stockQuantity > 0
            ? 'bg-emerald-500/90 text-white'
            : 'bg-slate-700/80 text-white'
        "
      >
        {{ product.stockQuantity > 0 ? 'Còn hàng' : 'Hết hàng' }}
      </span>
    </div>

    <!-- Product Info Body -->
    <div class="p-3 flex-1 flex flex-col justify-between space-y-2">
      <div>
        <div class="flex items-center gap-1 text-[10px] text-slate-400 mb-1">
          <Store class="w-3 h-3 text-slate-400 shrink-0" />
          <span class="truncate">{{ product.storeName || 'EdgeCart Official' }}</span>
        </div>

        <h4
          @click="handleViewProduct"
          class="text-xs font-bold text-slate-800 line-clamp-2 hover:text-brand-600 cursor-pointer transition leading-snug"
          :title="product.name"
        >
          {{ product.name }}
        </h4>
      </div>

      <!-- Pricing -->
      <div>
        <div class="flex items-baseline gap-1.5 flex-wrap">
          <span class="text-xs sm:text-sm font-black text-brand-700">
            {{ formatVND(product.salePrice || product.basePrice) }}
          </span>
          <span
            v-if="product.salePrice && product.salePrice < product.basePrice"
            class="text-[10px] text-slate-400 line-through"
          >
            {{ formatVND(product.basePrice) }}
          </span>
        </div>

        <!-- Action Button -->
        <div class="pt-2">
          <button
            type="button"
            @click="handleViewProduct"
            class="w-full py-1.5 px-2 bg-brand-50 hover:bg-brand-600 text-brand-700 hover:text-white rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer active:scale-98"
          >
            <span>Xem chi tiết</span>
            <ArrowRight class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
