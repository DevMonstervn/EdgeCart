<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { orderService } from '../services/order.service.js';
import { formatVND, formatDateTime, getOrderStatusMeta } from '../utils/format.js';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import type { Order } from '@edgecart/shared';
import {
  Search,
  Package,
  Clock,
  MapPin,
  CreditCard,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  KeyRound,
} from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();

const orderNumber = ref('');
const token = ref('');
const isLoading = ref(false);
const errorMessage = ref('');
const order = ref<Order | null>(null);

async function handleTrackOrder() {
  const num = orderNumber.value.trim();
  const tok = token.value.trim();

  if (!num || !tok) {
    errorMessage.value = 'Vui lòng nhập đầy đủ mã đơn hàng và mã tra cứu bảo mật';
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';
  order.value = null;

  try {
    const data = await orderService.getGuestOrder(num, tok);
    order.value = data;

    // Security best practice: Strip the raw access token from the browser URL history
    if (route.query.token) {
      router.replace({
        query: { orderNumber: num },
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Không thể tìm thấy thông tin đơn hàng';
    if (msg.includes('404') || msg.toLowerCase().includes('không tìm thấy')) {
      errorMessage.value = 'Không tìm thấy đơn hàng hoặc mã tra cứu không chính xác / đã hết hạn.';
    } else if (msg.toLowerCase().includes('thành viên') || msg.toLowerCase().includes('đăng nhập')) {
      errorMessage.value = 'Đơn hàng này thuộc tài khoản thành viên. Vui lòng đăng nhập để xem chi tiết.';
    } else {
      errorMessage.value = msg;
    }
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  const qOrderNumber = (route.query.orderNumber as string) || '';
  const qToken = (route.query.token as string) || '';

  if (qOrderNumber) {
    orderNumber.value = qOrderNumber;
  }
  if (qToken) {
    token.value = qToken;
  }

  if (qOrderNumber && qToken) {
    handleTrackOrder();
  }
});
</script>

<template>
  <DefaultLayout>
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <!-- Header -->
      <div class="text-center max-w-xl mx-auto mb-8 sm:mb-10">
        <div class="inline-flex items-center gap-2 px-3 py-1 bg-brand-50 text-brand-700 rounded-full text-xs font-semibold mb-3 border border-brand-100">
          <ShieldCheck class="w-4 h-4 text-brand-600" />
          <span>Tra cứu bảo mật EdgeCart</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">
          Tra Cứu Đơn Hàng Khách Vãng Lai
        </h1>
        <p class="text-xs sm:text-sm text-slate-500">
          Nhập mã đơn hàng và mã truy cập bảo mật được cấp khi thanh toán để kiểm tra tiến độ giao hàng và trạng thái thanh toán.
        </p>
      </div>

      <!-- Tracking Search Form -->
      <div class="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm mb-8">
        <form id="tracking-form" @submit.prevent="handleTrackOrder" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="track-order-number" class="block text-xs font-bold text-slate-700 mb-1.5">
                Mã đơn hàng <span class="text-rose-500">*</span>
              </label>
              <div class="relative">
                <input
                  id="track-order-number"
                  v-model="orderNumber"
                  type="text"
                  required
                  placeholder="Ví dụ: EC-123456-789"
                  class="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:bg-white focus:outline-none focus:border-brand-500 transition"
                />
                <Package class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label for="track-order-token" class="block text-xs font-bold text-slate-700 mb-1.5">
                Mã tra cứu bảo mật (Token) <span class="text-rose-500">*</span>
              </label>
              <div class="relative">
                <input
                  id="track-order-token"
                  v-model="token"
                  type="text"
                  required
                  placeholder="Nhập mã truy cập 36 ký tự..."
                  class="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:bg-white focus:outline-none focus:border-brand-500 transition"
                />
                <KeyRound class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          <div class="pt-2 flex justify-end">
            <button
              type="submit"
              :disabled="isLoading"
              class="w-full sm:w-auto px-6 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white font-bold text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
            >
              <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
              <Search v-else class="w-4 h-4" />
              <span>Tra cứu đơn hàng</span>
            </button>
          </div>
        </form>

        <!-- Error Message Alert -->
        <div v-if="errorMessage" class="mt-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-xs sm:text-sm text-rose-800">
          <AlertCircle class="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <div>
            <p class="font-bold">Không thể tra cứu đơn hàng</p>
            <p class="text-xs text-rose-700 mt-0.5">{{ errorMessage }}</p>
          </div>
        </div>
      </div>

      <!-- Order Details View -->
      <div v-if="order" class="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <!-- Order Header Status Banner -->
        <div class="p-6 sm:p-8 bg-slate-50/80 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs text-slate-500">Mã đơn hàng:</span>
              <span class="font-mono font-bold text-slate-900 text-sm sm:text-base">{{ order.orderNumber }}</span>
            </div>
            <p class="text-xs text-slate-500 flex items-center gap-1.5">
              <Clock class="w-3.5 h-3.5 text-slate-400" />
              <span>Thời gian đặt: {{ formatDateTime(order.createdAt) }}</span>
            </p>
          </div>

          <div class="flex items-center gap-2.5">
            <span
              :class="[
                'px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5',
                getOrderStatusMeta(order.shippingStatus).badgeClass,
              ]"
            >
              <Package class="w-3.5 h-3.5" />
              <span>{{ getOrderStatusMeta(order.shippingStatus).label }}</span>
            </span>

            <span
              :class="[
                'px-3 py-1.5 rounded-xl border text-xs font-bold',
                order.paymentStatus === 'PAID'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200',
              ]"
            >
              {{ order.paymentStatus === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán' }}
            </span>
          </div>
        </div>

        <div class="p-6 sm:p-8 space-y-6">
          <!-- Shipping and Payment Overview -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
              <div class="flex items-center gap-2 text-xs font-bold text-slate-800">
                <MapPin class="w-4 h-4 text-brand-600" />
                <span>Địa chỉ nhận hàng</span>
              </div>
              <p class="text-xs text-slate-900 font-semibold">{{ order.shippingName }} ({{ order.customerPhone }})</p>
              <p class="text-xs text-slate-600 leading-relaxed">
                {{ order.shippingAddress }}, {{ order.shippingWard }}, {{ order.shippingDistrict }}, {{ order.shippingProvince }}
              </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
              <div class="flex items-center gap-2 text-xs font-bold text-slate-800">
                <CreditCard class="w-4 h-4 text-brand-600" />
                <span>Thanh toán & Ghi chú</span>
              </div>
              <p class="text-xs text-slate-700">
                Phương thức: <strong class="text-slate-900">{{ order.paymentMethod }}</strong>
              </p>
              <p class="text-xs text-slate-500 italic">
                Ghi chú: {{ order.notes || 'Không có ghi chú' }}
              </p>
            </div>
          </div>

          <!-- Line Items Table -->
          <div>
            <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Sản phẩm trong đơn</h3>
            <div class="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
              <div
                v-for="item in order.items"
                :key="item.id"
                class="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-xs sm:text-sm font-bold text-slate-900 truncate">{{ item.productName }}</p>
                  <p class="text-xs text-slate-500">Phân loại: {{ item.variantTitle }} • SKU: {{ item.sku }}</p>
                  <p class="text-xs text-slate-600 mt-0.5">Số lượng: <strong class="text-slate-900">{{ item.quantity }}</strong></p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-xs sm:text-sm font-bold text-brand-700">{{ formatVND(item.totalPrice) }}</p>
                  <p class="text-[11px] text-slate-400">{{ formatVND(item.unitPrice) }} / chiếc</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Total Calculation -->
          <div class="border-t border-slate-100 pt-4 flex justify-end">
            <div class="w-full sm:w-64 space-y-2 text-xs text-slate-600">
              <div class="flex justify-between">
                <span>Tạm tính:</span>
                <span class="font-semibold text-slate-900">{{ formatVND(order.subtotal) }}</span>
              </div>
              <div class="flex justify-between">
                <span>Phí vận chuyển:</span>
                <span class="font-semibold text-slate-900">{{ formatVND(order.shippingFee) }}</span>
              </div>
              <div v-if="order.discountAmount > 0" class="flex justify-between text-emerald-600">
                <span>Giảm giá:</span>
                <span class="font-semibold">-{{ formatVND(order.discountAmount) }}</span>
              </div>
              <div class="flex justify-between pt-2 border-t border-slate-100 text-sm font-black text-slate-900">
                <span>Tổng cộng:</span>
                <span class="text-brand-700">{{ formatVND(order.totalAmount) }}</span>
              </div>
            </div>
          </div>

          <div class="pt-4 flex justify-between items-center text-xs text-slate-400 border-t border-slate-100">
            <span>EdgeCart Zero Trust Order Verification</span>
            <RouterLink to="/products" class="inline-flex items-center gap-1 font-bold text-brand-600 hover:text-brand-700">
              <span>Tiếp tục mua sắm</span>
              <ArrowRight class="w-3.5 h-3.5" />
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </DefaultLayout>
</template>
