<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminService } from '../services/admin.service.js';
import { useToastStore } from '../stores/toast.js';
import type { Product } from '@edgecart/shared';
import AdminLayout from '../layouts/AdminLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import Modal from '../components/Modal.vue';
import { Plus, Search, Trash2, Edit, Check, X, Package } from 'lucide-vue-next';

const toast = useToastStore();

const products = ref<Product[]>([]);
const isLoading = ref(true);
const isCreateModalOpen = ref(false);
const searchQuery = ref('');

// Create Form State
const newProduct = ref({
  name: '',
  slug: '',
  categoryId: 'cat_01',
  basePrice: 199000,
  salePrice: 149000,
  description: '',
  sku: 'SKU-001',
  stockQuantity: 50,
});

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

async function loadProducts() {
  isLoading.value = true;
  try {
    const res = await adminService.getAdminProducts({ q: searchQuery.value || undefined });
    products.value = res.products;
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể tải danh sách sản phẩm');
  } finally {
    isLoading.value = false;
  }
}

async function handleCreateProduct() {
  try {
    await adminService.createProduct({
      ...newProduct.value,
      variants: [
        {
          sku: newProduct.value.sku,
          title: 'Tiêu chuẩn',
          price: newProduct.value.salePrice || newProduct.value.basePrice,
          stockQuantity: newProduct.value.stockQuantity,
        },
      ],
    });
    toast.success('Đã tạo sản phẩm mới thành công!');
    isCreateModalOpen.value = false;
    await loadProducts();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Tạo sản phẩm thất bại');
  }
}

async function handleDeleteProduct(id: string) {
  if (!confirm('Bạn có chắc chắn muốn xóa sản phẩm này?')) return;
  try {
    await adminService.deleteProduct(id);
    toast.success('Đã xóa sản phẩm');
    await loadProducts();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể xóa sản phẩm');
  }
}

onMounted(() => {
  loadProducts();
});
</script>

<template>
  <AdminLayout>
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Quản Lý Sản Phẩm</h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-0.5">Danh mục và biến thể hàng hóa trên hệ thống</p>
        </div>

        <button
          @click="isCreateModalOpen = true"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
        >
          <Plus class="w-4 h-4" />
          <span>Thêm sản phẩm mới</span>
        </button>
      </div>

      <!-- Search & Filters -->
      <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-2xs flex gap-3">
        <div class="relative flex-1">
          <input
            v-model="searchQuery"
            @keyup.enter="loadProducts"
            type="text"
            placeholder="Tìm theo tên sản phẩm hoặc SKU..."
            class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:border-indigo-500"
          />
          <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>
        <button
          @click="loadProducts"
          class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition"
        >
          Tìm kiếm
        </button>
      </div>

      <!-- Loading State -->
      <SkeletonLoader v-if="isLoading" type="table" :count="5" />

      <!-- Products Table -->
      <div v-else class="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50/70 text-slate-500 uppercase text-[10px] font-bold">
              <tr>
                <th class="px-5 py-3">Sản phẩm</th>
                <th class="px-5 py-3">Slug</th>
                <th class="px-5 py-3">Giá gốc</th>
                <th class="px-5 py-3">Giá bán</th>
                <th class="px-5 py-3">Trạng thái</th>
                <th class="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
              <tr v-if="products.length === 0">
                <td colspan="6" class="px-5 py-8 text-center text-slate-400">
                  Không tìm thấy sản phẩm nào
                </td>
              </tr>
              <tr v-for="p in products" :key="p.id" class="hover:bg-slate-50/50 transition">
                <td class="px-5 py-3.5 font-bold text-slate-900 flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                    <img
                      :src="p.images?.[0]?.imageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100&auto=format&fit=crop&q=60'"
                      :alt="p.name"
                      class="w-full h-full object-cover"
                    />
                  </div>
                  <span class="truncate max-w-xs">{{ p.name }}</span>
                </td>
                <td class="px-5 py-3.5 text-slate-400 font-mono">{{ p.slug }}</td>
                <td class="px-5 py-3.5 text-slate-500 line-through">{{ formatVND(p.basePrice) }}</td>
                <td class="px-5 py-3.5 font-bold text-brand-700">{{ formatVND(p.salePrice || p.basePrice) }}</td>
                <td class="px-5 py-3.5">
                  <span
                    class="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    :class="p.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'"
                  >
                    {{ p.isActive ? 'Đang bán' : 'Ẩn' }}
                  </span>
                </td>
                <td class="px-5 py-3.5 text-right space-x-1">
                  <button
                    @click="handleDeleteProduct(p.id)"
                    class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                    title="Xóa sản phẩm"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create Product Modal -->
    <Modal :isOpen="isCreateModalOpen" title="Thêm Sản Phẩm Mới" @close="isCreateModalOpen = false">
      <form @submit.prevent="handleCreateProduct" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Tên sản phẩm</label>
          <input
            v-model="newProduct.name"
            type="text"
            required
            placeholder="Áo Thun Cotton Basic"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Slug URL</label>
          <input
            v-model="newProduct.slug"
            type="text"
            required
            placeholder="ao-thun-cotton-basic"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Giá gốc (VNĐ)</label>
            <input
              v-model="newProduct.basePrice"
              type="number"
              required
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Giá bán / Khuyến mãi</label>
            <input
              v-model="newProduct.salePrice"
              type="number"
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Mã SKU</label>
            <input
              v-model="newProduct.sku"
              type="text"
              required
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Số lượng kho</label>
            <input
              v-model="newProduct.stockQuantity"
              type="number"
              required
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
            />
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Mô tả tóm tắt</label>
          <textarea
            v-model="newProduct.description"
            rows="2"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
          ></textarea>
        </div>

        <div class="pt-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            @click="isCreateModalOpen = false"
            class="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
          >
            Hủy
          </button>
          <button
            type="submit"
            class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700"
          >
            Lưu sản phẩm
          </button>
        </div>
      </form>
    </Modal>
  </AdminLayout>
</template>
