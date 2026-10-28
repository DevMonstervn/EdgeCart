<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminService, type DashboardStats } from '../services/admin.service.js';
import AdminLayout from '../layouts/AdminLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import {
  DollarSign,
  ShoppingBag,
  Package,
  Users,
  AlertTriangle,
  ArrowUpRight,
  Plus,
} from 'lucide-vue-next';

const stats = ref<DashboardStats | null>(null);
const isLoading = ref(true);
const error = ref<string | null>(null);

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

async function loadStats() {
  isLoading.value = true;
  error.value = null;
  try {
    stats.value = await adminService.getStats();
  } catch (err: unknown) {
    // If backend endpoint is not yet seeded, provide graceful fallback
    error.value = err instanceof Error ? err.message : 'Không thể tải số liệu thống kê';
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  loadStats();
});
</script>

<template>
  <AdminLayout>
    <div class="space-y-6">
      <!-- Welcome Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Bảng Điều Khiển Tổng Quan</h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-0.5">Theo dõi thời gian thực các chỉ số kinh doanh trên Edge</p>
        </div>

        <div class="flex items-center gap-2">
          <RouterLink
            to="/admin/products"
            class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
          >
            <Plus class="w-4 h-4" />
            <span>Thêm sản phẩm</span>
          </RouterLink>
        </div>
      </div>

      <!-- Loading State -->
      <SkeletonLoader v-if="isLoading" type="card" :count="4" />

      <!-- Error State -->
      <div v-else-if="error" class="p-6 bg-white rounded-2xl border border-rose-100 flex items-center justify-between">
        <div class="text-xs text-rose-600 font-medium">{{ error }}</div>
        <button @click="loadStats" class="px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg">
          Thử lại
        </button>
      </div>

      <!-- KPI Metrics Cards -->
      <div v-else-if="stats" class="space-y-6">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Total Revenue -->
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-2xs space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Doanh thu</span>
              <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign class="w-4 h-4" />
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black text-slate-900">
              {{ formatVND(stats.totalRevenue || 0) }}
            </div>
            <div class="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
              <ArrowUpRight class="w-3.5 h-3.5" />
              <span>Cập nhật tức thì tại Edge</span>
            </div>
          </div>

          <!-- Total Orders -->
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-2xs space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Đơn hàng</span>
              <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <ShoppingBag class="w-4 h-4" />
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black text-slate-900">
              {{ stats.totalOrders || 0 }}
            </div>
            <div class="text-[11px] text-slate-400">Giao dịch đã xử lý</div>
          </div>

          <!-- Total Products -->
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-2xs space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Sản phẩm</span>
              <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Package class="w-4 h-4" />
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black text-slate-900">
              {{ stats.totalProducts || 0 }}
            </div>
            <div class="text-[11px] text-slate-400">Đang hoạt động trong kho</div>
          </div>

          <!-- Low Stock Alert -->
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-2xs space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Cảnh báo kho</span>
              <div class="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <AlertTriangle class="w-4 h-4" />
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black text-amber-600">
              {{ stats.lowStockCount || 0 }}
            </div>
            <div class="text-[11px] text-amber-600 font-medium">SKU sắp hết hàng (&lt; 5)</div>
          </div>
        </div>

        <!-- Recent Orders Table -->
        <div class="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden">
          <div class="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-bold text-sm text-slate-900">Đơn hàng mới nhất</h3>
            <RouterLink to="/admin/orders" class="text-xs font-bold text-indigo-600 hover:text-indigo-700">
              Xem tất cả đơn
            </RouterLink>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50/70 text-slate-500 uppercase text-[10px] font-bold">
                <tr>
                  <th class="px-5 py-3">Mã đơn</th>
                  <th class="px-5 py-3">Khách hàng</th>
                  <th class="px-5 py-3">Ngày đặt</th>
                  <th class="px-5 py-3">Tổng tiền</th>
                  <th class="px-5 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 text-slate-700">
                <tr v-if="!stats.recentOrders || stats.recentOrders.length === 0">
                  <td colspan="5" class="px-5 py-8 text-center text-slate-400">
                    Chưa có đơn hàng nào
                  </td>
                </tr>
                <tr
                  v-for="order in stats.recentOrders"
                  :key="order.id"
                  class="hover:bg-slate-50/50 transition"
                >
                  <td class="px-5 py-3.5 font-bold font-mono text-slate-900">#{{ order.orderNumber }}</td>
                  <td class="px-5 py-3.5">{{ order.shippingName }}</td>
                  <td class="px-5 py-3.5 text-slate-400">{{ formatDate(order.createdAt) }}</td>
                  <td class="px-5 py-3.5 font-bold text-slate-900">{{ formatVND(order.totalAmount) }}</td>
                  <td class="px-5 py-3.5">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      {{ order.shippingStatus }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>
