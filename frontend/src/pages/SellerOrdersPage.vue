<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { sellerService, type SellerOrder } from '../services/seller.service.js';
import { useToastStore } from '../stores/toast.js';
import type { OrderStatus } from '@edgecart/shared';
import SellerLayout from '../layouts/SellerLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
import Modal from '../components/Modal.vue';
import { formatDateTime, formatVND, getOrderStatusMeta } from '../utils/format.js';
import { ShoppingBag, Eye, Truck, Loader2 } from 'lucide-vue-next';

const toast = useToastStore();

const orders = ref<SellerOrder[]>([]);
const page = ref(1);
const totalPages = ref(1);
const filterStatus = ref('');
const isLoading = ref(true);
const error = ref<string | null>(null);

const selectedOrder = ref<SellerOrder | null>(null);
const isDetailModalOpen = ref(false);
const isStatusModalOpen = ref(false);
const isSubmitting = ref(false);

const newStatus = ref<OrderStatus>('CONFIRMED');
const statusNote = ref('');

async function loadOrders() {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await sellerService.getOrders({
      status: filterStatus.value || undefined,
      page: page.value,
      limit: 15,
    });
    orders.value = res.orders;
    totalPages.value = res.meta?.totalPages || 1;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải danh sách đơn hàng của cửa hàng';
  } finally {
    isLoading.value = false;
  }
}

async function openDetailModal(order: SellerOrder) {
  selectedOrder.value = order;
  isDetailModalOpen.value = true;
  try {
    selectedOrder.value = await sellerService.getOrderById(order.id);
  } catch {
    // Keep list snapshot if detail refresh fails
  }
}

function openStatusModal(order: SellerOrder) {
  selectedOrder.value = order;
  const current = order.fulfillmentStatus;
  if (current === 'CONFIRMED' || current === 'PROCESSING' || current === 'SHIPPING' || current === 'DELIVERED') {
    newStatus.value = current;
  } else {
    newStatus.value = 'CONFIRMED';
  }
  statusNote.value = '';
  isStatusModalOpen.value = true;
}

async function handleUpdateStatus() {
  if (!selectedOrder.value || isSubmitting.value) return;

  isSubmitting.value = true;
  try {
    await sellerService.updateOrderStatus(
      selectedOrder.value.id,
      newStatus.value,
      statusNote.value.trim() || undefined
    );
    toast.success('Đã cập nhật trạng thái xử lý đơn hàng!');
    isStatusModalOpen.value = false;
    await loadOrders();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Cập nhật trạng thái đơn hàng thất bại');
  } finally {
    isSubmitting.value = false;
  }
}

function handleFilterChange() {
  page.value = 1;
  loadOrders();
}

function handlePageChange(newPage: number) {
  page.value = newPage;
  loadOrders();
}

onMounted(() => {
  loadOrders();
});
</script>

<template>
  <SellerLayout>
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Đơn Hàng Của Shop</h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
            Chỉ hiển thị các mặt hàng thuộc cửa hàng của bạn và cập nhật tiến độ chuẩn bị / giao hàng
          </p>
        </div>

        <select
          v-model="filterStatus"
          @change="handleFilterChange"
          aria-label="Lọc theo trạng thái xử lý"
          class="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm focus:outline-none self-start sm:self-auto"
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

      <SkeletonLoader v-if="isLoading" type="table" :count="5" />

      <div
        v-else-if="error"
        class="p-6 bg-white rounded-2xl border border-rose-100 flex items-center justify-between gap-4"
      >
        <span class="text-xs sm:text-sm text-rose-600 font-medium">{{ error }}</span>
        <button @click="loadOrders" class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl">
          Thử lại
        </button>
      </div>

      <EmptyState
        v-else-if="orders.length === 0"
        title="Chưa có đơn hàng nào"
        description="Các đơn đặt mua chứa sản phẩm thuộc cửa hàng của bạn sẽ xuất hiện tại đây."
      >
        <template #icon>
          <ShoppingBag class="w-8 h-8 text-slate-400 stroke-1" />
        </template>
      </EmptyState>

      <div v-else class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div
          tabindex="0"
          role="region"
          aria-label="Danh sách đơn hàng của cửa hàng"
          class="ec-table-region"
        >
          <table class="w-full text-left text-xs ec-stacked-table">
            <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
              <tr>
                <th class="px-5 py-3">Mã đơn</th>
                <th class="px-5 py-3">Khách nhận</th>
                <th class="px-5 py-3">Mặt hàng Shop</th>
                <th class="px-5 py-3">Ngày đặt</th>
                <th class="px-5 py-3">Trạng thái Shop</th>
                <th class="px-5 py-3 text-right">Doanh thu Shop</th>
                <th class="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
              <tr v-for="o in orders" :key="o.id" class="hover:bg-slate-50/50 transition">
                <th scope="row" class="px-5 py-3.5 font-bold font-mono text-slate-900 text-left">
                  #{{ o.orderNumber }}
                </th>
                <td data-label="Khách nhận" class="px-5 py-3.5">
                  <div class="font-bold text-slate-900">{{ o.shippingName }}</div>
                  <div class="text-[11px] text-slate-400">{{ o.customerPhone }}</div>
                </td>
                <td data-label="Mặt hàng" class="px-5 py-3.5 font-semibold text-slate-600">
                  {{ o.items.length }} mặt hàng
                </td>
                <td data-label="Ngày đặt" class="px-5 py-3.5 text-slate-400">
                  {{ formatDateTime(o.createdAt) }}
                </td>
                <td data-label="Trạng thái" class="px-5 py-3.5">
                  <span
                    class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                    :class="getOrderStatusMeta(o.fulfillmentStatus).badgeClass"
                  >
                    {{ getOrderStatusMeta(o.fulfillmentStatus).label }}
                  </span>
                </td>
                <td data-label="Doanh thu Shop" class="px-5 py-3.5 text-right font-black text-brand-700">
                  {{ formatVND(o.storeSubtotal) }}
                </td>
                <td data-label="Thao tác" class="px-5 py-3.5 text-right space-x-1.5">
                  <button
                    @click="openDetailModal(o)"
                    class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                  >
                    <Eye class="w-3.5 h-3.5" />
                    <span>Chi tiết</span>
                  </button>
                  <button
                    v-if="o.shippingStatus !== 'CANCELLED' && o.fulfillmentStatus !== 'CANCELLED'"
                    @click="openStatusModal(o)"
                    class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg text-xs font-bold transition"
                  >
                    <Truck class="w-3.5 h-3.5" />
                    <span>Xử lý</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Pagination :page="page" :totalPages="totalPages" @change="handlePageChange" />
    </div>

    <!-- Detail Modal -->
    <Modal
      :isOpen="isDetailModalOpen"
      :title="`Chi tiết đơn hàng #${selectedOrder?.orderNumber || ''}`"
      @close="isDetailModalOpen = false"
    >
      <div v-if="selectedOrder" class="space-y-4 text-xs">
        <div class="bg-slate-50 p-4 rounded-2xl space-y-2 border border-slate-100">
          <div class="flex justify-between">
            <span class="text-slate-500">Trạng thái xử lý của Shop:</span>
            <span class="font-bold text-slate-900">{{ getOrderStatusMeta(selectedOrder.fulfillmentStatus).label }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Thanh toán:</span>
            <span class="font-bold text-slate-800">{{ selectedOrder.paymentMethod }} ({{ selectedOrder.paymentStatus }})</span>
          </div>
        </div>

        <div>
          <h4 class="font-bold text-slate-800 mb-1.5">Thông tin giao nhận:</h4>
          <p class="p-3 rounded-xl bg-white border border-slate-200 text-slate-600 leading-relaxed">
            <strong>{{ selectedOrder.shippingName }}</strong> — {{ selectedOrder.customerPhone }}<br />
            {{ selectedOrder.shippingAddress }}, {{ selectedOrder.shippingWard }}, {{ selectedOrder.shippingDistrict }}, {{ selectedOrder.shippingProvince }}
          </p>
        </div>

        <div>
          <h4 class="font-bold text-slate-800 mb-1.5">Sản phẩm thuộc cửa hàng của bạn:</h4>
          <div class="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            <div
              v-for="item in selectedOrder.items"
              :key="item.id"
              class="p-3 flex items-center justify-between gap-3 bg-white"
            >
              <div>
                <div class="font-bold text-slate-900">{{ item.productName }}</div>
                <div class="text-[11px] text-slate-400">
                  {{ item.variantTitle }} • SKU: <span class="font-mono">{{ item.sku }}</span> (x{{ item.quantity }})
                </div>
              </div>
              <div class="font-bold text-slate-900 shrink-0">{{ formatVND(item.totalPrice) }}</div>
            </div>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 flex justify-between items-baseline text-sm">
          <span class="font-bold text-slate-900">Tổng giá trị phần hàng của Shop:</span>
          <span class="text-lg font-black text-brand-700">{{ formatVND(selectedOrder.storeSubtotal) }}</span>
        </div>
      </div>
    </Modal>

    <!-- Status Update Modal -->
    <Modal
      :isOpen="isStatusModalOpen"
      :title="`Cập nhật xử lý đơn #${selectedOrder?.orderNumber || ''}`"
      @close="isStatusModalOpen = false"
    >
      <form @submit.prevent="handleUpdateStatus" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Trạng thái xử lý / giao vận</label>
          <select
            v-model="newStatus"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
          >
            <option value="CONFIRMED">Đã xác nhận đơn (CONFIRMED)</option>
            <option value="PROCESSING">Đang đóng gói / chuẩn bị hàng (PROCESSING)</option>
            <option value="SHIPPING">Đã bàn giao đơn vị vận chuyển (SHIPPING)</option>
            <option value="DELIVERED">Đã giao hàng thành công (DELIVERED)</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Ghi chú vận đơn (tùy chọn)</label>
          <input
            v-model="statusNote"
            type="text"
            maxlength="500"
            placeholder="Mã vận đơn hoặc ghi chú đóng gói..."
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
            class="inline-flex items-center gap-1.5 px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold"
          >
            <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
            <span>Cập nhật</span>
          </button>
        </div>
      </form>
    </Modal>
  </SellerLayout>
</template>
