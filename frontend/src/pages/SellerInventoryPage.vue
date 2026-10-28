<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { sellerService, type SellerInventoryItem } from '../services/seller.service.js';
import { useToastStore } from '../stores/toast.js';
import SellerLayout from '../layouts/SellerLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import EmptyState from '../components/EmptyState.vue';
import Modal from '../components/Modal.vue';
import { formatVND } from '../utils/format.js';
import { Boxes, AlertTriangle, Search, Loader2 } from 'lucide-vue-next';

const toast = useToastStore();

const inventory = ref<SellerInventoryItem[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);
const searchQuery = ref('');
const lowStockOnly = ref(false);

const selectedItem = ref<SellerInventoryItem | null>(null);
const isAdjustModalOpen = ref(false);
const isSubmitting = ref(false);
const adjustQuantity = ref(10);
const adjustType = ref<'MANUAL_IMPORT' | 'MANUAL_ADJUST' | 'DAMAGED_DISCARD'>('MANUAL_IMPORT');
const adjustNotes = ref('');

async function loadInventory() {
  isLoading.value = true;
  error.value = null;
  try {
    inventory.value = await sellerService.getInventory({
      q: searchQuery.value.trim() || undefined,
      lowStockOnly: lowStockOnly.value || undefined,
    });
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải danh sách tồn kho';
  } finally {
    isLoading.value = false;
  }
}

function openAdjustModal(item: SellerInventoryItem) {
  selectedItem.value = item;
  adjustQuantity.value = 10;
  adjustType.value = 'MANUAL_IMPORT';
  adjustNotes.value = '';
  isAdjustModalOpen.value = true;
}

async function handleAdjustInventory() {
  if (!selectedItem.value || isSubmitting.value) return;

  const rawQty = Math.round(Number(adjustQuantity.value) || 0);
  if (rawQty === 0) {
    toast.error('Số lượng điều chỉnh phải khác 0');
    return;
  }

  let finalDelta = rawQty;
  if (adjustType.value === 'MANUAL_IMPORT') {
    finalDelta = Math.abs(rawQty);
  } else if (adjustType.value === 'DAMAGED_DISCARD') {
    finalDelta = -Math.abs(rawQty);
  }

  isSubmitting.value = true;
  try {
    await sellerService.adjustInventory({
      variantId: selectedItem.value.id,
      changeQuantity: finalDelta,
      type: adjustType.value,
      notes: adjustNotes.value.trim() || 'Người bán cập nhật tồn kho',
    });
    toast.success('Đã ghi nhận điều chỉnh tồn kho thành công!');
    isAdjustModalOpen.value = false;
    await loadInventory();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Điều chỉnh tồn kho thất bại');
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(() => {
  loadInventory();
});
</script>

<template>
  <SellerLayout>
    <div class="space-y-6">
      <div>
        <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Quản Lý Tồn Kho Cửa Hàng</h2>
        <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
          Theo dõi số lượng tồn kho từng biến thể SKU và ghi sổ nhập/xuất kho của riêng cửa hàng bạn
        </p>
      </div>

      <!-- Search & Filter Bar -->
      <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="relative flex-1">
          <input
            v-model="searchQuery"
            @keyup.enter="loadInventory"
            type="text"
            placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
            class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-brand-500"
          />
          <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none px-2">
          <input
            v-model="lowStockOnly"
            @change="loadInventory"
            type="checkbox"
            class="w-4 h-4 rounded text-amber-600"
          />
          <span>Chỉ hiện SKU sắp hết (≤ 5)</span>
        </label>

        <button
          @click="loadInventory"
          class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition self-end sm:self-auto"
        >
          Lọc dữ liệu
        </button>
      </div>

      <SkeletonLoader v-if="isLoading" type="table" :count="5" />

      <div
        v-else-if="error"
        class="p-6 bg-white rounded-2xl border border-rose-100 flex items-center justify-between gap-4"
      >
        <span class="text-xs sm:text-sm text-rose-600 font-medium">{{ error }}</span>
        <button @click="loadInventory" class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl">
          Thử lại
        </button>
      </div>

      <EmptyState
        v-else-if="inventory.length === 0"
        :title="lowStockOnly ? 'Không có SKU nào sắp hết hàng' : 'Chưa có biến thể tồn kho nào'"
        :description="
          lowStockOnly
            ? 'Tất cả biến thể sản phẩm của cửa hàng hiện đều có lượng tồn kho an toàn.'
            : 'Hãy đăng sản phẩm mới để bắt đầu quản lý tồn kho theo từng SKU.'
        "
        :actionText="lowStockOnly ? 'Xem toàn bộ kho' : 'Đăng sản phẩm mới'"
        :actionTo="lowStockOnly ? undefined : '/seller/products'"
        @action="lowStockOnly = false; loadInventory()"
      >
        <template #icon>
          <Boxes class="w-8 h-8 text-slate-400 stroke-1" />
        </template>
      </EmptyState>

      <div v-else class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div
          tabindex="0"
          role="region"
          aria-label="Bảng tồn kho SKU của cửa hàng"
          class="ec-table-region"
        >
          <table class="w-full text-left text-xs ec-stacked-table">
            <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
              <tr>
                <th class="px-5 py-3">Mã SKU</th>
                <th class="px-5 py-3">Sản phẩm & Phân loại</th>
                <th class="px-5 py-3">Đơn giá SKU</th>
                <th class="px-5 py-3">Tồn thực tế</th>
                <th class="px-5 py-3">Trạng thái</th>
                <th class="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
              <tr v-for="item in inventory" :key="item.id" class="hover:bg-slate-50/50 transition">
                <th scope="row" class="px-5 py-3.5 font-bold font-mono text-slate-900 text-left">
                  {{ item.sku }}
                </th>
                <td data-label="Sản phẩm" class="px-5 py-3.5">
                  <div class="font-bold text-slate-900">{{ item.productName }}</div>
                  <div class="text-[11px] text-slate-400">{{ item.title }}</div>
                </td>
                <td data-label="Đơn giá" class="px-5 py-3.5 font-semibold text-slate-700">
                  {{ formatVND(item.price) }}
                </td>
                <td
                  data-label="Tồn kho"
                  class="px-5 py-3.5 font-black text-sm"
                  :class="item.stockQuantity <= 5 ? 'text-amber-600' : 'text-slate-900'"
                >
                  {{ item.stockQuantity }}
                </td>
                <td data-label="Tình trạng" class="px-5 py-3.5">
                  <span
                    v-if="item.stockQuantity <= 0"
                    class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                  >
                    Hết hàng
                  </span>
                  <span
                    v-else-if="item.stockQuantity <= 5"
                    class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1"
                  >
                    <AlertTriangle class="w-3 h-3" />
                    Sắp hết
                  </span>
                  <span
                    v-else
                    class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                  >
                    Sẵn sàng
                  </span>
                </td>
                <td data-label="Điều chỉnh" class="px-5 py-3.5 text-right">
                  <button
                    @click="openAdjustModal(item)"
                    class="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg text-xs font-bold transition"
                  >
                    Nhập / Xuất kho
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Adjust Stock Modal -->
    <Modal
      :isOpen="isAdjustModalOpen"
      :title="`Điều chỉnh kho SKU: ${selectedItem?.sku || ''}`"
      @close="isAdjustModalOpen = false"
    >
      <form @submit.prevent="handleAdjustInventory" class="space-y-4">
        <div v-if="selectedItem" class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <div class="font-bold text-slate-900">{{ selectedItem.productName }} — {{ selectedItem.title }}</div>
          <div class="text-slate-500 mt-0.5">Tồn kho hiện tại: <strong class="text-slate-900">{{ selectedItem.stockQuantity }}</strong></div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Loại nghiệp vụ kho</label>
          <select
            v-model="adjustType"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
          >
            <option value="MANUAL_IMPORT">Nhập thêm hàng mới (+)</option>
            <option value="DAMAGED_DISCARD">Xuất hủy hàng lỗi / hỏng (-)</option>
            <option value="MANUAL_ADJUST">Điều chỉnh kiểm kê (+/-)</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">
            {{ adjustType === 'MANUAL_ADJUST' ? 'Số lượng chênh lệch (nhập âm để giảm, dương để tăng)' : 'Số lượng' }}
          </label>
          <input
            v-model="adjustQuantity"
            type="number"
            :min="adjustType === 'MANUAL_ADJUST' ? undefined : 1"
            required
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Ghi chú sổ cái tồn kho *</label>
          <input
            v-model="adjustNotes"
            type="text"
            required
            placeholder="Ví dụ: Nhập lô hàng đợt 2 tháng 10..."
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
          />
        </div>

        <div class="pt-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            @click="isAdjustModalOpen = false"
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
            <span>Xác nhận ghi sổ</span>
          </button>
        </div>
      </form>
    </Modal>
  </SellerLayout>
</template>
