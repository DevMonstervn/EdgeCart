<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminService } from '../services/admin.service.js';
import { useToastStore } from '../stores/toast.js';
import { useConfirmStore } from '../stores/confirm.js';
import type { SellerRequest } from '@edgecart/shared';
import AdminLayout from '../layouts/AdminLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
import Modal from '../components/Modal.vue';
import { formatDateTime, getSellerRequestStatusMeta } from '../utils/format.js';
import { ClipboardCheck, CheckCircle2, XCircle, Loader2 } from 'lucide-vue-next';

const toast = useToastStore();
const confirmModal = useConfirmStore();

const requests = ref<SellerRequest[]>([]);
const filterStatus = ref('PENDING');
const page = ref(1);
const totalPages = ref(1);
const isLoading = ref(true);
const error = ref<string | null>(null);
const isSubmitting = ref(false);

const selectedRequest = ref<SellerRequest | null>(null);
const isRejectModalOpen = ref(false);
const rejectionReason = ref('');

async function loadRequests() {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await adminService.getSellerRequests({
      status: filterStatus.value || undefined,
      page: page.value,
      limit: 15,
    });
    requests.value = res.requests;
    totalPages.value = res.meta?.totalPages || 1;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải danh sách hồ sơ mở cửa hàng';
  } finally {
    isLoading.value = false;
  }
}

async function handleApprove(req: SellerRequest) {
  if (isSubmitting.value) return;
  const confirmed = await confirmModal.ask({
    title: 'Xác nhận phê duyệt hồ sơ',
    message: `Bạn có chắc muốn phê duyệt và kích hoạt gian hàng "${req.storeName}" (@${req.storeSlug})?`,
    description: `Người gửi: ${req.userFullName || 'Người mua'} (${req.userEmail}). Cửa hàng sẽ được cấp quyền Người bán và mở bán công khai ngay lập tức.`,
    confirmText: 'Phê duyệt ngay',
    cancelText: 'Hủy bỏ',
    variant: 'success',
  });
  if (!confirmed) return;

  isSubmitting.value = true;
  try {
    await adminService.reviewSellerRequest(req.id, { status: 'APPROVED' });
    toast.success(`Đã phê duyệt và kích hoạt cửa hàng "${req.storeName}"!`);
    await loadRequests();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Phê duyệt yêu cầu thất bại');
  } finally {
    isSubmitting.value = false;
  }
}

function openRejectModal(req: SellerRequest) {
  selectedRequest.value = req;
  rejectionReason.value = '';
  isRejectModalOpen.value = true;
}

async function handleReject() {
  if (!selectedRequest.value || isSubmitting.value) return;
  if (rejectionReason.value.trim().length < 3) {
    toast.error('Vui lòng nhập lý do từ chối tối thiểu 3 ký tự');
    return;
  }

  isSubmitting.value = true;
  try {
    await adminService.reviewSellerRequest(selectedRequest.value.id, {
      status: 'REJECTED',
      rejectionReason: rejectionReason.value.trim(),
    });
    toast.success('Đã từ chối yêu cầu mở cửa hàng và gửi phản hồi cho người dùng');
    isRejectModalOpen.value = false;
    await loadRequests();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Từ chối yêu cầu thất bại');
  } finally {
    isSubmitting.value = false;
  }
}

function handleFilterChange() {
  page.value = 1;
  loadRequests();
}

function handlePageChange(newPage: number) {
  page.value = newPage;
  loadRequests();
}

onMounted(() => {
  loadRequests();
});
</script>

<template>
  <AdminLayout>
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Xét Duyệt Hồ Sơ Mở Cửa Hàng</h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
            Phê duyệt hoặc từ chối yêu cầu trở thành Người bán (chỉ dành cho Quản trị tối cao)
          </p>
        </div>

        <select
          v-model="filterStatus"
          @change="handleFilterChange"
          aria-label="Lọc theo trạng thái hồ sơ"
          class="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm focus:outline-none self-start sm:self-auto"
        >
          <option value="PENDING">Đang chờ duyệt (PENDING)</option>
          <option value="APPROVED">Đã phê duyệt (APPROVED)</option>
          <option value="REJECTED">Đã từ chối (REJECTED)</option>
          <option value="">Tất cả hồ sơ</option>
        </select>
      </div>

      <SkeletonLoader v-if="isLoading" type="table" :count="5" />

      <div
        v-else-if="error"
        class="p-6 bg-white rounded-2xl border border-rose-100 flex items-center justify-between gap-4"
      >
        <span class="text-xs sm:text-sm text-rose-600 font-medium">{{ error }}</span>
        <button @click="loadRequests" class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl">
          Thử lại
        </button>
      </div>

      <EmptyState
        v-else-if="requests.length === 0"
        :title="filterStatus === 'PENDING' ? 'Không có hồ sơ nào đang chờ duyệt' : 'Không có dữ liệu hồ sơ'"
        description="Khi người mua gửi đăng ký mở gian hàng mới, hồ sơ xét duyệt sẽ hiển thị tại đây."
        :actionText="filterStatus ? 'Xem tất cả lịch sử hồ sơ' : undefined"
        @action="filterStatus = ''; handleFilterChange()"
      >
        <template #icon>
          <ClipboardCheck class="w-8 h-8 text-slate-400 stroke-1" />
        </template>
      </EmptyState>

      <div v-else class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div
          tabindex="0"
          role="region"
          aria-label="Danh sách hồ sơ đăng ký mở cửa hàng"
          class="ec-table-region"
        >
          <table class="w-full text-left text-xs ec-stacked-table">
            <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
              <tr>
                <th class="px-5 py-3">Gian hàng đề xuất</th>
                <th class="px-5 py-3">Người đăng ký</th>
                <th class="px-5 py-3">Liên hệ</th>
                <th class="px-5 py-3">Mô tả / Phản hồi</th>
                <th class="px-5 py-3">Trạng thái</th>
                <th class="px-5 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
              <tr v-for="req in requests" :key="req.id" class="hover:bg-slate-50/50 transition">
                <th scope="row" class="px-5 py-3.5 font-bold text-slate-900 text-left">
                  <div>{{ req.storeName }}</div>
                  <div class="text-[11px] font-mono text-indigo-600 font-normal">/stores/{{ req.storeSlug }}</div>
                </th>
                <td data-label="Người gửi" class="px-5 py-3.5">
                  <div class="font-bold text-slate-800">{{ req.userFullName || 'Người mua' }}</div>
                  <div class="text-[11px] text-slate-400">{{ req.userEmail }}</div>
                </td>
                <td data-label="Liên hệ" class="px-5 py-3.5 text-slate-600">
                  <div>{{ req.phone || '—' }}</div>
                  <div class="text-[11px] text-slate-400">{{ req.businessEmail || '—' }}</div>
                </td>
                <td data-label="Chi tiết" class="px-5 py-3.5 max-w-xs">
                  <p v-if="req.storeDescription" class="line-clamp-2 text-slate-600">{{ req.storeDescription }}</p>
                  <p v-if="req.rejectionReason" class="text-[11px] text-rose-600 font-semibold mt-1">
                    Từ chối: {{ req.rejectionReason }}
                  </p>
                  <div class="text-[10px] text-slate-400 mt-1">{{ formatDateTime(req.createdAt) }}</div>
                </td>
                <td data-label="Trạng thái" class="px-5 py-3.5">
                  <span
                    class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                    :class="getSellerRequestStatusMeta(req.status).badgeClass"
                  >
                    {{ getSellerRequestStatusMeta(req.status).label }}
                  </span>
                </td>
                <td data-label="Xét duyệt" class="px-5 py-3.5 text-right">
                  <div v-if="req.status === 'PENDING'" class="inline-flex items-center gap-2 justify-end flex-wrap">
                    <button
                      @click="handleApprove(req)"
                      :disabled="isSubmitting"
                      class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-xs shadow-xs min-h-[38px] active:scale-95 transition cursor-pointer"
                    >
                      <CheckCircle2 class="w-4 h-4" />
                      <span>Duyệt</span>
                    </button>
                    <button
                      @click="openRejectModal(req)"
                      :disabled="isSubmitting"
                      class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-xs min-h-[38px] active:scale-95 transition cursor-pointer"
                    >
                      <XCircle class="w-4 h-4" />
                      <span>Từ chối</span>
                    </button>
                  </div>
                  <span v-else class="text-[11px] text-slate-400">
                    Đã xử lý {{ formatDateTime(req.reviewedAt) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Pagination :page="page" :totalPages="totalPages" @change="handlePageChange" />
    </div>

    <!-- Reject Reason Modal -->
    <Modal
      :isOpen="isRejectModalOpen"
      :title="`Từ chối hồ sơ: ${selectedRequest?.storeName || ''}`"
      @close="isRejectModalOpen = false"
    >
      <form @submit.prevent="handleReject" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">
            Lý do từ chối <span class="text-rose-500">*</span>
          </label>
          <span class="block text-[11px] text-slate-400 mb-1.5">
            Tối thiểu 3 ký tự — hiển thị trực tiếp cho người đăng ký để họ bổ sung và gửi lại hồ sơ.
          </span>
          <textarea
            v-model="rejectionReason"
            rows="3"
            required
            minlength="3"
            maxlength="500"
            placeholder="Ví dụ: Tên cửa hàng trùng thương hiệu đã bảo hộ hoặc thiếu số điện thoại xác minh..."
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
          ></textarea>
        </div>

        <div class="pt-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            @click="isRejectModalOpen = false"
            class="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
          >
            Hủy
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="inline-flex items-center gap-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold"
          >
            <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
            <span>Xác nhận từ chối</span>
          </button>
        </div>
      </form>
    </Modal>
  </AdminLayout>
</template>
