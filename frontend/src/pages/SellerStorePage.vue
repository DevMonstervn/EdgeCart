<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { sellerService } from '../services/seller.service.js';
import { useToastStore } from '../stores/toast.js';
import type { Store as StoreModel } from '@edgecart/shared';
import SellerLayout from '../layouts/SellerLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import SingleImageUploader from '../components/SingleImageUploader.vue';
import { getStoreStatusMeta, syncUserInvalidAria } from '../utils/format.js';
import { Store, ExternalLink, Save, Loader2, AlertCircle } from 'lucide-vue-next';

const toast = useToastStore();

const store = ref<StoreModel | null>(null);
const isLoading = ref(true);
const isSaving = ref(false);
const error = ref<string | null>(null);

const form = ref({
  name: '',
  description: '',
  logoUrl: '',
  bannerUrl: '',
  phone: '',
  email: '',
});

async function loadProfile() {
  isLoading.value = true;
  error.value = null;
  try {
    const data = await sellerService.getStoreProfile();
    store.value = data;
    form.value = {
      name: data.name || '',
      description: data.description || '',
      logoUrl: data.logoUrl || '',
      bannerUrl: data.bannerUrl || '',
      phone: data.phone || '',
      email: data.email || '',
    };
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải thông tin cửa hàng';
  } finally {
    isLoading.value = false;
  }
}

async function handleSave() {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    const updated = await sellerService.updateStoreProfile({
      name: form.value.name.trim(),
      description: form.value.description.trim() || null,
      logoUrl: form.value.logoUrl.trim() || '',
      bannerUrl: form.value.bannerUrl.trim() || '',
      phone: form.value.phone.trim() || '',
      email: form.value.email.trim() || '',
    });
    store.value = updated;
    toast.success('Đã cập nhật hồ sơ cửa hàng thành công!');
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Cập nhật hồ sơ cửa hàng thất bại');
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  loadProfile();
});
</script>

<template>
  <SellerLayout>
    <div class="max-w-4xl space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Hồ Sơ Cửa Hàng</h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
            Chỉnh sửa thương hiệu, ảnh đại diện và thông tin liên hệ hiển thị trên gian hàng công khai
          </p>
        </div>

        <RouterLink
          v-if="store?.slug"
          :to="`/stores/${store.slug}`"
          class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:border-brand-400 text-xs font-bold text-brand-700 transition self-start"
        >
          <span>Xem Gian hàng (/stores/{{ store.slug }})</span>
          <ExternalLink class="w-3.5 h-3.5" />
        </RouterLink>
      </div>

      <SkeletonLoader v-if="isLoading" type="table" :count="5" />

      <div
        v-else-if="error"
        class="p-6 bg-white rounded-2xl border border-rose-100 flex items-center justify-between gap-4"
      >
        <span class="text-xs sm:text-sm text-rose-600 font-medium">{{ error }}</span>
        <button @click="loadProfile" class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl">
          Thử lại
        </button>
      </div>

      <template v-else-if="store">
        <!-- Live Banner & Avatar Preview -->
        <div class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="h-32 sm:h-40 bg-gradient-to-r from-brand-800 to-teal-500 relative overflow-hidden">
            <img
              v-if="form.bannerUrl"
              :src="form.bannerUrl"
              alt="Xem trước ảnh bìa"
              class="w-full h-full object-cover"
            />
          </div>
          <div class="px-6 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-8 relative z-10">
            <div class="flex items-end gap-3.5">
              <div class="w-16 h-16 rounded-2xl bg-white p-1 shadow-md border border-slate-100">
                <div class="w-full h-full rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center overflow-hidden">
                  <img v-if="form.logoUrl" :src="form.logoUrl" alt="Logo cửa hàng" class="w-full h-full object-cover" />
                  <Store v-else class="w-7 h-7" />
                </div>
              </div>
              <div>
                <h3 class="text-base font-black text-slate-900">{{ form.name || store.name }}</h3>
                <span class="text-xs font-mono text-slate-400">/stores/{{ store.slug }}</span>
              </div>
            </div>

            <span
              class="px-3 py-1 rounded-full text-xs font-bold border self-start sm:self-center"
              :class="getStoreStatusMeta(store.status).badgeClass"
            >
              {{ getStoreStatusMeta(store.status).label }}
            </span>
          </div>
        </div>

        <!-- Edit Form -->
        <form
          @submit.prevent="handleSave"
          @blur.capture="syncUserInvalidAria"
          @input="syncUserInvalidAria"
          class="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-8 space-y-5"
        >
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div class="ec-field">
              <label for="seller-store-name" class="block text-xs font-bold text-slate-700 mb-1">
                Tên cửa hàng <span class="text-rose-500">*</span>
              </label>
              <span id="seller-name-hint" class="block text-[11px] text-slate-400 mb-1.5">
                Từ 2–100 ký tự.
              </span>
              <input
                id="seller-store-name"
                v-model="form.name"
                type="text"
                required
                minlength="2"
                maxlength="100"
                aria-describedby="seller-name-hint"
                class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:border-brand-500"
              />
              <div class="ec-error-msg items-center gap-1 text-[11px] text-rose-600 font-semibold mt-1">
                <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                <span>Tên cửa hàng phải từ 2–100 ký tự.</span>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Slug định danh (Cố định)</label>
              <span class="block text-[11px] text-slate-400 mb-1.5">
                Đường dẫn cố định để bảo toàn liên kết SEO gian hàng.
              </span>
              <input
                :value="`/stores/${store.slug}`"
                type="text"
                disabled
                class="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          <!-- Store Media (Logo & Banner) -->
          <div class="border-t border-slate-100 pt-5 space-y-6">
            <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Hình ảnh gian hàng</h4>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <!-- Store Logo -->
              <SingleImageUploader
                v-model="form.logoUrl"
                folder="stores"
                shape="square"
                label="Logo đại diện gian hàng"
                hint="Khuyến nghị tỷ lệ vuông 1:1, tối thiểu 200x200px"
              />

              <!-- Store Phone & Support -->
              <div class="space-y-4">
                <div class="ec-field">
                  <label for="seller-phone" class="block text-xs font-bold text-slate-700 mb-1">Số điện thoại CSKH</label>
                  <span id="seller-phone-hint" class="block text-[11px] text-slate-400 mb-1.5">
                    Định dạng: 09xxxxxxxx hoặc +849xxxxxxxx
                  </span>
                  <input
                    id="seller-phone"
                    v-model="form.phone"
                    type="tel"
                    pattern="(0|\+84)[35789][0-9]{8}"
                    aria-describedby="seller-phone-hint"
                    placeholder="0912345678"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:border-brand-500"
                  />
                  <div class="ec-error-msg items-center gap-1 text-[11px] text-rose-600 font-semibold mt-1">
                    <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                    <span>Số điện thoại không hợp lệ.</span>
                  </div>
                </div>

                <div class="ec-field">
                  <label for="seller-email" class="block text-xs font-bold text-slate-700 mb-1">Email liên hệ công khai</label>
                  <span id="seller-email-hint" class="block text-[11px] text-slate-400 mb-1.5">
                    Hiển thị trên trang gian hàng cho khách mua.
                  </span>
                  <input
                    id="seller-email"
                    v-model="form.email"
                    type="email"
                    aria-describedby="seller-email-hint"
                    placeholder="cskh@shop.vn"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:border-brand-500"
                  />
                  <div class="ec-error-msg items-center gap-1 text-[11px] text-rose-600 font-semibold mt-1">
                    <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                    <span>Địa chỉ email không đúng định dạng.</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Store Banner -->
            <SingleImageUploader
              v-model="form.bannerUrl"
              folder="stores"
              shape="banner"
              label="Ảnh bìa gian hàng (Banner)"
              hint="Ảnh nền hiển thị trên đầu trang gian hàng công khai (khuyến nghị tỷ lệ 16:5)"
            />
          </div>

          <div>
            <label for="seller-desc" class="block text-xs font-bold text-slate-700 mb-1">Mô tả giới thiệu cửa hàng</label>
            <textarea
              id="seller-desc"
              v-model="form.description"
              rows="3"
              maxlength="1000"
              placeholder="Giới thiệu câu chuyện thương hiệu, chính sách bảo hành & hỗ trợ khách hàng..."
              class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:border-brand-500"
            ></textarea>
          </div>

          <div class="pt-3 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              :disabled="isSaving"
              class="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-bold shadow-sm transition"
            >
              <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
              <Save v-else class="w-4 h-4" />
              <span>{{ isSaving ? 'Đang lưu...' : 'Lưu thay đổi' }}</span>
            </button>
          </div>
        </form>
      </template>
    </div>
  </SellerLayout>
</template>
