<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminService, type AdminStoreItem } from '../services/admin.service.js';
import { useAuthStore } from '../stores/auth.js';
import { useToastStore } from '../stores/toast.js';
import type { StoreStatus } from '@edgecart/shared';
import AdminLayout from '../layouts/AdminLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
import Modal from '../components/Modal.vue';
import { formatDateTime, getStoreStatusMeta } from '../utils/format.js';
import { Store, Search, ExternalLink, Settings2, Loader2 } from 'lucide-vue-next';

const auth = useAuthStore();
const toast = useToastStore();

const stores = ref<AdminStoreItem[]>([]);
const searchQuery = ref('');
const filterStatus = ref('');
const page = ref(1);
const totalPages = ref(1);
const isLoading = ref(true);
const error = ref<string | null>(null);
const isSubmitting = ref(false);

const selectedStore = ref<AdminStoreItem | null>(null);
const isStatusModalOpen = ref(false);
const targetStatus = ref<StoreStatus>('ACTIVE');
const statusReason = ref('');

async function loadStores() {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await adminService.getStores({
      q: searchQuery.value.trim() || undefined,
      status: filterStatus.value || undefined,
      page: page.value,
      limit: 15,
    });
    stores.value = res.stores;
    totalPages.value = res.meta?.totalPages || 1;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải danh sách cửa hàng';
  } finally {
    isLoading.value = false;
  }
}

function openStatusModal(s: AdminStoreItem) {
  selectedStore.value = s;
  targetStatus.value = s.status;
  statusReason.value = '';
  isStatusModalOpen.value = true;
}

async function handleUpdateStatus() {
  if (!selectedStore.value || isSubmitting.value) return;

  isSubmitting.value = true;
  try {
    await adminService.updateStoreStatus(selectedStore.value.id, {
      status: targetStatus.value,
      reason: statusReason.value.trim() || undefined,
    });
    toast.success(`Đã cập nhật trạng thái cửa hàng "${selectedStore.value.name}"`);
    isStatusModalOpen.value = false;
    await loadStores();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Cập nhật trạng thái cửa hàng thất bại');
  } finally {
    isSubmitting.value = false;
  }
}

function handleSearch() {
  page.value = 1;
  loadStores();
}

function handlePageChange(newPage: number) {
  page.value = newPage;
  loadStores();
}

onMounted(() => {
  loadStores();
});
</script>

<template>
  <AdminLayout>
    <div class="space-y-6">
      <div>
        <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Quản Lý Gian Hàng Đối Tác</h2>
        <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
          <span v-if="auth.isSuperAdmin">
            Giám sát hoạt động và điều chỉnh trạng thái mở bán / đình chỉ gian hàng trên sàn
          </span>
          <span v-else>
            Tra cứu danh bạ cửa hàng đối tác (chế độ xem dành cho {{ auth.roleLabel }})
          </span>
        </p>
      </div>

      <!-- Search & Filter -->
      <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-3">
        <div class="relative flex-1">
          <input
            v-model="searchQuery"
            @keyup.enter="handleSearch"
            type="text"
            placeholder="Tìm theo tên cửa hàng, slug hoặc email chủ shop..."
            class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
          />
          <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <select
          v-model="filterStatus"
          @change="handleSearch"
          aria-label="Lọc theo trạng thái cửa hàng"
          class="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hoạt động (ACTIVE)</option>
          <option value="INACTIVE">Tạm nghỉ (INACTIVE)</option>
          <option value="SUSPENDED">Đình chỉ (SUSPENDED)</option>
        </select>

        <button
          @click="handleSearch"
          class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition"
        >
          Tìm kiếm
        </button>
      </div>

      <SkeletonLoader v-if="isLoading" type="table" :count="5" />

      <div
        v-else-if="error"
        class="p-6 bg-white rounded-2xl border border-rose-100 flex items-center justify-between gap-4"
      >
        <span class="text-xs sm:text-sm text-rose-600 font-medium">{{ error }}</span>
        <button @click="loadStores" class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl">
          Thử lại
        </button>
      </div>

      <EmptyState
        v-else-if="stores.length === 0"
        title="Chưa có cửa hàng đối tác nào"
        description="Danh sách các gian hàng sau khi được xét duyệt sẽ xuất hiện tại đây."
      >
        <template #icon>
          <Store class="w-8 h-8 text-slate-400 stroke-1" />
        </template>
      </EmptyState>

      <div v-else class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div
          tabindex="0"
          role="region"
          aria-label="Danh sách gian hàng đối tác"
          class="ec-table-region"
        >
          <table class="w-full text-left text-xs ec-stacked-table">
            <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
              <tr>
                <th class="px-5 py-3">Cửa hàng</th>
                <th class="px-5 py-3">Chủ sở hữu</th>
                <th class="px-5 py-3">Sản phẩm</th>
                <th class="px-5 py-3">Ngày tạo</th>
                <th class="px-5 py-3">Trạng thái</th>
                <th class="px-5 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
              <tr v-for="s in stores" :key="s.id" class="hover:bg-slate-50/50 transition">
                <th scope="row" class="px-5 py-3.5 font-bold text-slate-900 text-left">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center overflow-hidden shrink-0">
                      <img v-if="s.logoUrl" :src="s.logoUrl" :alt="s.name" class="w-full h-full object-cover" />
                      <Store v-else class="w-4 h-4" />
                    </div>
                    <div>
                      <div>{{ s.name }}</div>
                      <div class="text-[11px] font-mono text-slate-400 font-normal">/stores/{{ s.slug }}</div>
                    </div>
                  </div>
                </th>
                <td data-label="Chủ shop" class="px-5 py-3.5">
                  <div class="font-bold text-slate-800">{{ s.ownerFullName }}</div>
                  <div class="text-[11px] text-slate-400">{{ s.ownerEmail }}</div>
                </td>
                <td data-label="Sản phẩm" class="px-5 py-3.5 font-bold text-slate-800">
                  {{ s.productCount }} SP
                </td>
                <td data-label="Ngày tạo" class="px-5 py-3.5 text-slate-400">
                  {{ formatDateTime(s.createdAt) }}
                </td>
                <td data-label="Trạng thái" class="px-5 py-3.5">
                  <span
                    class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                    :class="getStoreStatusMeta(s.status).badgeClass"
                  >
                    {{ getStoreStatusMeta(s.status).label }}
                  </span>
                </td>
                <td data-label="Thao tác" class="px-5 py-3.5 text-right space-x-1.5">
                  <RouterLink
                    v-if="s.status === 'ACTIVE'"
                    :to="`/stores/${s.slug}`"
                    class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition"
                  >
                    <span>Xem</span>
                    <ExternalLink class="w-3 h-3" />
                  </RouterLink>
                  <button
                    v-if="auth.isSuperAdmin"
                    @click="openStatusModal(s)"
                    class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition"
                  >
                    <Settings2 class="w-3.5 h-3.5" />
                    <span>Trạng thái</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Pagination :page="page" :totalPages="totalPages" @change="handlePageChange" />
    </div>

    <!-- Store Status Modal (SUPER_ADMIN only) -->
    <Modal
      :isOpen="isStatusModalOpen"
      :title="`Cập nhật trạng thái: ${selectedStore?.name || ''}`"
      @close="isStatusModalOpen = false"
    >
      <form @submit.prevent="handleUpdateStatus" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Trạng thái hoạt động</label>
          <select
            v-model="targetStatus"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
          >
            <option value="ACTIVE">Đang hoạt động — hiển thị công khai (ACTIVE)</option>
            <option value="INACTIVE">Tạm nghỉ — ẩn khỏi storefront (INACTIVE)</option>
            <option value="SUSPENDED">Đình chỉ vi phạm — khóa quyền bán hàng (SUSPENDED)</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Ghi chú kiểm toán (Audit Log)</label>
          <input
            v-model="statusReason"
            type="text"
            maxlength="500"
            placeholder="Lý do thay đổi trạng thái cửa hàng..."
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
          />
        </div>

        <div class="pt-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            @click="isStatusModalOpen = false"
            class="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
          >
            Hủy
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold"
          >
            <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
            <span>Lưu trạng thái</span>
          </button>
        </div>
      </form>
    </Modal>
  </AdminLayout>
</template>
