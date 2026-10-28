<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCartStore } from '../stores/cart.js';
import { useAuthStore } from '../stores/auth.js';
import { useToastStore } from '../stores/toast.js';
import { orderService } from '../services/order.service.js';
import { extractErrorMessage } from '../services/api.js';
import { PAYMENT_METHOD, type PaymentMethod } from '@edgecart/shared';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import {
  CreditCard,
  Banknote,
  QrCode,
  ShieldCheck,
  Lock,
  ArrowLeft,
  CheckCircle2,
  Loader2,
} from 'lucide-vue-next';

const router = useRouter();
const cart = useCartStore();
const auth = useAuthStore();
const toast = useToastStore();

const isSubmitting = ref(false);
const orderSuccessData = ref<any | null>(null);

// Form Fields
const recipientName = ref(auth.user?.fullName || '');
const phone = ref(auth.user?.phone || '');
const province = ref('Hà Nội');
const district = ref('Cầu Giấy');
const ward = ref('Dịch Vọng');
const streetAddress = ref('');
const selectedPaymentMethod = ref<PaymentMethod>(PAYMENT_METHOD.COD);
const notes = ref('');

// Form Errors
const errors = ref<Record<string, string>>({});

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

const shippingFee = computed(() => {
  return cart.subtotal >= cart.freeShippingThreshold ? 0 : 30000;
});

const totalAmount = computed(() => {
  return cart.subtotal + shippingFee.value;
});

function validateForm(): boolean {
  errors.value = {};

  if (!recipientName.value.trim() || recipientName.value.length < 2) {
    errors.value.recipientName = 'Vui lòng nhập họ tên người nhận (tối thiểu 2 ký tự)';
  }

  const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
  if (!phone.value || !phoneRegex.test(phone.value.trim())) {
    errors.value.phone = 'Số điện thoại không hợp lệ (VD: 0912345678)';
  }

  if (!province.value.trim()) {
    errors.value.province = 'Vui lòng chọn Tỉnh/Thành phố';
  }
  if (!district.value.trim()) {
    errors.value.district = 'Vui lòng chọn Quận/Huyện';
  }
  if (!ward.value.trim()) {
    errors.value.ward = 'Vui lòng chọn Phường/Xã';
  }
  if (!streetAddress.value.trim() || streetAddress.value.length < 5) {
    errors.value.streetAddress = 'Địa chỉ chi tiết phải từ 5 ký tự trở lên';
  }

  return Object.keys(errors.value).length === 0;
}

async function handlePlaceOrder() {
  if (cart.items.length === 0) {
    toast.error('Giỏ hàng của bạn đang trống');
    router.push('/cart');
    return;
  }

  if (!validateForm()) {
    toast.error('Vui lòng kiểm tra lại thông tin giao hàng');
    return;
  }

  isSubmitting.value = true;
  try {
    const idempotencyKey = crypto.randomUUID();
    const result = await orderService.checkout(
      {
        shippingAddress: {
          recipientName: recipientName.value.trim(),
          phone: phone.value.trim(),
          province: province.value.trim(),
          district: district.value.trim(),
          ward: ward.value.trim(),
          streetAddress: streetAddress.value.trim(),
        },
        paymentMethod: selectedPaymentMethod.value,
        notes: notes.value.trim() || undefined,
      },
      idempotencyKey
    );

    // Clear local cart
    cart.clearCart();
    toast.success('Đặt hàng thành công!');

    if (result.paymentUrl) {
      // Redirect to VNPay/Stripe online gateway
      window.location.href = result.paymentUrl;
      return;
    }

    // Success State
    orderSuccessData.value = result;
  } catch (err: unknown) {
    const msg = extractErrorMessage(err);
    toast.error(msg);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <DefaultLayout>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <!-- Order Placed Success View -->
      <div v-if="orderSuccessData" class="max-w-xl mx-auto bg-white p-8 sm:p-12 rounded-3xl border border-slate-100 shadow-xl text-center">
        <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 class="w-10 h-10" />
        </div>
        <h1 class="text-2xl font-black text-slate-900 mb-2">Đặt Hàng Thành Công!</h1>
        <p class="text-xs sm:text-sm text-slate-500 mb-6">
          Cảm ơn bạn đã mua sắm tại EdgeCart. Đơn hàng của bạn đã được ghi nhận vào hệ thống.
        </p>

        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs sm:text-sm space-y-2 text-left mb-6">
          <div class="flex justify-between">
            <span class="text-slate-500">Mã đơn hàng:</span>
            <strong class="text-slate-900 font-mono">{{ orderSuccessData.orderNumber }}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Phương thức:</span>
            <strong class="text-slate-900">{{ orderSuccessData.paymentMethod }}</strong>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Tổng thanh toán:</span>
            <strong class="text-brand-700 font-bold">{{ formatVND(orderSuccessData.totalAmount) }}</strong>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3">
          <RouterLink
            to="/orders"
            class="flex-1 py-3 px-4 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition text-center"
          >
            Xem lịch sử đơn hàng
          </RouterLink>
          <RouterLink
            to="/"
            class="flex-1 py-3 px-4 rounded-xl bg-slate-100 text-slate-700 font-semibold text-xs hover:bg-slate-200 transition text-center"
          >
            Tiếp tục mua sắm
          </RouterLink>
        </div>
      </div>

      <!-- Checkout Form -->
      <div v-else>
        <RouterLink
          to="/cart"
          class="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 mb-6 transition"
        >
          <ArrowLeft class="w-4 h-4" />
          <span>Quay lại giỏ hàng</span>
        </RouterLink>

        <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-8">Thanh Toán Đơn Hàng</h1>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Form Section (2 cols) -->
          <div class="lg:col-span-2 space-y-6">
            <!-- 1. Shipping Address Form -->
            <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-4">
              <h2 class="text-base font-bold text-slate-900 pb-3 border-b border-slate-100 flex items-center justify-between">
                <span>1. Thông tin giao hàng</span>
                <span class="text-xs text-slate-400 font-normal">* Bắt buộc</span>
              </h2>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <!-- Recipient Name -->
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Họ và tên người nhận</label>
                  <input
                    v-model="recipientName"
                    type="text"
                    placeholder="Nguyễn Văn A"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm focus:bg-white focus:outline-hidden transition"
                    :class="errors.recipientName ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
                  />
                  <span v-if="errors.recipientName" class="text-[11px] text-rose-500 mt-1 block">
                    {{ errors.recipientName }}
                  </span>
                </div>

                <!-- Phone -->
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Số điện thoại</label>
                  <input
                    v-model="phone"
                    type="tel"
                    placeholder="0912345678"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm focus:bg-white focus:outline-hidden transition"
                    :class="errors.phone ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
                  />
                  <span v-if="errors.phone" class="text-[11px] text-rose-500 mt-1 block">
                    {{ errors.phone }}
                  </span>
                </div>

                <!-- Province -->
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Tỉnh / Thành phố</label>
                  <input
                    v-model="province"
                    type="text"
                    placeholder="Hà Nội, TP.HCM..."
                    class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm focus:bg-white focus:outline-hidden transition"
                    :class="errors.province ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
                  />
                  <span v-if="errors.province" class="text-[11px] text-rose-500 mt-1 block">
                    {{ errors.province }}
                  </span>
                </div>

                <!-- District -->
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Quận / Huyện</label>
                  <input
                    v-model="district"
                    type="text"
                    placeholder="Cầu Giấy, Quận 1..."
                    class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm focus:bg-white focus:outline-hidden transition"
                    :class="errors.district ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
                  />
                  <span v-if="errors.district" class="text-[11px] text-rose-500 mt-1 block">
                    {{ errors.district }}
                  </span>
                </div>

                <!-- Ward -->
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1">Phường / Xã</label>
                  <input
                    v-model="ward"
                    type="text"
                    placeholder="Phường Dịch Vọng..."
                    class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm focus:bg-white focus:outline-hidden transition"
                    :class="errors.ward ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
                  />
                  <span v-if="errors.ward" class="text-[11px] text-rose-500 mt-1 block">
                    {{ errors.ward }}
                  </span>
                </div>

                <!-- Street Address -->
                <div class="sm:col-span-2">
                  <label class="block text-xs font-bold text-slate-700 mb-1">Địa chỉ cụ thể (Số nhà, đường...)</label>
                  <input
                    v-model="streetAddress"
                    type="text"
                    placeholder="Số 123 Đường Cầu Giấy, Toà nhà A..."
                    class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm focus:bg-white focus:outline-hidden transition"
                    :class="errors.streetAddress ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
                  />
                  <span v-if="errors.streetAddress" class="text-[11px] text-rose-500 mt-1 block">
                    {{ errors.streetAddress }}
                  </span>
                </div>
              </div>

              <!-- Order Notes -->
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Ghi chú giao hàng (Tùy chọn)</label>
                <textarea
                  v-model="notes"
                  rows="2"
                  placeholder="Giao hàng trong giờ hành chính..."
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:border-brand-500"
                ></textarea>
              </div>
            </div>

            <!-- 2. Payment Method Selector -->
            <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-4">
              <h2 class="text-base font-bold text-slate-900 pb-3 border-b border-slate-100">
                2. Phương thức thanh toán
              </h2>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <!-- COD -->
                <label
                  class="p-4 rounded-2xl border-2 flex items-center gap-3 cursor-pointer transition"
                  :class="
                    selectedPaymentMethod === PAYMENT_METHOD.COD
                      ? 'border-brand-600 bg-brand-50/50 text-slate-900 font-bold'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  "
                >
                  <input
                    type="radio"
                    :value="PAYMENT_METHOD.COD"
                    v-model="selectedPaymentMethod"
                    class="text-brand-600 focus:ring-brand-500"
                  />
                  <Banknote class="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <div class="text-sm">COD (Tiền mặt khi nhận)</div>
                    <div class="text-[11px] text-slate-400 font-normal">Thanh toán trực tiếp cho shipper</div>
                  </div>
                </label>

                <!-- VNPAY QR -->
                <label
                  class="p-4 rounded-2xl border-2 flex items-center gap-3 cursor-pointer transition"
                  :class="
                    selectedPaymentMethod === PAYMENT_METHOD.VNPAY
                      ? 'border-brand-600 bg-brand-50/50 text-slate-900 font-bold'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  "
                >
                  <input
                    type="radio"
                    :value="PAYMENT_METHOD.VNPAY"
                    v-model="selectedPaymentMethod"
                    class="text-brand-600 focus:ring-brand-500"
                  />
                  <QrCode class="w-5 h-5 text-blue-600 shrink-0" />
                  <div>
                    <div class="text-sm">VNPAY QR / Banking</div>
                    <div class="text-[11px] text-slate-400 font-normal">Quét mã QR qua app ngân hàng</div>
                  </div>
                </label>

                <!-- Stripe -->
                <label
                  class="p-4 rounded-2xl border-2 flex items-center gap-3 cursor-pointer transition"
                  :class="
                    selectedPaymentMethod === PAYMENT_METHOD.STRIPE
                      ? 'border-brand-600 bg-brand-50/50 text-slate-900 font-bold'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  "
                >
                  <input
                    type="radio"
                    :value="PAYMENT_METHOD.STRIPE"
                    v-model="selectedPaymentMethod"
                    class="text-brand-600 focus:ring-brand-500"
                  />
                  <CreditCard class="w-5 h-5 text-indigo-600 shrink-0" />
                  <div>
                    <div class="text-sm">Thẻ Quốc Tế (Stripe)</div>
                    <div class="text-[11px] text-slate-400 font-normal">Visa, Mastercard, JCB</div>
                  </div>
                </label>

                <!-- Bank Transfer -->
                <label
                  class="p-4 rounded-2xl border-2 flex items-center gap-3 cursor-pointer transition"
                  :class="
                    selectedPaymentMethod === PAYMENT_METHOD.BANK_TRANSFER
                      ? 'border-brand-600 bg-brand-50/50 text-slate-900 font-bold'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  "
                >
                  <input
                    type="radio"
                    :value="PAYMENT_METHOD.BANK_TRANSFER"
                    v-model="selectedPaymentMethod"
                    class="text-brand-600 focus:ring-brand-500"
                  />
                  <Lock class="w-5 h-5 text-teal-600 shrink-0" />
                  <div>
                    <div class="text-sm">Chuyển khoản VietQR</div>
                    <div class="text-[11px] text-slate-400 font-normal">Tự động xác nhận giao dịch 24/7</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <!-- Order Summary Sidebar -->
          <div class="space-y-4">
            <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-4 sticky top-24">
              <h2 class="text-base font-bold text-slate-900 pb-3 border-b border-slate-100">
                Sản Phẩm Đặt Mua ({{ cart.totalItems }})
              </h2>

              <!-- Items Mini List -->
              <div class="space-y-3 max-h-60 overflow-y-auto pr-1">
                <div
                  v-for="item in cart.items"
                  :key="item.variantId"
                  class="flex items-center gap-3 text-xs"
                >
                  <div class="w-12 h-12 rounded-xl bg-slate-100 shrink-0 overflow-hidden border border-slate-100">
                    <img
                      :src="item.imageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100&auto=format&fit=crop&q=60'"
                      :alt="item.productName"
                      class="w-full h-full object-cover"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-bold text-slate-800 truncate">{{ item.productName }}</div>
                    <div class="text-slate-400">SL: {{ item.quantity }} × {{ formatVND(item.unitPrice) }}</div>
                  </div>
                  <div class="font-bold text-slate-900">
                    {{ formatVND(item.totalPrice) }}
                  </div>
                </div>
              </div>

              <!-- Price Breakdown -->
              <div class="pt-4 border-t border-slate-100 space-y-2 text-xs">
                <div class="flex justify-between text-slate-600">
                  <span>Tạm tính</span>
                  <span class="font-semibold">{{ formatVND(cart.subtotal) }}</span>
                </div>
                <div class="flex justify-between text-slate-600">
                  <span>Phí vận chuyển</span>
                  <span class="font-semibold">{{ shippingFee === 0 ? 'Miễn phí' : formatVND(shippingFee) }}</span>
                </div>
                <div class="pt-3 border-t border-slate-100 flex justify-between items-baseline text-sm">
                  <span class="font-bold text-slate-900">Tổng thanh toán</span>
                  <span class="text-xl font-black text-brand-700">{{ formatVND(totalAmount) }}</span>
                </div>
              </div>

              <!-- Place Order Button -->
              <button
                @click="handlePlaceOrder"
                :disabled="isSubmitting"
                class="w-full py-4 px-6 rounded-2xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white font-bold text-sm shadow-md shadow-brand-600/30 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
                <span>{{ isSubmitting ? 'Đang xử lý đơn hàng...' : 'Xác nhận đặt hàng' }}</span>
              </button>

              <div class="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1">
                <ShieldCheck class="w-3.5 h-3.5 text-emerald-600" />
                <span>Cam kết trừ kho nguyên tử & bảo mật đơn</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </DefaultLayout>
</template>
