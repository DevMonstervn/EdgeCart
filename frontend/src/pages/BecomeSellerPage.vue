<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useToastStore } from '../stores/toast.js';
import { storeService } from '../services/store.service.js';
import type { SellerRequest, Store as StoreModel } from '@edgecart/shared';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import {
  formatDateTime,
  getSellerRequestStatusMeta,
  getStoreStatusMeta,
  slugifyVietnamese,
  syncUserInvalidAria,
} from '../utils/format.js';
import {
  Store,
  Sparkles,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  Loader2,
} from 'lucide-vue-next';

const auth = useAuthStore();
const toast = useToastStore();

const myStore = ref<StoreModel | null>(null);
const requests = ref<SellerRequest[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);
const isSubmitting = ref(false);
const showReapplyForm = ref(false);

const form = ref({
  storeName: '',
  storeSlug: '',
  storeDescription: '',
  phone: '',
  businessEmail: '',
});
const isSlugManuallyEdited = ref(false);

const latestRequest = computed<SellerRequest | null>(() => {
  return requests.value.length > 0 ? requests.value[0] : null;
});

const hasPendingRequest = computed(() => latestRequest.value?.status === 'PENDING');
const isApprovedSeller = computed(() => Boolean(myStore.value) || auth.isSeller || latestRequest.value?.status === 'APPROVED');

const shouldShowForm = computed(() => {
  if (isApprovedSeller.value || hasPendingRequest.value) return false;
  if (!latestRequest.value) return true;
  return latestRequest.value.status === 'REJECTED' && showReapplyForm.value;
});

function handleStoreNameInput() {
  if (!isSlugManuallyEdited.value) {
    form.value.storeSlug = slugifyVietnamese(form.value.storeName);
  }
}

function handleSlugInput() {
  isSlugManuallyEdited.value = true;
  form.value.storeSlug = form.value.storeSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function loadStatus() {
  isLoading.value = true;
  error.value = null;
  try {
    const [, data] = await Promise.all([auth.fetchProfile(), storeService.getMySellerRequests()]);
    myStore.value = data.store;
    requests.value = data.requests;

    if (!form.value.phone && auth.user?.phone) {
      form.value.phone = auth.user.phone;
    }
    if (!form.value.businessEmail && auth.user?.email) {
      form.value.businessEmail = auth.user.email;
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải trạng thái hồ sơ bán hàng';
  } finally {
    isLoading.value = false;
  }
}

function startReapply() {
  if (latestRequest.value) {
    form.value.storeName = latestRequest.value.storeName;
    form.value.storeSlug = latestRequest.value.storeSlug;
    form.value.storeDescription = latestRequest.value.storeDescription || '';
    form.value.phone = latestRequest.value.phone || auth.user?.phone || '';
    form.value.businessEmail = latestRequest.value.businessEmail || auth.user?.email || '';
    isSlugManuallyEdited.value = true;
  }
  showReapplyForm.value = true;
}

async function handleSubmit() {
  if (isSubmitting.value) return;

  isSubmitting.value = true;
  try {
    await storeService.submitSellerRequest({
      storeName: form.value.storeName.trim(),
      storeSlug: form.value.storeSlug.trim().toLowerCase(),
      storeDescription: form.value.storeDescription.trim() || '',
      phone: form.value.phone.trim() || '',
      businessEmail: form.value.businessEmail.trim() || '',
    });
    toast.success('Đã gửi hồ sơ đăng ký mở cửa hàng thành công! Vui lòng chờ Quản trị viên xét duyệt.');
    showReapplyForm.value = false;
    await loadStatus();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể gửi yêu cầu mở cửa hàng');
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(() => {
  loadStatus();
});
</script>

<template>
  <DefaultLayout>
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8">
      <!-- Page Hero -->
      <div class="bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div class="relative z-10 max-w-2xl space-y-2">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/20 text-brand-300 text-xs font-bold border border-brand-400/30">
            <Sparkles class="w-3.5 h-3.5" />
            <span>EdgeCart Marketplace</span>
          </span>
          <h1 class="text-2xl sm:text-3xl font-black tracking-tight">Đăng Ký Bán Hàng Trên EdgeCart</h1>
          <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Mở gian hàng chính thức, quản lý danh mục sản phẩm, tồn kho thời gian thực và xử lý đơn hàng ngay trên mạng lưới biên Cloudflare.
          </p>
        </div>
      </div>

      <!-- Loading State -->
      <SkeletonLoader v-if="isLoading" type="table" :count="4" />

      <!-- Error State -->
      <div
        v-else-if="error"
        class="p-6 bg-white rounded-3xl border border-rose-100 flex flex-col sm:flex-row items-center justify-between gap-4"
      >
        <div class="flex items-center gap-3 text-rose-700 text-xs sm:text-sm font-medium">
          <AlertCircle class="w-5 h-5 shrink-0 text-rose-500" />
          <span>{{ error }}</span>
        </div>
        <button
          @click="loadStatus"
          class="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition shrink-0"
        >
          Thử lại
        </button>
      </div>

      <template v-else>
        <!-- 1. APPROVED STORE CARD -->
        <div
          v-if="isApprovedSeller"
          class="bg-white rounded-3xl border border-emerald-200 p-6 sm:p-8 shadow-sm space-y-5"
        >
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 class="w-6 h-6" />
              </div>
              <div>
                <h2 class="text-lg font-black text-slate-900">Tài khoản Người bán đã được kích hoạt!</h2>
                <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Hồ sơ mở cửa hàng của bạn đã được phê duyệt. Bạn có thể quản lý sản phẩm, tồn kho và đơn hàng ngay.
                </p>
              </div>
            </div>

            <span
              v-if="myStore"
              class="px-3 py-1 rounded-full text-xs font-bold border self-start sm:self-center"
              :class="getStoreStatusMeta(myStore.status).badgeClass"
            >
              {{ getStoreStatusMeta(myStore.status).label }}
            </span>
          </div>

          <div v-if="myStore" class="p-4 rounded-2xl bg-slate-50 border border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <div class="text-slate-400 font-medium">Tên cửa hàng</div>
              <div class="font-bold text-slate-900 text-sm mt-0.5">{{ myStore.name }}</div>
            </div>
            <div>
              <div class="text-slate-400 font-medium">Đường dẫn gian hàng</div>
              <div class="font-mono font-semibold text-brand-700 mt-0.5">/stores/{{ myStore.slug }}</div>
            </div>
            <div>
              <div class="text-slate-400 font-medium">Ngày kích hoạt</div>
              <div class="font-semibold text-slate-700 mt-0.5">{{ formatDateTime(myStore.createdAt) }}</div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3 pt-1">
            <RouterLink
              to="/seller"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold shadow-sm transition"
            >
              <Store class="w-4 h-4" />
              <span>Vào Kênh Người Bán</span>
              <ArrowRight class="w-4 h-4" />
            </RouterLink>

            <RouterLink
              v-if="myStore?.slug"
              :to="`/stores/${myStore.slug}`"
              class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition"
            >
              <span>Xem Gian hàng công khai</span>
              <ExternalLink class="w-3.5 h-3.5" />
            </RouterLink>
          </div>
        </div>

        <!-- 2. PENDING REQUEST CARD -->
        <div
          v-else-if="hasPendingRequest && latestRequest"
          class="bg-white rounded-3xl border border-amber-200 p-6 sm:p-8 shadow-sm space-y-5"
        >
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Clock class="w-6 h-6" />
              </div>
              <div>
                <h2 class="text-lg font-black text-slate-900">Hồ sơ của bạn đang chờ xét duyệt</h2>
                <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Quản trị viên hệ thống sẽ kiểm tra thông tin cửa hàng và phản hồi trong thời gian sớm nhất.
                </p>
              </div>
            </div>

            <button
              @click="loadStatus"
              class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 transition self-start"
            >
              <RefreshCw class="w-3.5 h-3.5" />
              <span>Làm mới trạng thái</span>
            </button>
          </div>

          <div class="p-4 rounded-2xl bg-amber-50/40 border border-amber-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span class="text-slate-400">Tên cửa hàng đăng ký:</span>
              <div class="font-bold text-slate-900 text-sm mt-0.5">{{ latestRequest.storeName }}</div>
            </div>
            <div>
              <span class="text-slate-400">Slug dự kiến:</span>
              <div class="font-mono font-semibold text-slate-800 mt-0.5">/stores/{{ latestRequest.storeSlug }}</div>
            </div>
            <div>
              <span class="text-slate-400">Liên hệ:</span>
              <div class="font-semibold text-slate-700 mt-0.5">
                {{ latestRequest.phone || '—' }} • {{ latestRequest.businessEmail || auth.user?.email }}
              </div>
            </div>
            <div>
              <span class="text-slate-400">Thời gian gửi:</span>
              <div class="font-semibold text-slate-700 mt-0.5">{{ formatDateTime(latestRequest.createdAt) }}</div>
            </div>
            <div v-if="latestRequest.storeDescription" class="sm:col-span-2">
              <span class="text-slate-400">Mô tả gian hàng:</span>
              <p class="text-slate-700 mt-0.5 leading-relaxed">{{ latestRequest.storeDescription }}</p>
            </div>
          </div>
        </div>

        <!-- 3. REJECTED REQUEST BANNER -->
        <div
          v-else-if="latestRequest?.status === 'REJECTED'"
          class="bg-white rounded-3xl border border-rose-200 p-6 sm:p-8 shadow-sm space-y-4"
        >
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <XCircle class="w-6 h-6" />
            </div>
            <div class="flex-1">
              <h2 class="text-lg font-black text-slate-900">Yêu cầu gần nhất chưa được phê duyệt</h2>
              <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
                Hồ sơ mở cửa hàng <strong>{{ latestRequest.storeName }}</strong> đã bị từ chối vào {{ formatDateTime(latestRequest.reviewedAt || latestRequest.updatedAt) }}.
              </p>
              <div class="mt-3 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <strong>Lý do từ chối:</strong> {{ latestRequest.rejectionReason || 'Thông tin hồ sơ chưa đáp ứng điều kiện mở gian hàng.' }}
              </div>
            </div>
          </div>

          <div v-if="!showReapplyForm" class="pt-1">
            <button
              @click="startReapply"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold shadow-sm transition"
            >
              <span>Chỉnh sửa & Gửi lại hồ sơ mới</span>
              <ArrowRight class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- 4. SELLER APPLICATION FORM -->
        <div
          v-if="shouldShowForm"
          class="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-sm"
        >
          <div class="mb-6 pb-4 border-b border-slate-100">
            <h2 class="text-lg font-black text-slate-900">Thông Tin Đăng Ký Mở Gian Hàng</h2>
            <p class="text-xs text-slate-500 mt-1">
              Điền thông tin cửa hàng của bạn. Tài khoản Người mua hiện tại vẫn giữ nguyên quyền mua sắm bình thường.
            </p>
          </div>

          <form
            @submit.prevent="handleSubmit"
            @blur.capture="syncUserInvalidAria"
            @input="syncUserInvalidAria"
            class="space-y-5"
          >
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <!-- Store Name -->
              <div class="ec-field">
                <label for="store-name" class="block text-xs font-bold text-slate-700 mb-1">
                  Tên cửa hàng <span class="text-rose-500">*</span>
                </label>
                <span id="store-name-hint" class="block text-[11px] text-slate-400 mb-1.5">
                  Từ 2–100 ký tự, hiển thị công khai với khách mua.
                </span>
                <input
                  id="store-name"
                  v-model="form.storeName"
                  @input="handleStoreNameInput"
                  type="text"
                  required
                  minlength="2"
                  maxlength="100"
                  aria-describedby="store-name-hint"
                  placeholder="Ví dụ: TechZone Official"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:border-brand-500 transition"
                />
                <div class="ec-error-msg items-center gap-1 text-[11px] text-rose-600 font-semibold mt-1">
                  <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                  <span>Tên cửa hàng phải từ 2 đến 100 ký tự.</span>
                </div>
              </div>

              <!-- Store Slug -->
              <div class="ec-field">
                <label for="store-slug" class="block text-xs font-bold text-slate-700 mb-1">
                  Đường dẫn định danh (Slug) <span class="text-rose-500">*</span>
                </label>
                <span id="store-slug-hint" class="block text-[11px] text-slate-400 mb-1.5">
                  Chỉ dùng chữ thường a-z, số 0-9 và dấu gạch ngang (ví dụ: techzone-vn).
                </span>
                <input
                  id="store-slug"
                  v-model="form.storeSlug"
                  @input="handleSlugInput"
                  type="text"
                  required
                  minlength="2"
                  maxlength="100"
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  aria-describedby="store-slug-hint"
                  placeholder="techzone-official"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:bg-white focus:outline-none focus:border-brand-500 transition"
                />
                <div class="ec-error-msg items-center gap-1 text-[11px] text-rose-600 font-semibold mt-1">
                  <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                  <span>Slug chỉ gồm chữ thường, chữ số và dấu gạch ngang đơn.</span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <!-- Phone -->
              <div class="ec-field">
                <label for="store-phone" class="block text-xs font-bold text-slate-700 mb-1">
                  Số điện thoại liên hệ Shop
                </label>
                <span id="store-phone-hint" class="block text-[11px] text-slate-400 mb-1.5">
                  Định dạng số di động Việt Nam: 09xxxxxxxx hoặc +849xxxxxxxx.
                </span>
                <input
                  id="store-phone"
                  v-model="form.phone"
                  type="tel"
                  pattern="(0|\+84)[35789][0-9]{8}"
                  aria-describedby="store-phone-hint"
                  placeholder="0912345678"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:border-brand-500 transition"
                />
                <div class="ec-error-msg items-center gap-1 text-[11px] text-rose-600 font-semibold mt-1">
                  <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                  <span>Số điện thoại không đúng định dạng Việt Nam.</span>
                </div>
              </div>

              <!-- Business Email -->
              <div class="ec-field">
                <label for="store-email" class="block text-xs font-bold text-slate-700 mb-1">
                  Email kinh doanh
                </label>
                <span id="store-email-hint" class="block text-[11px] text-slate-400 mb-1.5">
                  Định dạng: contact@ten-cua-hang.vn
                </span>
                <input
                  id="store-email"
                  v-model="form.businessEmail"
                  type="email"
                  autocomplete="email"
                  aria-describedby="store-email-hint"
                  placeholder="shop@example.com"
                  class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:border-brand-500 transition"
                />
                <div class="ec-error-msg items-center gap-1 text-[11px] text-rose-600 font-semibold mt-1">
                  <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                  <span>Vui lòng nhập địa chỉ email hợp lệ.</span>
                </div>
              </div>
            </div>

            <!-- Description -->
            <div class="ec-field">
              <label for="store-desc" class="block text-xs font-bold text-slate-700 mb-1">
                Giới thiệu ngành hàng & cam kết chất lượng
              </label>
              <span id="store-desc-hint" class="block text-[11px] text-slate-400 mb-1.5">
                Tối đa 1000 ký tự — giúp Quản trị viên xét duyệt hồ sơ nhanh hơn.
              </span>
              <textarea
                id="store-desc"
                v-model="form.storeDescription"
                rows="3"
                maxlength="1000"
                aria-describedby="store-desc-hint"
                placeholder="Mô tả các dòng sản phẩm chính, nguồn gốc xuất xứ và chính sách bảo hành của cửa hàng..."
                class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:border-brand-500 transition"
              ></textarea>
            </div>

            <div class="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                v-if="showReapplyForm"
                type="button"
                @click="showReapplyForm = false"
                class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                Hủy
              </button>
              <button
                type="submit"
                :disabled="isSubmitting"
                class="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-bold shadow-sm transition"
              >
                <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
                <span>{{ isSubmitting ? 'Đang gửi hồ sơ...' : 'Gửi yêu cầu mở cửa hàng' }}</span>
              </button>
            </div>
          </form>
        </div>

        <!-- 5. APPLICATION HISTORY TABLE -->
        <div v-if="requests.length > 0" class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="p-5 border-b border-slate-100">
            <h3 class="text-sm font-bold text-slate-900">Lịch sử gửi yêu cầu mở cửa hàng</h3>
          </div>

          <div
            tabindex="0"
            role="region"
            aria-label="Lịch sử yêu cầu mở cửa hàng"
            class="ec-table-region"
          >
            <table class="w-full text-left text-xs ec-stacked-table">
              <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
                <tr>
                  <th class="px-5 py-3">Cửa hàng</th>
                  <th class="px-5 py-3">Slug</th>
                  <th class="px-5 py-3">Ngày gửi</th>
                  <th class="px-5 py-3">Trạng thái</th>
                  <th class="px-5 py-3">Ghi chú xét duyệt</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 text-slate-700">
                <tr v-for="req in requests" :key="req.id" class="hover:bg-slate-50/50 transition">
                  <th scope="row" class="px-5 py-3.5 font-bold text-slate-900 text-left">{{ req.storeName }}</th>
                  <td data-label="Slug" class="px-5 py-3.5 font-mono text-slate-500">{{ req.storeSlug }}</td>
                  <td data-label="Ngày gửi" class="px-5 py-3.5 text-slate-500">{{ formatDateTime(req.createdAt) }}</td>
                  <td data-label="Trạng thái" class="px-5 py-3.5">
                    <span
                      class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                      :class="getSellerRequestStatusMeta(req.status).badgeClass"
                    >
                      {{ getSellerRequestStatusMeta(req.status).label }}
                    </span>
                  </td>
                  <td data-label="Phản hồi" class="px-5 py-3.5 text-slate-500 max-w-xs">
                    {{ req.rejectionReason || (req.status === 'APPROVED' ? 'Đã tạo cửa hàng thành công' : 'Đang chờ duyệt') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  </DefaultLayout>
</template>
