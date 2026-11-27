<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useCartStore } from '../stores/cart.js';
import { useAuthStore } from '../stores/auth.js';
import { useToastStore } from '../stores/toast.js';
import { useAddressStore } from '../stores/address.js';
import { orderService } from '../services/order.service.js';
import { extractErrorMessage } from '../services/api.js';
import { safeRandomUUID } from '../utils/uuid.js';
import { PAYMENT_METHOD, type PaymentMethod, type Address, type AddressInput } from '@edgecart/shared';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import Modal from '../components/Modal.vue';
import AddressModal from '../components/AddressModal.vue';
import {
  CreditCard,
  Banknote,
  QrCode,
  ShieldCheck,
  Lock,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MapPin,
  Plus,
  Home,
  Building2,
  Check,
  Mail,
} from 'lucide-vue-next';

const router = useRouter();
const cart = useCartStore();
const auth = useAuthStore();
const toast = useToastStore();
const addressStore = useAddressStore();

const isSubmitting = ref(false);
const orderSuccessData = ref<any | null>(null);

// Guest Contact State
const guestEmail = ref('');

// Address Management State for Checkout
const selectedAddress = ref<Address | null>(null);
const isAddressSelectModalOpen = ref(false);
const isAddressFormModalOpen = ref(false);
const addressToEdit = ref<Address | null>(null);

// Form Fields (Synced with selectedAddress or manually entered)
const recipientName = ref('');
const phone = ref('');
const province = ref('');
const district = ref('');
const ward = ref('');
const streetAddress = ref('');
const selectedPaymentMethod = ref<PaymentMethod>(PAYMENT_METHOD.COD);
const notes = ref('');

function applyAddressToForm(addr: Address | null) {
  if (addr) {
    selectedAddress.value = addr;
    recipientName.value = addr.recipientName;
    phone.value = addr.phone;
    province.value = addr.province;
    district.value = addr.district || '';
    ward.value = addr.ward;
    streetAddress.value = addr.streetAddress;
  }
}

onMounted(async () => {
  if (auth.isAuthenticated) {
    await addressStore.fetchAddresses();
    if (addressStore.addresses.length > 0) {
      const initial = addressStore.defaultAddress || addressStore.addresses[0];
      applyAddressToForm(initial);
    } else {
      // Prefill profile info if available
      if (auth.user) {
        recipientName.value = auth.user.fullName || '';
        phone.value = auth.user.phone || '';
      }
    }
  }
});

function openAddressSelect() {
  isAddressSelectModalOpen.value = true;
}

function handleSelectAddressItem(addr: Address) {
  applyAddressToForm(addr);
  isAddressSelectModalOpen.value = false;
}

function openAddNewAddress() {
  addressToEdit.value = null;
  isAddressFormModalOpen.value = true;
}

function openEditCurrentAddress() {
  if (selectedAddress.value) {
    addressToEdit.value = selectedAddress.value;
    isAddressFormModalOpen.value = true;
  } else {
    openAddNewAddress();
  }
}

async function handleSaveAddressFromModal(payload: AddressInput) {
  if (addressToEdit.value) {
    if (auth.isAuthenticated) {
      const updated = await addressStore.updateAddress(addressToEdit.value.id, payload);
      if (updated) {
        applyAddressToForm(updated);
        isAddressFormModalOpen.value = false;
      }
    } else {
      applyAddressToForm({
        id: addressToEdit.value.id,
        userId: 'guest',
        isDefault: true,
        ...payload,
        district: payload.district || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      isAddressFormModalOpen.value = false;
    }
  } else {
    if (auth.isAuthenticated) {
      const created = await addressStore.addAddress(payload);
      if (created) {
        applyAddressToForm(created);
        isAddressFormModalOpen.value = false;
        isAddressSelectModalOpen.value = false;
      }
    } else {
      applyAddressToForm({
        id: `guest_addr_${Date.now()}`,
        userId: 'guest',
        isDefault: true,
        ...payload,
        district: payload.district || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      isAddressFormModalOpen.value = false;
      isAddressSelectModalOpen.value = false;
    }
  }
}

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

  if (!auth.isAuthenticated) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!guestEmail.value.trim() || !emailRegex.test(guestEmail.value.trim())) {
      errors.value.email = 'Vui lòng nhập địa chỉ email hợp lệ để nhận thông báo đơn hàng';
    }
  }

  if (!recipientName.value.trim() || recipientName.value.trim().length < 2) {
    errors.value.recipientName = 'Vui lòng nhập họ tên người nhận (tối thiểu 2 ký tự)';
  }

  const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
  if (!phone.value || !phoneRegex.test(phone.value.trim())) {
    errors.value.phone = 'Số điện thoại không hợp lệ (VD: 0912345678)';
  }

  if (!province.value.trim()) {
    errors.value.province = 'Vui lòng chọn hoặc nhập Tỉnh/Thành phố';
  }
  if (!ward.value.trim()) {
    errors.value.ward = 'Vui lòng chọn hoặc nhập Phường/Xã';
  }
  if (!streetAddress.value.trim() || streetAddress.value.trim().length < 3) {
    errors.value.streetAddress = 'Địa chỉ chi tiết phải từ 3 ký tự trở lên';
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
    const idempotencyKey = safeRandomUUID();
    const result = await orderService.checkout(
      {
        customerEmail: !auth.isAuthenticated ? guestEmail.value.trim() : undefined,
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
          <div v-if="orderSuccessData.orderAccessToken" class="flex flex-col gap-1 pt-2 border-t border-slate-200/60 text-xs">
            <div class="flex justify-between items-center">
              <span class="text-slate-500">Mã tra cứu đơn hàng:</span>
              <strong class="text-indigo-600 font-mono text-[11px] select-all bg-indigo-50 px-2 py-0.5 rounded-md">{{ orderSuccessData.orderAccessToken }}</strong>
            </div>
            <p class="text-[11px] text-slate-400 italic">Vui lòng lưu lại mã tra cứu để kiểm tra tiến độ giao hàng bất cứ lúc nào.</p>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3">
          <RouterLink
            v-if="auth.isAuthenticated"
            to="/orders"
            class="flex-1 py-3 px-4 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition text-center"
          >
            Xem lịch sử đơn hàng
          </RouterLink>
          <RouterLink
            v-else-if="orderSuccessData.orderAccessToken"
            :to="{ path: '/order-tracking', query: { orderNumber: orderSuccessData.orderNumber, token: orderSuccessData.orderAccessToken } }"
            class="flex-1 py-3 px-4 rounded-xl bg-brand-600 text-white font-bold text-xs hover:bg-brand-700 transition text-center flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span>Tra cứu tiến độ giao hàng</span>
            <ArrowRight class="w-3.5 h-3.5" />
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
            <!-- Guest Contact Information Section (Shown only for unauthenticated guests) -->
            <div v-if="!auth.isAuthenticated" class="bg-white rounded-3xl border border-slate-100 shadow-xs p-5 sm:p-6 space-y-3">
              <div class="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 class="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <Mail class="w-4.5 h-4.5 text-brand-600" />
                  <span>Thông Tin Khách Mua Hàng</span>
                </h2>
                <RouterLink to="/login" class="text-xs font-bold text-brand-600 hover:text-brand-700">
                  Đã có tài khoản? Đăng nhập
                </RouterLink>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">
                  Email nhận thông báo đơn hàng <span class="text-rose-500">*</span>
                </label>
                <input
                  v-model="guestEmail"
                  type="email"
                  placeholder="name@example.com"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-hidden transition"
                  :class="errors.email ? 'border-rose-400 bg-rose-50/30' : 'border-slate-200 focus:border-brand-500'"
                />
                <p v-if="errors.email" class="text-xs text-rose-500 mt-1 font-semibold">{{ errors.email }}</p>
                <p v-else class="text-[11px] text-slate-400 mt-1">
                  EdgeCart sẽ gửi thông tin xác nhận và mã tra cứu đơn hàng qua email này.
                </p>
              </div>
            </div>

            <!-- 1. Shipping Address Section (Shopee / E-commerce Style) -->
            <div class="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden">
              <!-- Shopee-like top decorative accent stripe -->
              <div class="h-1.5 bg-gradient-to-r from-brand-600 via-emerald-500 to-indigo-600" />

              <div class="p-5 sm:p-6 space-y-4">
                <div class="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h2 class="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                    <MapPin class="w-4.5 h-4.5 text-brand-600" />
                    <span>Địa Chỉ Nhận Hàng</span>
                  </h2>
                  <div v-if="selectedAddress || addressStore.addresses.length > 0" class="flex items-center gap-2.5 text-xs">
                    <button
                      type="button"
                      @click="openEditCurrentAddress"
                      class="font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                    >
                      Chỉnh sửa
                    </button>
                    <span class="text-slate-300">|</span>
                    <button
                      type="button"
                      @click="openAddressSelect"
                      class="font-bold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1 rounded-xl transition cursor-pointer"
                    >
                      Thay đổi
                    </button>
                  </div>
                </div>

                <!-- Case A: Saved Address is Selected -->
                <div v-if="selectedAddress" class="space-y-2">
                  <div class="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                    <span class="font-black text-slate-900 text-sm sm:text-base">{{ recipientName }}</span>
                    <span class="text-slate-300">|</span>
                    <span class="font-bold text-slate-700">{{ phone }}</span>

                    <!-- Default Badge -->
                    <span
                      v-if="selectedAddress.isDefault"
                      class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1"
                    >
                      <CheckCircle2 class="w-3 h-3" />
                      <span>Mặc định</span>
                    </span>

                    <!-- Label Badge -->
                    <span
                      class="text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1"
                      :class="
                        selectedAddress.label === 'OFFICE'
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      "
                    >
                      <Building2 v-if="selectedAddress.label === 'OFFICE'" class="w-2.5 h-2.5" />
                      <Home v-else class="w-2.5 h-2.5" />
                      <span>{{ selectedAddress.label === 'OFFICE' ? 'Văn phòng' : (selectedAddress.label === 'HOME' ? 'Nhà riêng' : selectedAddress.label) }}</span>
                    </span>
                  </div>

                  <div class="text-slate-700 text-xs sm:text-sm leading-relaxed">
                    <p class="font-semibold text-slate-800">{{ streetAddress }}</p>
                    <p class="text-slate-500 text-xs">
                      {{ ward }}{{ district ? ', ' + district : '' }}, {{ province }}
                    </p>
                  </div>
                </div>

                <!-- Case B: User has NO saved addresses yet -->
                <div v-else class="py-4 text-center space-y-3">
                  <div class="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 mx-auto flex items-center justify-center">
                    <MapPin class="w-6 h-6 stroke-1" />
                  </div>
                  <div>
                    <h3 class="text-sm font-bold text-slate-800">Chưa có thông tin địa chỉ giao hàng</h3>
                    <p class="text-xs text-slate-500 mt-0.5">
                      Vui lòng thêm địa chỉ nhận hàng để hoàn tất thanh toán đơn hàng.
                    </p>
                  </div>
                  <button
                    type="button"
                    @click="openAddNewAddress"
                    class="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-600/20 active:scale-98 transition cursor-pointer"
                  >
                    <Plus class="w-3.5 h-3.5" />
                    <span>Thêm địa chỉ giao hàng mới</span>
                  </button>
                  <div v-if="errors.recipientName || errors.phone || errors.province || errors.ward || errors.streetAddress" class="text-xs text-rose-500 font-semibold pt-2">
                    {{ errors.recipientName || errors.phone || errors.province || errors.ward || errors.streetAddress }}
                  </div>
                </div>
              </div>

              <!-- Order Notes -->
              <div class="px-5 sm:px-6 pb-5 pt-1 border-t border-slate-50">
                <label class="block text-xs font-bold text-slate-700 mb-1">Ghi chú giao hàng (Tùy chọn)</label>
                <textarea
                  v-model="notes"
                  rows="2"
                  placeholder="Ví dụ: Giao hàng giờ hành chính, gọi trước khi tới..."
                  class="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition resize-none"
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

    <!-- Address Selection Modal (Shopee style) -->
    <Modal :isOpen="isAddressSelectModalOpen" title="Địa Chỉ Nhận Hàng Của Tôi" @close="isAddressSelectModalOpen = false">
      <div class="space-y-4">
        <div class="flex items-center justify-between pb-2 border-b border-slate-100">
          <span class="text-xs text-slate-500">Chọn địa chỉ giao hàng cho đơn hàng này</span>
          <button
            type="button"
            @click="openAddNewAddress"
            class="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 cursor-pointer"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Thêm địa chỉ mới</span>
          </button>
        </div>

        <!-- Address List -->
        <div class="max-h-80 overflow-y-auto space-y-2.5 pr-1">
          <div
            v-for="addr in addressStore.addresses"
            :key="addr.id"
            @click="handleSelectAddressItem(addr)"
            class="p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3"
            :class="
              selectedAddress?.id === addr.id
                ? 'border-brand-600 bg-brand-50/40 shadow-xs'
                : 'border-slate-200 hover:border-brand-200 bg-white'
            "
          >
            <!-- Radio Indicator -->
            <div
              class="w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 transition"
              :class="
                selectedAddress?.id === addr.id
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-300 bg-white'
              "
            >
              <div v-if="selectedAddress?.id === addr.id" class="w-1.5 h-1.5 rounded-full bg-white" />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0 text-xs space-y-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-slate-900">{{ addr.recipientName }}</span>
                <span class="text-slate-400">|</span>
                <span class="font-semibold text-slate-600">{{ addr.phone }}</span>
                <span
                  v-if="addr.isDefault"
                  class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white"
                >
                  Mặc định
                </span>
                <span
                  class="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600"
                >
                  {{ addr.label === 'OFFICE' ? 'Văn phòng' : (addr.label === 'HOME' ? 'Nhà riêng' : addr.label) }}
                </span>
              </div>
              <p class="text-slate-700 font-medium">{{ addr.streetAddress }}</p>
              <p class="text-slate-500 text-[11px]">
                {{ addr.ward }}{{ addr.district ? ', ' + addr.district : '' }}, {{ addr.province }}
              </p>
            </div>

            <!-- Edit Button -->
            <button
              type="button"
              @click.stop="addressToEdit = addr; isAddressFormModalOpen = true"
              class="text-xs text-brand-600 hover:text-brand-700 font-semibold px-2 py-1 rounded-lg hover:bg-white transition cursor-pointer"
            >
              Sửa
            </button>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
          <button
            type="button"
            @click="isAddressSelectModalOpen = false"
            class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </Modal>

    <!-- Add / Edit Address Modal in Checkout -->
    <AddressModal
      :isOpen="isAddressFormModalOpen"
      :addressToEdit="addressToEdit"
      :isSaving="addressStore.isSaving"
      @close="isAddressFormModalOpen = false"
      @save="handleSaveAddressFromModal"
    />
  </DefaultLayout>
</template>
