<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useToastStore } from '../stores/toast.js';
import { useAddressStore } from '../stores/address.js';
import { getRoleBadgeClass } from '../utils/format.js';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import Modal from '../components/Modal.vue';
import AddressModal from '../components/AddressModal.vue';
import SingleImageUploader from '../components/SingleImageUploader.vue';
import { uploadService } from '../services/upload.service.js';
import type { Address, AddressInput } from '@edgecart/shared';
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
  Camera,
  Edit2,
  Loader2,
  Trash2,
  CheckCircle2,
  Home,
  Building2,
} from 'lucide-vue-next';

const router = useRouter();
const auth = useAuthStore();
const toast = useToastStore();
const addressStore = useAddressStore();

const isAddressModalOpen = ref(false);
const addressToEdit = ref<Address | null>(null);
const addressToDelete = ref<Address | null>(null);
const isConfirmDeleteOpen = ref(false);

const isEditProfileOpen = ref(false);
const isSavingProfile = ref(false);
const isUploadingAvatar = ref(false);
const avatarFileInput = ref<HTMLInputElement | null>(null);
const profileForm = ref({
  fullName: '',
  phone: '',
  avatarUrl: '',
});

function openAddAddressModal() {
  addressToEdit.value = null;
  isAddressModalOpen.value = true;
}

function openEditAddressModal(addr: Address) {
  addressToEdit.value = addr;
  isAddressModalOpen.value = true;
}

function confirmDeleteAddress(addr: Address) {
  addressToDelete.value = addr;
  isConfirmDeleteOpen.value = true;
}

async function handleDeleteAddress() {
  if (!addressToDelete.value) return;
  await addressStore.deleteAddress(addressToDelete.value.id);
  isConfirmDeleteOpen.value = false;
  addressToDelete.value = null;
}

async function handleSetDefaultAddress(addr: Address) {
  await addressStore.setDefault(addr.id);
}

async function handleSaveAddress(payload: AddressInput) {
  if (addressToEdit.value) {
    const res = await addressStore.updateAddress(addressToEdit.value.id, payload);
    if (res) isAddressModalOpen.value = false;
  } else {
    const res = await addressStore.addAddress(payload);
    if (res) isAddressModalOpen.value = false;
  }
}

function triggerDirectAvatarPick() {
  if (isUploadingAvatar.value) return;
  avatarFileInput.value?.click();
}

async function handleDirectAvatarChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (!file) return;

  isUploadingAvatar.value = true;
  try {
    const uploaded = await uploadService.uploadImage(file, 'avatars');
    await auth.updateProfile({ avatarUrl: uploaded.imageUrl });
    toast.success('Cập nhật ảnh đại diện thành công!');
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Tải ảnh đại diện thất bại');
  } finally {
    isUploadingAvatar.value = false;
  }
}

function openEditProfile() {
  profileForm.value = {
    fullName: auth.user?.fullName || '',
    phone: auth.user?.phone || '',
    avatarUrl: auth.user?.avatarUrl || '',
  };
  isEditProfileOpen.value = true;
}

async function handleSaveProfile() {
  if (isSavingProfile.value) return;
  if (!profileForm.value.fullName.trim() || profileForm.value.fullName.trim().length < 2) {
    toast.error('Họ và tên tối thiểu 2 ký tự');
    return;
  }

  isSavingProfile.value = true;
  try {
    await auth.updateProfile({
      fullName: profileForm.value.fullName.trim(),
      phone: profileForm.value.phone.trim() || null,
      avatarUrl: profileForm.value.avatarUrl.trim() || null,
    });
    toast.success('Cập nhật thông tin cá nhân thành công!');
    isEditProfileOpen.value = false;
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Cập nhật thông tin thất bại');
  } finally {
    isSavingProfile.value = false;
  }
}

async function handleLogout() {
  await auth.logout();
  toast.info('Bạn đã đăng xuất');
  router.push('/');
}

onMounted(async () => {
  if (!auth.isAuthenticated) {
    router.push('/login?redirect=/profile');
    return;
  }
  await Promise.all([auth.fetchProfile(), addressStore.fetchAddresses()]);
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
          <!-- Hidden Native File Input for 1-Click Avatar Upload -->
          <input
            ref="avatarFileInput"
            type="file"
            accept="image/webp,image/png,image/jpeg,image/avif"
            class="hidden"
            @change="handleDirectAvatarChange"
          />

          <!-- Avatar with Click-to-Upload & Camera Button -->
          <div class="relative mb-3">
            <div
              @click="triggerDirectAvatarPick"
              class="relative w-24 h-24 rounded-full overflow-hidden ring-4 ring-brand-50 shadow-sm flex items-center justify-center bg-brand-100 text-brand-700 font-black text-2xl group cursor-pointer transition active:scale-95"
              title="Nhấn để đổi ảnh đại diện"
            >
              <img
                v-if="auth.user?.avatarUrl"
                :src="auth.user.avatarUrl"
                :alt="auth.user.fullName"
                class="w-full h-full object-cover"
              />
              <span v-else>{{ auth.user?.fullName?.charAt(0) || 'U' }}</span>

              <!-- Hover / Uploading Overlay -->
              <div
                class="absolute inset-0 bg-slate-900/50 flex flex-col items-center justify-center text-white transition"
                :class="isUploadingAvatar ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
              >
                <Loader2 v-if="isUploadingAvatar" class="w-6 h-6 animate-spin" />
                <template v-else>
                  <Camera class="w-5 h-5 mb-0.5" />
                  <span class="text-[10px] font-semibold">Đổi ảnh</span>
                </template>
              </div>
            </div>

            <!-- Floating Camera Button Badge for Mobile / Touch Accessibility -->
            <button
              type="button"
              @click.stop="triggerDirectAvatarPick"
              :disabled="isUploadingAvatar"
              class="absolute -bottom-1 -right-1 p-2 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-md transition active:scale-90 cursor-pointer disabled:bg-slate-300"
              title="Đổi ảnh đại diện"
            >
              <Loader2 v-if="isUploadingAvatar" class="w-3.5 h-3.5 animate-spin" />
              <Camera v-else class="w-3.5 h-3.5" />
            </button>
          </div>

          <h2 class="text-lg font-bold text-slate-900">{{ auth.user?.fullName }}</h2>
          <span
            class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border mt-1.5 mb-3"
            :class="getRoleBadgeClass(auth.user?.role, auth.user?.isSeller)"
          >
            <Shield v-if="auth.canAccessAdmin" class="w-3 h-3" />
            <Store v-else-if="auth.isSeller" class="w-3 h-3" />
            <span>{{ auth.roleLabel }}</span>
          </span>

          <!-- Quick Action Buttons: Change Avatar & Edit Info -->
          <div class="flex items-center gap-2 mb-4">
            <button
              type="button"
              @click="triggerDirectAvatarPick"
              :disabled="isUploadingAvatar"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              <Camera class="w-3.5 h-3.5" />
              <span>Đổi ảnh</span>
            </button>

            <button
              type="button"
              @click="openEditProfile"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              <Edit2 class="w-3.5 h-3.5" />
              <span>Sửa hồ sơ</span>
            </button>
          </div>

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
              class="w-full py-2.5 px-4 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
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
                type="button"
                @click="openAddAddressModal"
                class="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-xl transition cursor-pointer"
              >
                <Plus class="w-3.5 h-3.5" />
                <span>Thêm địa chỉ mới</span>
              </button>
            </div>

            <!-- Loading State -->
            <div v-if="addressStore.isLoading" class="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 class="w-4 h-4 animate-spin text-brand-600" />
              <span>Đang tải danh sách địa chỉ...</span>
            </div>

            <!-- Empty State (No Addresses) -->
            <div
              v-else-if="addressStore.addresses.length === 0"
              class="p-6 rounded-2xl border-2 border-dashed border-slate-200 text-center flex flex-col items-center justify-center"
            >
              <div class="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mb-2">
                <MapPin class="w-6 h-6 stroke-1" />
              </div>
              <h4 class="text-sm font-bold text-slate-800 mb-1">Chưa có địa chỉ nhận hàng</h4>
              <p class="text-xs text-slate-500 mb-4 max-w-sm">
                Bạn chưa lưu địa chỉ nào. Hãy thêm địa chỉ giao hàng để đặt hàng nhanh chóng và thuận tiện hơn.
              </p>
              <button
                type="button"
                @click="openAddAddressModal"
                class="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-600/20 active:scale-98 transition cursor-pointer"
              >
                <Plus class="w-3.5 h-3.5" />
                <span>Thêm địa chỉ đầu tiên</span>
              </button>
            </div>

            <!-- Address List -->
            <div v-else class="space-y-3">
              <div
                v-for="addr in addressStore.addresses"
                :key="addr.id"
                class="p-4 rounded-2xl border transition-all text-xs space-y-2 relative"
                :class="
                  addr.isDefault
                    ? 'border-brand-300 bg-brand-50/20 shadow-2xs'
                    : 'border-slate-200/90 bg-white hover:border-slate-300'
                "
              >
                <!-- Top Row: Name, Phone & Badges -->
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-slate-900 text-sm">{{ addr.recipientName }}</span>
                    <span class="text-slate-400">|</span>
                    <span class="font-semibold text-slate-600">{{ addr.phone }}</span>

                    <!-- Default Badge -->
                    <span
                      v-if="addr.isDefault"
                      class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1"
                    >
                      <CheckCircle2 class="w-3 h-3" />
                      <span>Mặc định</span>
                    </span>

                    <!-- Label Badge -->
                    <span
                      class="text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1"
                      :class="
                        addr.label === 'OFFICE'
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      "
                    >
                      <Building2 v-if="addr.label === 'OFFICE'" class="w-2.5 h-2.5" />
                      <Home v-else class="w-2.5 h-2.5" />
                      <span>{{ addr.label === 'OFFICE' ? 'Văn phòng' : (addr.label === 'HOME' ? 'Nhà riêng' : addr.label) }}</span>
                    </span>
                  </div>

                  <!-- Actions: Edit & Delete -->
                  <div class="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      @click="openEditAddressModal(addr)"
                      class="font-semibold text-brand-600 hover:text-brand-700 hover:underline cursor-pointer"
                    >
                      Chỉnh sửa
                    </button>
                    <span class="text-slate-300">·</span>
                    <button
                      type="button"
                      @click="confirmDeleteAddress(addr)"
                      class="font-semibold text-rose-500 hover:text-rose-700 hover:underline cursor-pointer"
                    >
                      Xóa
                    </button>
                  </div>
                </div>

                <!-- Address Body -->
                <div class="text-slate-700 leading-relaxed">
                  <p class="font-medium text-slate-800">{{ addr.streetAddress }}</p>
                  <p class="text-slate-500 text-[11px]">
                    {{ addr.ward }}{{ addr.district ? ', ' + addr.district : '' }}, {{ addr.province }}
                  </p>
                </div>

                <!-- Set Default Action -->
                <div v-if="!addr.isDefault" class="pt-1 flex justify-start">
                  <button
                    type="button"
                    @click="handleSetDefaultAddress(addr)"
                    class="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 text-[11px] font-semibold text-slate-600 hover:text-brand-700 transition cursor-pointer"
                  >
                    Thiết lập làm mặc định
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Profile Modal -->
    <Modal :isOpen="isEditProfileOpen" title="Chỉnh sửa thông tin cá nhân" @close="isEditProfileOpen = false">
      <form @submit.prevent="handleSaveProfile" class="space-y-5">
        <!-- Avatar Uploader -->
        <SingleImageUploader
          v-model="profileForm.avatarUrl"
          folder="avatars"
          shape="circle"
          label="Ảnh đại diện (Avatar)"
          hint="Bấm hoặc kéo thả ảnh để tải lên R2"
        />

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">
            Họ và tên <span class="text-rose-500">*</span>
          </label>
          <input
            v-model="profileForm.fullName"
            type="text"
            required
            minlength="2"
            maxlength="100"
            class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Số điện thoại</label>
          <input
            v-model="profileForm.phone"
            type="tel"
            placeholder="0912345678"
            class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Email đăng nhập</label>
          <input
            :value="auth.user?.email"
            type="email"
            disabled
            class="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-500 cursor-not-allowed"
          />
          <span class="block text-[11px] text-slate-400 mt-1">Email tài khoản không thể thay đổi để bảo toàn lịch sử giao dịch.</span>
        </div>

        <div class="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
          <button
            type="button"
            @click="isEditProfileOpen = false"
            :disabled="isSavingProfile"
            class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="submit"
            :disabled="isSavingProfile"
            class="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white text-xs font-bold shadow-md shadow-brand-600/20 active:scale-98 transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Loader2 v-if="isSavingProfile" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ isSavingProfile ? 'Đang lưu...' : 'Lưu thay đổi' }}</span>
          </button>
        </div>
      </form>
    </Modal>

    <!-- Add / Edit Address Modal -->
    <AddressModal
      :isOpen="isAddressModalOpen"
      :addressToEdit="addressToEdit"
      :isSaving="addressStore.isSaving"
      @close="isAddressModalOpen = false"
      @save="handleSaveAddress"
    />

    <!-- Confirm Delete Address Modal -->
    <Modal :isOpen="isConfirmDeleteOpen" title="Xác nhận xóa địa chỉ" @close="isConfirmDeleteOpen = false">
      <div class="space-y-4">
        <p class="text-xs text-slate-600">
          Bạn có chắc chắn muốn xóa địa chỉ của
          <strong class="text-slate-900">{{ addressToDelete?.recipientName }}</strong>
          ({{ addressToDelete?.phone }}) tại
          <span class="text-slate-800">{{ addressToDelete?.streetAddress }}, {{ addressToDelete?.province }}</span>?
        </p>

        <p v-if="addressToDelete?.isDefault" class="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
          Lưu ý: Đây là địa chỉ mặc định của bạn. Khi xóa, hệ thống sẽ tự động chuyển địa chỉ còn lại làm mặc định mới.
        </p>

        <div class="pt-2 flex justify-end gap-2.5">
          <button
            type="button"
            @click="isConfirmDeleteOpen = false"
            class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            @click="handleDeleteAddress"
            class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition cursor-pointer"
          >
            Xác nhận xóa
          </button>
        </div>
      </div>
    </Modal>
  </DefaultLayout>
</template>
