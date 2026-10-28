<script setup lang="ts">
import { computed } from 'vue';
import { useCartStore } from '../stores/cart.js';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import EmptyState from '../components/EmptyState.vue';
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShieldCheck,
  Truck,
  Sparkles,
} from 'lucide-vue-next';

const cart = useCartStore();

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

const shippingFee = computed(() => {
  return cart.subtotal >= cart.freeShippingThreshold ? 0 : 30000;
});

const totalAmount = computed(() => {
  return cart.subtotal + shippingFee.value;
});
</script>

<template>
  <DefaultLayout>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">Giỏ Hàng Của Bạn</h1>
      <p class="text-xs sm:text-sm text-slate-500 mb-8">
        Có {{ cart.totalItems }} sản phẩm đang chờ thanh toán
      </p>

      <!-- Empty Cart State -->
      <EmptyState
        v-if="cart.items.length === 0"
        title="Giỏ hàng của bạn đang trống"
        description="Hãy lựa chọn những món đồ bạn yêu thích và thêm vào giỏ hàng ngay!"
        actionText="Bắt đầu mua sắm"
        actionTo="/products"
      >
        <template #icon>
          <ShoppingBag class="w-8 h-8 text-slate-400 stroke-1" />
        </template>
      </EmptyState>

      <!-- Cart Content Grid -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Items List (2 cols) -->
        <div class="lg:col-span-2 space-y-4">
          <!-- Free Shipping Notification Bar -->
          <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-2xs space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold">
              <span class="flex items-center gap-1.5 text-slate-700">
                <Truck class="w-4 h-4 text-emerald-600" />
                <span v-if="cart.amountToFreeShipping > 0">
                  Mua thêm <strong class="text-brand-700">{{ formatVND(cart.amountToFreeShipping) }}</strong> để được miễn phí vận chuyển!
                </span>
                <span v-else class="text-emerald-700 font-bold flex items-center gap-1">
                  <Sparkles class="w-4 h-4 text-emerald-500" />
                  Bạn đã đủ điều kiện được Miễn Phí Vận Chuyển toàn quốc!
                </span>
              </span>
              <span class="text-slate-400">{{ cart.freeShippingProgress }}%</span>
            </div>
            <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                :style="{ width: `${cart.freeShippingProgress}%` }"
              ></div>
            </div>
          </div>

          <!-- Items Table / Mobile Cards -->
          <div class="bg-white rounded-3xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden">
            <div
              v-for="item in cart.items"
              :key="item.variantId"
              class="p-4 sm:p-5 flex gap-4 items-center transition hover:bg-slate-50/50"
            >
              <!-- Image Thumbnail -->
              <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-100">
                <img
                  :src="item.imageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&auto=format&fit=crop&q=60'"
                  :alt="item.productName"
                  class="w-full h-full object-cover"
                />
              </div>

              <!-- Item Details -->
              <div class="flex-1 min-w-0">
                <h3 class="text-sm sm:text-base font-bold text-slate-800 truncate mb-0.5">
                  {{ item.productName }}
                </h3>
                <p class="text-xs text-slate-400 font-medium mb-2">
                  Phân loại: <span class="text-slate-600">{{ item.variantTitle }}</span>
                </p>

                <div class="text-sm font-bold text-brand-700 sm:hidden mb-2">
                  {{ formatVND(item.unitPrice) }}
                </div>

                <!-- Quantity Controller -->
                <div class="flex items-center gap-3">
                  <div class="inline-flex items-center bg-slate-100 rounded-xl p-0.5">
                    <button
                      @click="cart.updateQuantity(item.variantId, item.quantity - 1)"
                      class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-white transition"
                      aria-label="Giảm số lượng"
                    >
                      <Minus class="w-3.5 h-3.5" />
                    </button>
                    <span class="w-8 text-center text-xs font-bold text-slate-800">{{ item.quantity }}</span>
                    <button
                      @click="cart.updateQuantity(item.variantId, item.quantity + 1)"
                      class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-white transition"
                      aria-label="Tăng số lượng"
                    >
                      <Plus class="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    @click="cart.removeItem(item.variantId)"
                    class="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 transition p-1"
                    aria-label="Xóa sản phẩm"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                    <span class="hidden sm:inline">Xóa</span>
                  </button>
                </div>
              </div>

              <!-- Price (Desktop) -->
              <div class="hidden sm:block text-right">
                <div class="text-base font-black text-slate-900">
                  {{ formatVND(item.totalPrice) }}
                </div>
                <div class="text-xs text-slate-400">
                  {{ formatVND(item.unitPrice) }} / món
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Order Summary & Checkout Sidebar -->
        <div class="space-y-4">
          <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-5 sticky top-24">
            <h2 class="text-base font-bold text-slate-900 pb-3 border-b border-slate-100">
              Tóm Tắt Đơn Hàng
            </h2>

            <div class="space-y-3 text-sm">
              <div class="flex justify-between text-slate-600">
                <span>Tạm tính ({{ cart.totalItems }} sản phẩm)</span>
                <span class="font-semibold text-slate-800">{{ formatVND(cart.subtotal) }}</span>
              </div>

              <div class="flex justify-between text-slate-600">
                <span>Phí vận chuyển</span>
                <span class="font-semibold text-slate-800">
                  {{ shippingFee === 0 ? 'Miễn phí' : formatVND(shippingFee) }}
                </span>
              </div>

              <div class="pt-3 border-t border-slate-100 flex justify-between items-baseline">
                <span class="font-bold text-slate-900">Tổng thanh toán</span>
                <span class="text-2xl font-black text-brand-700">{{ formatVND(totalAmount) }}</span>
              </div>
            </div>

            <!-- Checkout CTA -->
            <RouterLink
              to="/checkout"
              class="w-full inline-flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-md shadow-brand-600/30 active:scale-98 transition"
            >
              <span>Tiến hành đặt hàng</span>
              <ArrowRight class="w-4 h-4" />
            </RouterLink>

            <div class="pt-2 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <ShieldCheck class="w-4 h-4 text-emerald-600" />
              <span>Thanh toán an toàn với mã hóa chuẩn Edge</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </DefaultLayout>
</template>
