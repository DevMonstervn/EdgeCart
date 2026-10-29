<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useToastStore } from '../stores/toast.js';
import { useConfirmStore } from '../stores/confirm.js';
import { orderService } from '../services/order.service.js';
import type { Order } from '@edgecart/shared';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import Modal from '../components/Modal.vue';
import {
  Package,
  Calendar,
  CreditCard,
  Truck,
  AlertCircle,
  Eye,
  XCircle,
} from 'lucide-vue-next';

const router = useRouter();
const auth = useAuthStore();
const toast = useToastStore();
const confirmModal = useConfirmStore();

const orders = ref<Order[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

const selectedOrder = ref<Order | null>(null);
const isDetailModalOpen = ref(false);

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'PENDING':
      return { label: 'Chờ xác nhận', class: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'CONFIRMED':
      return { label: 'Đã xác nhận', class: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'PROCESSING':
      return { label: 'Đang chuẩn bị', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'SHIPPING':
      return { label: 'Đang giao hàng', class: 'bg-purple-50 text-purple-700 border-purple-200' };
    case 'DELIVERED':
      return { label: 'Giao thành công', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'CANCELLED':
      return { label: 'Đã hủy', class: 'bg-rose-50 text-rose-700 border-rose-200' };
    default:
      return { label: status, class: 'bg-slate-50 text-slate-700 border-slate-200' };
  }
}

async function loadOrders() {
  if (!auth.isAuthenticated) {
    router.push('/login?redirect=/orders');
    return;
  }

  isLoading.value = true;
  error.value = null;
  try {
    orders.value = await orderService.getOrders();
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải lịch sử đơn hàng';
  } finally {
    isLoading.value = false;
  }
}

async function handleCancelOrder(orderId: string) {
  const confirmed = await confirmModal.ask({
    title: 'Hủy đơn hàng',
    message: 'Bạn có chắc chắn muốn hủy đơn hàng này không?',
    description: 'Đơn hàng sẽ chuyển sang trạng thái Đã hủy và hoàn lại số lượng tồn kho cho gian hàng.',
    confirmText: 'Xác nhận hủy đơn',
    cancelText: 'Giữ lại đơn',
    variant: 'danger',
  });
  if (!confirmed) return;

  try {
    await orderService.cancelOrder(orderId, 'Khách hàng yêu cầu hủy đơn');
    toast.success('Đã hủy đơn hàng thành công');
    isDetailModalOpen.value = false;
    await loadOrders();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể hủy đơn hàng');
  }
}

function openDetail(order: Order) {
  selectedOrder.value = order;
  isDetailModalOpen.value = true;
}

onMounted(() => {
  loadOrders();
});
</script>

<template>
  <DefaultLayout>
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">Đơn Hàng Của Tôi</h1>
      <p class="text-xs sm:text-sm text-slate-500 mb-8">Theo dõi tình trạng đơn và lịch sử mua sắm của bạn</p>

      <!-- Loading State -->
      <SkeletonLoader v-if="isLoading" type="table" :count="4" />

      <!-- Error State -->
      <div v-else-if="error" class="p-8 text-center bg-white rounded-3xl border border-rose-100 max-w-md mx-auto">
        <AlertCircle class="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <p class="text-rose-600 text-sm font-medium mb-4">{{ error }}</p>
        <button @click="loadOrders" class="px-5 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl">
          Thử lại
        </button>
      </div>

      <!-- Empty Orders -->
      <EmptyState
        v-else-if="orders.length === 0"
        title="Bạn chưa có đơn hàng nào"
        description="Khi bạn đặt mua sản phẩm, danh sách và lịch sử tiến trình giao hàng sẽ xuất hiện tại đây."
        actionText="Khám phá sản phẩm ngay"
        actionTo="/products"
      >
        <template #icon>
          <Package class="w-8 h-8 text-slate-400 stroke-1" />
        </template>
      </EmptyState>

      <!-- Orders List -->
      <div v-else class="space-y-4">
        <div
          v-for="order in orders"
          :key="order.id"
          class="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs hover:border-slate-200 transition space-y-4"
        >
          <!-- Order Header -->
          <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 text-xs">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-900 font-mono text-sm">#{{ order.orderNumber }}</span>
              <span class="text-slate-400">•</span>
              <span class="text-slate-500 flex items-center gap-1">
                <Calendar class="w-3.5 h-3.5" />
                {{ formatDate(order.createdAt) }}
              </span>
            </div>

            <!-- Status Badge -->
            <span
              class="px-2.5 py-1 rounded-full text-[11px] font-bold border"
              :class="getStatusBadge(order.shippingStatus).class"
            >
              {{ getStatusBadge(order.shippingStatus).label }}
            </span>
          </div>

          <!-- Order Content Summary -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="text-xs text-slate-600 space-y-1">
              <div>Người nhận: <strong class="text-slate-800">{{ order.shippingName }}</strong> ({{ order.customerPhone }})</div>
              <div class="text-slate-400 truncate max-w-md">{{ order.shippingAddress }}</div>
              <div class="text-slate-400">Hình thức: <span class="font-semibold text-slate-700">{{ order.paymentMethod }}</span></div>
            </div>

            <div class="flex items-center sm:flex-col sm:items-end justify-between border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-50">
              <span class="text-xs text-slate-400 sm:mb-0.5">Tổng tiền:</span>
              <span class="text-base sm:text-lg font-black text-brand-700">{{ formatVND(order.totalAmount) }}</span>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="pt-2 flex justify-end gap-2">
            <button
              v-if="order.shippingStatus === 'PENDING' || order.shippingStatus === 'CONFIRMED'"
              @click="handleCancelOrder(order.id)"
              class="px-3.5 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition"
            >
              Hủy đơn
            </button>
            <button
              @click="openDetail(order)"
              class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
            >
              <Eye class="w-3.5 h-3.5" />
              <span>Xem chi tiết</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Order Detail Modal -->
    <Modal
      :isOpen="isDetailModalOpen"
      :title="`Chi tiết đơn hàng #${selectedOrder?.orderNumber}`"
      @close="isDetailModalOpen = false"
    >
      <div v-if="selectedOrder" class="space-y-4 text-xs">
        <div class="bg-slate-50 p-4 rounded-2xl space-y-2">
          <div class="flex justify-between">
            <span class="text-slate-500">Trạng thái vận chuyển:</span>
            <span class="font-bold text-slate-800">{{ getStatusBadge(selectedOrder.shippingStatus).label }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Trạng thái thanh toán:</span>
            <span class="font-bold text-slate-800">{{ selectedOrder.paymentStatus }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Phương thức:</span>
            <span class="font-bold text-slate-800">{{ selectedOrder.paymentMethod }}</span>
          </div>
        </div>

        <div>
          <h4 class="font-bold text-slate-800 mb-2">Địa chỉ nhận hàng:</h4>
          <p class="text-slate-600 bg-white p-3 rounded-xl border border-slate-100 leading-relaxed">
            {{ selectedOrder.shippingName }} - {{ selectedOrder.customerPhone }} <br />
            {{ selectedOrder.shippingAddress }}, {{ selectedOrder.shippingWard }}, {{ selectedOrder.shippingDistrict }}, {{ selectedOrder.shippingProvince }}
          </p>
        </div>

        <div v-if="selectedOrder.items && selectedOrder.items.length > 0">
          <h4 class="font-bold text-slate-800 mb-2">Danh sách mặt hàng:</h4>
          <div class="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            <div
              v-for="item in selectedOrder.items"
              :key="item.id"
              class="p-2.5 flex justify-between items-center"
            >
              <div>
                <div class="font-bold text-slate-800">{{ item.productName }}</div>
                <div class="text-[11px] text-slate-400">{{ item.variantTitle }} (x{{ item.quantity }})</div>
              </div>
              <div class="font-bold text-slate-800">{{ formatVND(item.totalPrice) }}</div>
            </div>
          </div>
        </div>

        <div class="pt-2 border-t border-slate-100 flex justify-between items-baseline text-sm">
          <span class="font-bold text-slate-900">Tổng thanh toán:</span>
          <span class="text-lg font-black text-brand-700">{{ formatVND(selectedOrder.totalAmount) }}</span>
        </div>
      </div>
    </Modal>
  </DefaultLayout>
</template>
