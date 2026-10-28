<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminService, type InventoryItem } from '../services/admin.service.js';
import { useToastStore } from '../stores/toast.js';
import AdminLayout from '../layouts/AdminLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import Modal from '../components/Modal.vue';
import { Boxes, AlertTriangle, Search, PlusCircle, MinusCircle } from 'lucide-vue-next';

const toast = useToastStore();

const inventory = ref<InventoryItem[]>([]);
const isLoading = ref(true);
const searchQuery = ref('');

const selectedItem = ref<InventoryItem | null>(null);
const isAdjustModalOpen = ref(false);
const adjustQuantity = ref(10);
const adjustType = ref<'MANUAL_IMPORT' | 'MANUAL_ADJUST' | 'DAMAGED_DISCARD'>('MANUAL_IMPORT');
const adjustNotes = ref('');

async function loadInventory() {
  isLoading.value = true;
  try {
    inventory.value = await adminService.getInventory({ q: searchQuery.value || undefined });
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể tải danh sách kho');
  } finally {
    isLoading.value = false;
  }
}

function openAdjustModal(item: InventoryItem) {
  selectedItem.value = item;
  adjustQuantity.value = 10;
  adjustType.value = 'MANUAL_IMPORT';
  adjustNotes.value = '';
  isAdjustModalOpen.value = true;
}

async function handleAdjustInventory() {
  if (!selectedItem.value) return;

  const finalDelta = adjustType.value === 'DAMAGED_DISCARD' ? -Math.abs(adjustQuantity.value) : adjustQuantity.value;

  try {
    await adminService.adjustInventory(
      selectedItem.value.id,
      finalDelta,
      adjustType.value,
      adjustNotes.value || 'Điều chỉnh kho định kỳ'
    );
    toast.success('Đã cập nhật tồn kho thành công!');
    isAdjustModalOpen.value = false;
    await loadInventory();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Điều chỉnh kho thất bại');
  }
}

onMounted(() => {
  loadInventory();
});
</script>

<template>
  <AdminLayout>
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Quản Lý Tồn Kho & SKU</h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-0.5">Kiểm soát số lượng thực tế và ghi nhận sổ cái biến động kho</p>
        </div>
      </div>

      <!-- Search Field -->
      <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-2xs flex gap-3">
        <div class="relative flex-1">
          <input
            v-model="searchQuery"
            @keyup.enter="loadInventory"
            type="text"
            placeholder="Tìm theo SKU hoặc tên sản phẩm..."
            class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:border-indigo-500"
          />
          <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>
        <button
          @click="loadInventory"
          class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition"
        >
          Tìm kiếm
        </button>
      </div>

      <!-- Loading State -->
      <SkeletonLoader v-if="isLoading" type="table" :count="5" />

      <!-- Inventory Table -->
      <div v-else class="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50/70 text-slate-500 uppercase text-[10px] font-bold">
              <tr>
                <th class="px-5 py-3">Mã SKU</th>
                <th class="px-5 py-3">Sản phẩm & Biến thể</th>
                <th class="px-5 py-3">Số lượng tồn</th>
                <th class="px-5 py-3">Tình trạng</th>
                <th class="px-5 py-3 text-right">Điều chỉnh</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
              <tr v-if="inventory.length === 0">
                <td colspan="5" class="px-5 py-8 text-center text-slate-400">
                  Không có dữ liệu tồn kho nào
                </td>
              </tr>
              <tr v-for="item in inventory" :key="item.id" class="hover:bg-slate-50/50 transition">
                <td class="px-5 py-3.5 font-bold font-mono text-slate-900">{{ item.sku }}</td>
                <td class="px-5 py-3.5">
                  <div class="font-bold text-slate-900">{{ item.productName }}</div>
                  <div class="text-[11px] text-slate-400">{{ item.title }}</div>
                </td>
                <td class="px-5 py-3.5 font-black text-sm" :class="item.stockQuantity <= 5 ? 'text-amber-600' : 'text-slate-900'">
                  {{ item.stockQuantity }}
                </td>
                <td class="px-5 py-3.5">
                  <span
                    v-if="item.stockQuantity <= 0"
                    class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                  >
                    Hết hàng
                  </span>
                  <span
                    v-else-if="item.stockQuantity <= 5"
                    class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 w-fit"
                  >
                    <AlertTriangle class="w-3 h-3" />
                    Sắp hết hàng
                  </span>
                  <span
                    v-else
                    class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                  >
                    Sẵn sàng bán
                  </span>
                </td>
                <td class="px-5 py-3.5 text-right">
                  <button
                    @click="openAdjustModal(item)"
                    class="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition"
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
      :title="`Điều chỉnh tồn kho SKU: ${selectedItem?.sku}`"
      @close="isAdjustModalOpen = false"
    >
      <form @submit.prevent="handleAdjustInventory" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Loại nghiệp vụ</label>
          <select
            v-model="adjustType"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
          >
            <option value="MANUAL_IMPORT">Nhập hàng mới (MANUAL_IMPORT)</option>
            <option value="MANUAL_ADJUST">Điều chỉnh kiểm kê (MANUAL_ADJUST)</option>
            <option value="DAMAGED_DISCARD">Hủy hàng lỗi / hỏng (DAMAGED_DISCARD)</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Số lượng thay đổi</label>
          <input
            v-model="adjustQuantity"
            type="number"
            min="1"
            required
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Lý do / Ghi chú kiểm toán</label>
          <input
            v-model="adjustNotes"
            type="text"
            required
            placeholder="Phiếu nhập kho số #NK-2026..."
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
            class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700"
          >
            Xác nhận ghi sổ
          </button>
        </div>
      </form>
    </Modal>
  </AdminLayout>
</template>
