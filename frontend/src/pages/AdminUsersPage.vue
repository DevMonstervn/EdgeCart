<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminService } from '../services/admin.service.js';
import { useAuthStore } from '../stores/auth.js';
import { useToastStore } from '../stores/toast.js';
import type { User, UserStatus } from '@edgecart/shared';
import AdminLayout from '../layouts/AdminLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
import Modal from '../components/Modal.vue';
import {
  formatDateTime,
  getRoleBadgeClass,
  getRoleDisplayLabel,
  getUserStatusMeta,
} from '../utils/format.js';
import { Users, Search, Lock, ShieldCheck, Store, Loader2 } from 'lucide-vue-next';

const auth = useAuthStore();
const toast = useToastStore();

const users = ref<User[]>([]);
const searchQuery = ref('');
const filterRole = ref('');
const filterStatus = ref('');
const filterSeller = ref('');
const page = ref(1);
const totalPages = ref(1);
const isLoading = ref(true);
const error = ref<string | null>(null);
const isSubmitting = ref(false);

const selectedUser = ref<User | null>(null);
const isStatusModalOpen = ref(false);
const targetStatus = ref<UserStatus>('ACTIVE');
const statusReason = ref('');

const isRoleModalOpen = ref(false);
const targetRole = ref<'CUSTOMER' | 'PRODUCT_MANAGER' | 'ORDER_OPERATOR'>('CUSTOMER');
const roleReason = ref('');

async function loadUsers() {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await adminService.getUsers({
      q: searchQuery.value.trim() || undefined,
      role: filterRole.value || undefined,
      status: filterStatus.value || undefined,
      isSeller: filterSeller.value === 'true' ? true : filterSeller.value === 'false' ? false : undefined,
      page: page.value,
      limit: 15,
    });
    users.value = res.users;
    totalPages.value = res.meta?.totalPages || 1;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải danh sách người dùng';
  } finally {
    isLoading.value = false;
  }
}

function openStatusModal(u: User) {
  selectedUser.value = u;
  targetStatus.value = u.status;
  statusReason.value = '';
  isStatusModalOpen.value = true;
}

async function handleUpdateStatus() {
  if (!selectedUser.value || isSubmitting.value) return;

  isSubmitting.value = true;
  try {
    await adminService.updateUserStatus(selectedUser.value.id, {
      status: targetStatus.value,
      reason: statusReason.value.trim() || undefined,
    });
    toast.success(`Đã cập nhật trạng thái tài khoản "${selectedUser.value.email}"`);
    isStatusModalOpen.value = false;
    await loadUsers();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Cập nhật trạng thái tài khoản thất bại');
  } finally {
    isSubmitting.value = false;
  }
}

function openRoleModal(u: User) {
  selectedUser.value = u;
  if (u.role === 'PRODUCT_MANAGER' || u.role === 'ORDER_OPERATOR' || u.role === 'CUSTOMER') {
    targetRole.value = u.role;
  } else {
    targetRole.value = 'CUSTOMER';
  }
  roleReason.value = '';
  isRoleModalOpen.value = true;
}

async function handleUpdateRole() {
  if (!selectedUser.value || isSubmitting.value) return;

  isSubmitting.value = true;
  try {
    await adminService.updateUserRole(selectedUser.value.id, {
      role: targetRole.value,
      reason: roleReason.value.trim() || undefined,
    });
    toast.success(`Đã cập nhật vai trò cho "${selectedUser.value.email}"`);
    isRoleModalOpen.value = false;
    await loadUsers();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Cập nhật vai trò người dùng thất bại');
  } finally {
    isSubmitting.value = false;
  }
}

function handleSearch() {
  page.value = 1;
  loadUsers();
}

function handlePageChange(newPage: number) {
  page.value = newPage;
  loadUsers();
}

onMounted(() => {
  loadUsers();
});
</script>

<template>
  <AdminLayout>
    <div class="space-y-6">
      <div>
        <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Quản Lý Người Dùng & Phân Quyền</h2>
        <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
          Khóa / mở khóa tài khoản vi phạm và phân bổ vai trò vận hành nội bộ (chỉ dành cho Quản trị tối cao)
        </p>
      </div>

      <!-- Search & Filters -->
      <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div class="relative lg:col-span-2">
          <input
            v-model="searchQuery"
            @keyup.enter="handleSearch"
            type="text"
            placeholder="Tìm theo họ tên hoặc email..."
            class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
          />
          <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <select
          v-model="filterRole"
          @change="handleSearch"
          aria-label="Lọc theo vai trò"
          class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
        >
          <option value="">Tất cả vai trò</option>
          <option value="CUSTOMER">Người mua</option>
          <option value="PRODUCT_MANAGER">Quản lý sản phẩm</option>
          <option value="ORDER_OPERATOR">Vận hành đơn hàng</option>
          <option value="SUPER_ADMIN">Quản trị tối cao</option>
        </select>

        <select
          v-model="filterSeller"
          @change="handleSearch"
          aria-label="Lọc theo trạng thái người bán"
          class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
        >
          <option value="">Tất cả đối tượng</option>
          <option value="true">Đã là Người bán</option>
          <option value="false">Chưa là Người bán</option>
        </select>

        <div class="flex gap-2">
          <select
            v-model="filterStatus"
            @change="handleSearch"
            aria-label="Lọc theo trạng thái tài khoản"
            class="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
          >
            <option value="">Mọi trạng thái</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="INACTIVE">Tạm khóa</option>
            <option value="BANNED">Khóa vĩnh viễn</option>
          </select>
          <button
            @click="handleSearch"
            class="px-3.5 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition shrink-0"
          >
            Lọc
          </button>
        </div>
      </div>

      <SkeletonLoader v-if="isLoading" type="table" :count="6" />

      <div
        v-else-if="error"
        class="p-6 bg-white rounded-2xl border border-rose-100 flex items-center justify-between gap-4"
      >
        <span class="text-xs sm:text-sm text-rose-600 font-medium">{{ error }}</span>
        <button @click="loadUsers" class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl">
          Thử lại
        </button>
      </div>

      <EmptyState
        v-else-if="users.length === 0"
        title="Không tìm thấy người dùng phù hợp"
        description="Hãy thử thay đổi từ khóa hoặc điều kiện lọc vai trò / trạng thái."
      >
        <template #icon>
          <Users class="w-8 h-8 text-slate-400 stroke-1" />
        </template>
      </EmptyState>

      <div v-else class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div
          tabindex="0"
          role="region"
          aria-label="Danh sách tài khoản người dùng"
          class="ec-table-region"
        >
          <table class="w-full text-left text-xs ec-stacked-table">
            <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
              <tr>
                <th class="px-5 py-3">Tài khoản</th>
                <th class="px-5 py-3">Vai trò hiển thị</th>
                <th class="px-5 py-3">Ngày tham gia</th>
                <th class="px-5 py-3">Trạng thái</th>
                <th class="px-5 py-3 text-right">Quản trị</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
              <tr v-for="u in users" :key="u.id" class="hover:bg-slate-50/50 transition">
                <th scope="row" class="px-5 py-3.5 font-bold text-slate-900 text-left">
                  <div>{{ u.fullName }}</div>
                  <div class="text-[11px] font-normal text-slate-400">{{ u.email }}</div>
                </th>
                <td data-label="Vai trò" class="px-5 py-3.5">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                      :class="getRoleBadgeClass(u.role, u.isSeller)"
                    >
                      {{ getRoleDisplayLabel(u.role, u.isSeller) }}
                    </span>
                    <span
                      v-if="u.isSeller"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200"
                    >
                      <Store class="w-3 h-3" />
                      <span>Seller</span>
                    </span>
                  </div>
                </td>
                <td data-label="Tham gia" class="px-5 py-3.5 text-slate-400">
                  {{ formatDateTime(u.createdAt) }}
                </td>
                <td data-label="Trạng thái" class="px-5 py-3.5">
                  <span
                    class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                    :class="getUserStatusMeta(u.status).badgeClass"
                  >
                    {{ getUserStatusMeta(u.status).label }}
                  </span>
                </td>
                <td data-label="Thao tác" class="px-5 py-3.5 text-right space-x-1.5">
                  <template v-if="u.id !== auth.user?.id && u.role !== 'SUPER_ADMIN'">
                    <button
                      v-if="!u.isSeller"
                      @click="openRoleModal(u)"
                      class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition"
                    >
                      <ShieldCheck class="w-3.5 h-3.5" />
                      <span>Vai trò</span>
                    </button>
                    <button
                      @click="openStatusModal(u)"
                      class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition"
                    >
                      <Lock class="w-3.5 h-3.5" />
                      <span>Khóa / Mở</span>
                    </button>
                  </template>
                  <span v-else class="text-[11px] text-slate-400 italic">
                    {{ u.id === auth.user?.id ? 'Tài khoản của bạn' : 'Được bảo vệ' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Pagination :page="page" :totalPages="totalPages" @change="handlePageChange" />
    </div>

    <!-- Lock / Unlock Modal -->
    <Modal
      :isOpen="isStatusModalOpen"
      :title="`Trạng thái tài khoản: ${selectedUser?.email || ''}`"
      @close="isStatusModalOpen = false"
    >
      <form @submit.prevent="handleUpdateStatus" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Trạng thái truy cập</label>
          <select
            v-model="targetStatus"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
          >
            <option value="ACTIVE">Hoạt động bình thường (ACTIVE)</option>
            <option value="INACTIVE">Tạm khóa tài khoản (INACTIVE)</option>
            <option value="BANNED">Khóa vĩnh viễn & thu hồi phiên (BANNED)</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Lý do kiểm toán (Audit Log)</label>
          <input
            v-model="statusReason"
            type="text"
            maxlength="500"
            placeholder="Ghi chú lý do khóa hoặc mở khóa..."
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
            <span>Xác nhận</span>
          </button>
        </div>
      </form>
    </Modal>

    <!-- Role Assignment Modal -->
    <Modal
      :isOpen="isRoleModalOpen"
      :title="`Phân quyền vận hành: ${selectedUser?.email || ''}`"
      @close="isRoleModalOpen = false"
    >
      <form @submit.prevent="handleUpdateRole" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Vai trò trên hệ thống</label>
          <select
            v-model="targetRole"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
          >
            <option value="CUSTOMER">Người mua</option>
            <option value="PRODUCT_MANAGER">Quản lý sản phẩm (PRODUCT_MANAGER)</option>
            <option value="ORDER_OPERATOR">Vận hành đơn hàng (ORDER_OPERATOR)</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Ghi chú phân quyền</label>
          <input
            v-model="roleReason"
            type="text"
            maxlength="500"
            placeholder="Quyết định phân công nhân sự vận hành..."
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
          />
        </div>

        <div class="pt-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            @click="isRoleModalOpen = false"
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
            <span>Cập nhật vai trò</span>
          </button>
        </div>
      </form>
    </Modal>
  </AdminLayout>
</template>
