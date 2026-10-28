<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useToastStore } from '../stores/toast.js';
import { getRoleBadgeClass } from '../utils/format.js';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import Modal from '../components/Modal.vue';
import {
  Mail,
  Phone,
  Shield,
  MapPin,
  LogOut,
  ShoppingBag,
  Plus,
  Store,
  Sparkles,
} from 'lucide-vue-next';

const router = useRouter();
const auth = useAuthStore();
const toast = useToastStore();

const isAddressModalOpen = ref(false);
const newAddress = ref({
  recipientName: '',
  phone: '',
  province: '',
  district: '',
  ward: '',
  streetAddress: '',
});

async function handleLogout() {
  await auth.logout();
  toast.info('Bạn đã đăng xuất');
  router.push('/');
}

function handleSaveAddress() {
  toast.success('Đã lưu địa chỉ mới');
  isAddressModalOpen.value = false;
}

onMounted(async () => {
  if (!auth.isAuthenticated) {
    router.push('/login?redirect=/profile');
    return;
  }
  await auth.fetchProfile();
});
</script>

<template>
  <DefaultLayout>
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">Hồ Sơ Cá Nhân</h1>
      <p class="text-xs sm:text-sm text-slate-500 mb-8">Quản lý thông tin tài khoản, vai trò và địa chỉ giao hàng của bạn</p>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- User Info Card (1 col) -->
        <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
          <div class="w-20 h-20 rounded-full bg-brand-100 text-brand-700 font-black text-2xl flex items-center justify-center mb-4 ring-4 ring-brand-50">
            {{ auth.user?.fullName?.charAt(0) || 'U' }}
          </div>

          <h2 class="text-lg font-bold text-slate-900">{{ auth.user?.fullName }}</h2>
          <span
            class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border mt-1.5 mb-4"
            :class="getRoleBadgeClass(auth.user?.role, auth.user?.isSeller)"
          >
            <Shield v-if="auth.canAccessAdmin" class="w-3 h-3" />
            <Store v-else-if="auth.isSeller" class="w-3 h-3" />
            <span>{{ auth.roleLabel }}</span>
          </span>

          <div class="w-full border-t border-slate-100 pt-4 space-y-3 text-xs text-left">
            <div class="flex items-center gap-2.5 text-slate-600">
              <Mail class="w-4 h-4 text-slate-400 shrink-0" />
              <span class="truncate">{{ auth.user?.email }}</span>
            </div>
            <div class="flex items-center gap-2.5 text-slate-600">
              <Phone class="w-4 h-4 text-slate-400 shrink-0" />
              <span>{{ auth.user?.phone || 'Chưa cập nhật' }}</span>
            </div>
          </div>

          <div class="w-full pt-6 mt-auto">
            <button
              @click="handleLogout"
              class="w-full py-2.5 px-4 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition flex items-center justify-center gap-2"
            >
              <LogOut class="w-4 h-4" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>

        <!-- Details & Addresses (2 cols) -->
        <div class="md:col-span-2 space-y-6">
          <!-- Quick Access Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <RouterLink
              to="/orders"
              class="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-brand-300 transition flex items-center gap-3"
            >
              <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <ShoppingBag class="w-5 h-5" />
              </div>
              <div>
                <h4 class="text-xs sm:text-sm font-bold text-slate-900">Đơn hàng của tôi</h4>
                <p class="text-[11px] text-slate-400">Xem lịch sử & trạng thái mua sắm</p>
              </div>
            </RouterLink>

            <RouterLink
              v-if="auth.isSeller"
              to="/seller"
              class="p-4 bg-white rounded-2xl border border-teal-100 shadow-sm hover:border-teal-300 transition flex items-center gap-3"
            >
              <div class="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <Store class="w-5 h-5" />
              </div>
              <div>
                <h4 class="text-xs sm:text-sm font-bold text-slate-900">Kênh Người Bán</h4>
                <p class="text-[11px] text-slate-400">Quản lý cửa hàng, sản phẩm & đơn</p>
              </div>
            </RouterLink>

            <RouterLink
              v-else-if="auth.isCustomer && !auth.isSeller"
              to="/become-seller"
              class="p-4 bg-white rounded-2xl border border-amber-100 shadow-sm hover:border-amber-300 transition flex items-center gap-3"
            >
              <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Sparkles class="w-5 h-5" />
              </div>
              <div>
                <h4 class="text-xs sm:text-sm font-bold text-slate-900">Đăng ký bán hàng</h4>
                <p class="text-[11px] text-slate-400">Mở gian hàng hoặc xem tiến độ duyệt</p>
              </div>
            </RouterLink>

            <RouterLink
              v-if="auth.canAccessAdmin"
              to="/admin"
              class="p-4 bg-white rounded-2xl border border-indigo-100 shadow-sm hover:border-indigo-300 transition flex items-center gap-3"
            >
              <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Shield class="w-5 h-5" />
              </div>
              <div>
                <h4 class="text-xs sm:text-sm font-bold text-slate-900">Hệ thống Quản trị</h4>
                <p class="text-[11px] text-slate-400">Vai trò: {{ auth.roleLabel }}</p>
              </div>
            </RouterLink>
          </div>

          <!-- Sổ Địa Chỉ Giao Hàng -->
          <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 class="font-bold text-sm text-slate-900 flex items-center gap-2">
                <MapPin class="w-4 h-4 text-brand-600" />
                <span>Sổ Địa Chỉ Giao Hàng</span>
              </h3>
              <button
                @click="isAddressModalOpen = true"
                class="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
              >
                <Plus class="w-3.5 h-3.5" />
                <span>Thêm địa chỉ</span>
              </button>
            </div>

            <!-- Default Address Card -->
            <div class="p-4 rounded-2xl border border-brand-200 bg-brand-50/30 text-xs space-y-1 relative">
              <span class="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-600 text-white">
                Mặc định
              </span>
              <div class="font-bold text-slate-900 text-sm">{{ auth.user?.fullName }} ({{ auth.user?.phone || '0912345678' }})</div>
              <div class="text-slate-600">Số 123 Đường Cầu Giấy, Phường Dịch Vọng, Quận Cầu Giấy, Hà Nội</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Address Modal -->
    <Modal :isOpen="isAddressModalOpen" title="Thêm địa chỉ giao hàng mới" @close="isAddressModalOpen = false">
      <form @submit.prevent="handleSaveAddress" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Họ tên người nhận</label>
          <input
            v-model="newAddress.recipientName"
            type="text"
            required
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
          />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Số điện thoại</label>
          <input
            v-model="newAddress.phone"
            type="tel"
            required
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
          />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Địa chỉ chi tiết</label>
          <input
            v-model="newAddress.streetAddress"
            type="text"
            required
            placeholder="Số nhà, tên đường..."
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
          />
        </div>
        <div class="pt-2 flex justify-end gap-2">
          <button
            type="button"
            @click="isAddressModalOpen = false"
            class="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
          >
            Hủy
          </button>
          <button
            type="submit"
            class="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold"
          >
            Lưu địa chỉ
          </button>
        </div>
      </form>
    </Modal>
  </DefaultLayout>
</template>
