<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { sellerService, type SellerDashboardStats } from '../services/seller.service.js';
import SellerLayout from '../layouts/SellerLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import { formatDateTime, formatVND, getOrderStatusMeta } from '../utils/format.js';
import {
  DollarSign,
  ShoppingBag,
  Package,
  AlertTriangle,
  Plus,
  Boxes,
  Store,
} from 'lucide-vue-next';

const stats = ref<SellerDashboardStats | null>(null);
const isLoading = ref(true);
const error = ref<string | null>(null);

async function loadStats() {
  isLoading.value = true;
  error.value = null;
  try {
    stats.value = await sellerService.getDashboardStats();
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải số liệu thống kê cửa hàng';
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  loadStats();
});
</script>

<template>
  <SellerLayout>
    <div class="space-y-6">
      <!-- Header & Quick Actions -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Tổng Quan Cửa Hàng</h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
            Theo dõi doanh thu, tồn kho và đơn hàng thuộc riêng gian hàng của bạn
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <RouterLink
            to="/seller/store"
            class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition"
          >
            <Store class="w-4 h-4 text-brand-600" />
            <span>Hồ sơ Shop</span>
          </RouterLink>
          <RouterLink
            to="/seller/inventory"
            class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition"
          >
            <Boxes class="w-4 h-4 text-amber-600" />
            <span>Nhập kho</span>
          </RouterLink>
          <RouterLink
            to="/seller/products"
            class="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
          >
            <Plus class="w-4 h-4" />
            <span>Đăng sản phẩm mới</span>
          </RouterLink>
        </div>
      </div>

      <!-- Loading State -->
      <SkeletonLoader v-if="isLoading" type="card" :count="4" />

      <!-- Error State -->
      <div
        v-else-if="error"
        class="p-6 bg-white rounded-2xl border border-rose-100 flex items-center justify-between gap-4"
      >
        <div class="text-xs sm:text-sm text-rose-600 font-medium">{{ error }}</div>
        <button @click="loadStats" class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl shrink-0">
          Thử lại
        </button>
      </div>

      <!-- Dashboard Content -->
      <div v-else-if="stats" class="space-y-6">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Store Revenue -->
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Doanh thu Shop</span>
              <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign class="w-4 h-4" />
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black text-slate-900">
              {{ formatVND(stats.totalRevenue) }}
            </div>
            <div class="text-[11px] text-emerald-600 font-semibold">Chỉ tính mặt hàng thuộc Shop</div>
          </div>

          <!-- Store Orders -->
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Đơn hàng</span>
              <div class="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                <ShoppingBag class="w-4 h-4" />
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black text-slate-900">
              {{ stats.totalOrders }}
            </div>
            <div class="text-[11px] text-slate-400">Đơn chứa sản phẩm của bạn</div>
          </div>

          <!-- Active Products -->
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Sản phẩm</span>
              <div class="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                <Package class="w-4 h-4" />
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black text-slate-900">
              {{ stats.totalProducts }}
            </div>
            <div class="text-[11px] text-slate-400">
              Đang hiển thị • {{ stats.hiddenProducts }} sản phẩm đang ẩn
            </div>
          </div>

          <!-- Low Stock -->
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Sắp hết hàng</span>
              <div class="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <AlertTriangle class="w-4 h-4" />
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black text-amber-600">
              {{ stats.lowStockVariants }}
            </div>
            <div class="text-[11px] text-amber-600 font-medium">Biến thể SKU tồn kho ≤ 5</div>
          </div>
        </div>

        <!-- Recent Store Orders Table -->
        <div class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-bold text-sm text-slate-900">Đơn hàng mới nhất của cửa hàng</h3>
            <RouterLink to="/seller/orders" class="text-xs font-bold text-brand-600 hover:text-brand-700">
              Xem tất cả đơn →
            </RouterLink>
          </div>

          <div
            tabindex="0"
            role="region"
            aria-label="Đơn hàng mới nhất của cửa hàng"
            class="ec-table-region"
          >
            <table class="w-full text-left text-xs ec-stacked-table">
              <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
                <tr>
                  <th class="px-5 py-3">Mã đơn</th>
                  <th class="px-5 py-3">Người nhận</th>
                  <th class="px-5 py-3">Số lượng SP</th>
                  <th class="px-5 py-3">Ngày đặt</th>
                  <th class="px-5 py-3">Doanh thu Shop</th>
                  <th class="px-5 py-3">Xử lý tại Shop</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 text-slate-700">
                <tr v-if="stats.recentOrders.length === 0">
                  <td colspan="6" class="px-5 py-10 text-center text-slate-400">
                    Chưa có đơn hàng nào phát sinh cho cửa hàng của bạn.
                  </td>
                </tr>
                <tr v-for="order in stats.recentOrders" :key="order.id" class="hover:bg-slate-50/50 transition">
                  <th scope="row" class="px-5 py-3.5 font-bold font-mono text-slate-900 text-left">
                    #{{ order.orderNumber }}
                  </th>
                  <td data-label="Người nhận" class="px-5 py-3.5">{{ order.shippingName }}</td>
                  <td data-label="Số lượng SP" class="px-5 py-3.5 font-semibold">{{ order.itemCount }} SP</td>
                  <td data-label="Ngày đặt" class="px-5 py-3.5 text-slate-400">{{ formatDateTime(order.createdAt) }}</td>
                  <td data-label="Doanh thu Shop" class="px-5 py-3.5 font-bold text-brand-700">
                    {{ formatVND(order.storeSubtotal) }}
                  </td>
                  <td data-label="Trạng thái" class="px-5 py-3.5">
                    <span
                      class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                      :class="getOrderStatusMeta(order.fulfillmentStatus).badgeClass"
                    >
                      {{ getOrderStatusMeta(order.fulfillmentStatus).label }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </SellerLayout>
</template>
