<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminService } from '../services/admin.service.js';
import { useToastStore } from '../stores/toast.js';
import type { Order, OrderStatus } from '@edgecart/shared';
import AdminLayout from '../layouts/AdminLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import Modal from '../components/Modal.vue';
import { ShoppingBag, Eye, Calendar, User, Phone, CheckCircle } from 'lucide-vue-next';

const toast = useToastStore();

const orders = ref<Order[]>([]);
const isLoading = ref(true);
const filterStatus = ref('');

const selectedOrder = ref<Order | null>(null);
const isUpdateStatusModalOpen = ref(false);
const newStatus = ref<OrderStatus>('CONFIRMED');
const statusNote = ref('');

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

async function loadOrders() {
  isLoading.value = true;
  try {
    const res = await adminService.getAdminOrders({
      status: filterStatus.value || undefined,
    });
    orders.value = res.orders;
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể tải danh sách đơn hàng');
  } finally {
    isLoading.value = false;
  }
}

function openStatusModal(order: Order) {
  selectedOrder.value = order;
  newStatus.value = order.shippingStatus;
  statusNote.value = '';
  isUpdateStatusModalOpen.value = true;
}

async function handleUpdateStatus() {
  if (!selectedOrder.value) return;

  try {
    await adminService.updateOrderStatus(selectedOrder.value.id, newStatus.value, statusNote.value);
    toast.success('Đã cập nhật trạng thái đơn hàng');
    isUpdateStatusModalOpen.value = false;
    await loadOrders();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Cập nhật trạng thái thất bại');
  }
}

onMounted(() => {
  loadOrders();
});
</script>

<template>
  <AdminLayout>
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Quản Lý Đơn Hàng</h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-0.5">Xử lý chu trình đặt hàng và bàn giao vận chuyển</p>
        </div>

        <!-- Filter Status Dropdown -->
        <select
          v-model="filterStatus"
          @change="loadOrders"
          class="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs focus:outline-hidden"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="PENDING">Chờ xác nhận</option>
          <option value="CONFIRMED">Đã xác nhận</option>
          <option value="PROCESSING">Đang chuẩn bị</option>
          <option value="SHIPPING">Đang giao hàng</option>
          <option value="DELIVERED">Giao thành công</option>
          <option value="CANCELLED">Đã hủy</option>
        </select>
      </div>

      <!-- Loading State -->
      <SkeletonLoader v-if="isLoading" type="table" :count="5" />

      <!-- Orders Table -->
      <div v-else class="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50/70 text-slate-500 uppercase text-[10px] font-bold">
              <tr>
                <th class="px-5 py-3">Mã đơn</th>
                <th class="px-5 py-3">Khách hàng</th>
                <th class="px-5 py-3">Ngày đặt</th>
                <th class="px-5 py-3">Thanh toán</th>
                <th class="px-5 py-3">Trạng thái</th>
                <th class="px-5 py-3 text-right">Tổng tiền</th>
                <th class="px-5 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
              <tr v-if="orders.length === 0">
                <td colspan="7" class="px-5 py-8 text-center text-slate-400">
                  Chưa có đơn hàng nào
                </td>
              </tr>
              <tr v-for="o in orders" :key="o.id" class="hover:bg-slate-50/50 transition">
                <td class="px-5 py-3.5 font-bold font-mono text-slate-900">#{{ o.orderNumber }}</td>
                <td class="px-5 py-3.5">
                  <div class="font-bold text-slate-900">{{ o.shippingName }}</div>
                  <div class="text-[11px] text-slate-400">{{ o.customerPhone }}</div>
                </td>
                <td class="px-5 py-3.5 text-slate-400">{{ formatDate(o.createdAt) }}</td>
                <td class="px-5 py-3.5">
                  <div class="font-semibold">{{ o.paymentMethod }}</div>
                  <span
                    class="text-[10px] font-bold"
                    :class="o.paymentStatus === 'PAID' ? 'text-emerald-600' : 'text-amber-600'"
                  >
                    {{ o.paymentStatus }}
                  </span>
                </td>
                <td class="px-5 py-3.5">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {{ o.shippingStatus }}
                  </span>
                </td>
                <td class="px-5 py-3.5 text-right font-black text-brand-700">
                  {{ formatVND(o.totalAmount) }}
                </td>
                <td class="px-5 py-3.5 text-right">
                  <button
                    @click="openStatusModal(o)"
                    class="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition"
                  >
                    Đổi trạng thái
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Update Status Modal -->
    <Modal
      :isOpen="isUpdateStatusModalOpen"
      :title="`Cập nhật trạng thái đơn #${selectedOrder?.orderNumber}`"
      @close="isUpdateStatusModalOpen = false"
    >
      <form @submit.prevent="handleUpdateStatus" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Trạng thái mới</label>
          <select
            v-model="newStatus"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
          >
            <option value="PENDING">Chờ xác nhận (PENDING)</option>
            <option value="CONFIRMED">Đã xác nhận (CONFIRMED)</option>
            <option value="PROCESSING">Đang chuẩn bị hàng (PROCESSING)</option>
            <option value="SHIPPING">Bàn giao vận chuyển (SHIPPING)</option>
            <option value="DELIVERED">Giao hàng thành công (DELIVERED)</option>
            <option value="CANCELLED">Hủy đơn hàng (CANCELLED)</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Ghi chú lịch sử</label>
          <input
            v-model="statusNote"
            type="text"
            placeholder="Lý do hoặc mã vận đơn..."
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
          />
        </div>

        <div class="pt-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            @click="isUpdateStatusModalOpen = false"
            class="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
          >
            Hủy
          </button>
          <button
            type="submit"
            class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700"
          >
            Cập nhật
          </button>
        </div>
      </form>
    </Modal>
  </AdminLayout>
</template>
