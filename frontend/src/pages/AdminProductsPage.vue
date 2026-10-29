<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminService } from '../services/admin.service.js';
import { productService } from '../services/product.service.js';
import { useAuthStore } from '../stores/auth.js';
import { useToastStore } from '../stores/toast.js';
import type { Category, Product, ProductImageInput } from '@edgecart/shared';
import AdminLayout from '../layouts/AdminLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import Pagination from '../components/Pagination.vue';
import Modal from '../components/Modal.vue';
import ProductImageUploader from '../components/ProductImageUploader.vue';
import { formatVND, slugifyVietnamese } from '../utils/format.js';
import {
  Plus,
  Search,
  Trash2,
  Edit,
  BadgeCheck,
  Store,
  Loader2,
  FolderTree,
  AlertCircle,
} from 'lucide-vue-next';

const auth = useAuthStore();
const toast = useToastStore();

const products = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const page = ref(1);
const totalPages = ref(1);
const scopeFilter = ref<'all' | 'system'>('all');
const isLoading = ref(true);
const error = ref<string | null>(null);
const isSubmitting = ref(false);
const isImageUploading = ref(false);

const isCreateModalOpen = ref(false);
const isEditModalOpen = ref(false);
const searchQuery = ref('');

const newProduct = ref({
  name: '',
  slug: '',
  categoryId: '',
  basePrice: 199000,
  salePrice: 149000 as number | string,
  description: '',
  sku: 'EC-SKU-001',
  stockQuantity: 50,
  images: [] as ProductImageInput[],
});

const editForm = ref({
  id: '',
  categoryId: '',
  name: '',
  basePrice: 0,
  salePrice: '' as number | string,
  description: '',
  isActive: true,
  images: [] as ProductImageInput[],
});

function canMutateProduct(p: Product): boolean {
  if (auth.isSuperAdmin) return true;
  // PRODUCT_MANAGER manages official platform products (storeId == null)
  return auth.isProductManager && !p.storeId;
}

async function loadProducts() {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await adminService.getAdminProducts({
      q: searchQuery.value.trim() || undefined,
      scope: scopeFilter.value,
      page: page.value,
      limit: 15,
    });
    products.value = res.products;
    totalPages.value = res.meta?.totalPages || 1;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải danh sách sản phẩm';
  } finally {
    isLoading.value = false;
  }
}

function openCreateModal() {
  newProduct.value = {
    name: '',
    slug: '',
    categoryId: categories.value[0]?.id || '',
    basePrice: 199000,
    salePrice: 149000,
    description: '',
    sku: `EC-${Date.now().toString().slice(-5)}`,
    stockQuantity: 50,
    images: [],
  };
  isCreateModalOpen.value = true;
}

async function handleCreateProduct() {
  if (isSubmitting.value) return;
  if (!newProduct.value.categoryId) {
    toast.error('Vui lòng chọn danh mục hợp lệ. Nếu sàn chưa có danh mục, hãy tạo danh mục trước.');
    return;
  }
  if (isImageUploading.value) {
    toast.error('Vui lòng đợi tải ảnh sản phẩm lên R2 hoàn tất trước khi lưu');
    return;
  }
  const basePrice = Math.round(Number(newProduct.value.basePrice) || 0);
  const rawSale = newProduct.value.salePrice;
  const salePrice = rawSale === '' || rawSale === null ? null : Math.round(Number(rawSale));

  isSubmitting.value = true;
  try {
    await adminService.createProduct({
      categoryId: newProduct.value.categoryId,
      name: newProduct.value.name.trim(),
      slug: (newProduct.value.slug || slugifyVietnamese(newProduct.value.name)).trim().toLowerCase(),
      basePrice,
      salePrice,
      description: newProduct.value.description.trim() || null,
      images: newProduct.value.images.map((img, idx) => ({
        imageUrl: img.imageUrl,
        r2Key: img.r2Key,
        altText: img.altText?.trim() || null,
        sortOrder: idx,
      })),
      variants: [
        {
          sku: newProduct.value.sku.trim(),
          title: 'Tiêu chuẩn',
          price: salePrice ?? basePrice,
          stockQuantity: Math.max(0, Math.round(Number(newProduct.value.stockQuantity) || 0)),
        },
      ],
    });
    toast.success('Đã tạo sản phẩm chính hãng thành công!');
    isCreateModalOpen.value = false;
    page.value = 1;
    await loadProducts();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Tạo sản phẩm thất bại');
  } finally {
    isSubmitting.value = false;
  }
}

function openEditModal(p: Product) {
  editForm.value = {
    id: p.id,
    categoryId: p.categoryId,
    name: p.name,
    basePrice: p.basePrice,
    salePrice: p.salePrice ?? '',
    description: p.description || '',
    isActive: p.isActive,
    images: (p.images || []).map((img, idx) => ({
      imageUrl: img.imageUrl,
      r2Key: img.r2Key,
      altText: img.altText ?? '',
      sortOrder: idx,
    })),
  };
  isEditModalOpen.value = true;
}

async function handleUpdateProduct() {
  if (!editForm.value.id || isSubmitting.value) return;
  if (isImageUploading.value) {
    toast.error('Vui lòng đợi tải ảnh sản phẩm lên R2 hoàn tất trước khi lưu');
    return;
  }
  const rawSale = editForm.value.salePrice;
  const salePrice = rawSale === '' || rawSale === null ? null : Math.round(Number(rawSale));

  isSubmitting.value = true;
  try {
    await adminService.updateProduct(editForm.value.id, {
      categoryId: editForm.value.categoryId,
      name: editForm.value.name.trim(),
      description: editForm.value.description.trim() || null,
      basePrice: Math.round(Number(editForm.value.basePrice) || 0),
      salePrice,
      isActive: editForm.value.isActive,
      images: editForm.value.images.map((img, idx) => ({
        imageUrl: img.imageUrl,
        r2Key: img.r2Key,
        altText: img.altText?.trim() || null,
        sortOrder: idx,
      })),
    });
    toast.success('Đã cập nhật sản phẩm thành công!');
    isEditModalOpen.value = false;
    await loadProducts();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Cập nhật sản phẩm thất bại');
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDeleteProduct(p: Product) {
  if (!confirm(`Bạn có chắc chắn muốn ẩn/xóa sản phẩm "${p.name}"?`)) return;
  try {
    await adminService.deleteProduct(p.id);
    toast.success('Đã ẩn/xóa sản phẩm thành công');
    await loadProducts();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể xóa sản phẩm');
  }
}

function handleSearch() {
  page.value = 1;
  loadProducts();
}

function handlePageChange(newPage: number) {
  page.value = newPage;
  loadProducts();
}

onMounted(async () => {
  categories.value = await productService.getCategories().catch(() => [] as Category[]);
  await loadProducts();
});
</script>

<template>
  <AdminLayout>
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Quản Lý Sản Phẩm</h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
            Quản lý sản phẩm chính hãng EdgeCart và giám sát hàng hóa của các gian hàng đối tác
          </p>
        </div>

        <button
          @click="openCreateModal"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition self-start"
        >
          <Plus class="w-4 h-4" />
          <span>Thêm sản phẩm Official</span>
        </button>
      </div>

      <!-- Categories Missing Notice Banner -->
      <div
        v-if="!isLoading && categories.length === 0"
        class="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-800"
      >
        <div class="flex items-center gap-3">
          <AlertCircle class="w-5 h-5 text-amber-600 shrink-0" />
          <div class="text-xs">
            <span class="font-bold text-amber-900">Chưa có danh mục sản phẩm trên hệ thống:</span>
            <span class="text-amber-700 ml-1">Cần có ít nhất một danh mục để phân loại và thêm sản phẩm.</span>
          </div>
        </div>
        <router-link
          to="/admin/categories"
          class="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition shrink-0"
        >
          <FolderTree class="w-3.5 h-3.5" />
          <span>Quản lý Danh mục</span>
        </router-link>
      </div>

      <!-- Search & Scope Filters -->
      <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-3">
        <div class="relative flex-1">
          <input
            v-model="searchQuery"
            @keyup.enter="handleSearch"
            type="text"
            placeholder="Tìm theo tên sản phẩm hoặc slug..."
            class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
          />
          <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <select
          v-model="scopeFilter"
          @change="handleSearch"
          aria-label="Phạm vi nguồn hàng"
          class="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
        >
          <option value="all">Toàn bộ sản phẩm trên sàn</option>
          <option value="system">Chỉ sản phẩm EdgeCart Official</option>
        </select>

        <button
          @click="handleSearch"
          class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition"
        >
          Tìm kiếm
        </button>
      </div>

      <!-- Loading State -->
      <SkeletonLoader v-if="isLoading" type="table" :count="5" />

      <div
        v-else-if="error"
        class="p-6 bg-white rounded-2xl border border-rose-100 flex items-center justify-between gap-4"
      >
        <span class="text-xs sm:text-sm text-rose-600 font-medium">{{ error }}</span>
        <button @click="loadProducts" class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl">
          Thử lại
        </button>
      </div>

      <!-- Products Table -->
      <div v-else class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div
          tabindex="0"
          role="region"
          aria-label="Danh sách sản phẩm toàn sàn"
          class="ec-table-region"
        >
          <table class="w-full text-left text-xs ec-stacked-table">
            <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
              <tr>
                <th class="px-5 py-3">Sản phẩm</th>
                <th class="px-5 py-3">Nguồn gian hàng</th>
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
                <th scope="row" class="px-5 py-3.5 font-bold text-slate-900 text-left">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                      <img
                        :src="p.images?.[0]?.imageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100&auto=format&fit=crop&q=60'"
                        :alt="p.name"
                        class="w-full h-full object-cover"
                      />
                    </div>
                    <div class="min-w-0">
                      <div class="truncate max-w-[220px]">{{ p.name }}</div>
                      <div class="text-[11px] font-mono text-slate-400 font-normal">{{ p.slug }}</div>
                    </div>
                  </div>
                </th>
                <td data-label="Gian hàng" class="px-5 py-3.5">
                  <RouterLink
                    v-if="p.store?.slug"
                    :to="`/stores/${p.store.slug}`"
                    class="inline-flex items-center gap-1 text-teal-700 font-semibold hover:underline"
                  >
                    <Store class="w-3.5 h-3.5" />
                    <span>{{ p.store.name }}</span>
                  </RouterLink>
                  <span v-else class="inline-flex items-center gap-1 text-indigo-700 font-semibold">
                    <BadgeCheck class="w-3.5 h-3.5" />
                    <span>EdgeCart Official</span>
                  </span>
                </td>
                <td data-label="Giá gốc" class="px-5 py-3.5 text-slate-400 line-through">
                  {{ formatVND(p.basePrice) }}
                </td>
                <td data-label="Giá bán" class="px-5 py-3.5 font-bold text-brand-700">
                  {{ formatVND(p.salePrice || p.basePrice) }}
                </td>
                <td data-label="Trạng thái" class="px-5 py-3.5">
                  <span
                    class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                    :class="
                      p.isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    "
                  >
                    {{ p.isActive ? 'Đang bán' : 'Đang ẩn' }}
                  </span>
                </td>
                <td data-label="Thao tác" class="px-5 py-3.5 text-right space-x-1">
                  <template v-if="canMutateProduct(p)">
                    <button
                      @click="openEditModal(p)"
                      class="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition"
                      title="Chỉnh sửa sản phẩm"
                    >
                      <Edit class="w-4 h-4" />
                    </button>
                    <button
                      @click="handleDeleteProduct(p)"
                      class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                      title="Ẩn/Xóa sản phẩm"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </template>
                  <span v-else class="text-[11px] text-slate-400 italic">Chỉ xem (SP Seller)</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Pagination :page="page" :totalPages="totalPages" @change="handlePageChange" />
    </div>

    <!-- Create Product Modal -->
    <Modal :isOpen="isCreateModalOpen" title="Thêm Sản Phẩm EdgeCart Official" @close="isCreateModalOpen = false">
      <form @submit.prevent="handleCreateProduct" class="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <!-- Category Selection -->
        <div v-if="categories.length === 0" class="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
          <div class="flex items-start gap-3">
            <AlertCircle class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div class="flex-1 text-xs">
              <p class="font-bold text-amber-900 mb-1">Chưa có danh mục sản phẩm nào trên sàn</p>
              <p class="text-amber-700 leading-relaxed mb-2.5">
                Sản phẩm bắt buộc phải liên kết với một danh mục ngành hàng. Vui lòng tạo danh mục trước khi thêm sản phẩm.
              </p>
              <router-link
                to="/admin/categories"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-sm transition"
              >
                <FolderTree class="w-3.5 h-3.5" />
                <span>Đến trang Quản lý Danh mục</span>
              </router-link>
            </div>
          </div>
        </div>
        <div v-else>
          <label class="block text-xs font-bold text-slate-700 mb-1">
            Danh mục sản phẩm <span class="text-rose-500">*</span>
          </label>
          <select
            v-model="newProduct.categoryId"
            required
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:border-indigo-500"
          >
            <option value="" disabled>-- Chọn danh mục --</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Tên sản phẩm</label>
          <input
            v-model="newProduct.name"
            @input="newProduct.slug = slugifyVietnamese(newProduct.name)"
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
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Giá gốc (VNĐ)</label>
            <input
              v-model="newProduct.basePrice"
              type="number"
              min="0"
              required
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Giá bán / Khuyến mãi</label>
            <input
              v-model="newProduct.salePrice"
              type="number"
              min="0"
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
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Số lượng kho</label>
            <input
              v-model="newProduct.stockQuantity"
              type="number"
              min="0"
              required
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
            />
          </div>
        </div>

        <div class="pt-2 border-t border-slate-100">
          <ProductImageUploader
            v-model="newProduct.images"
            :disabled="isSubmitting"
            @uploading-change="isImageUploading = $event"
          />
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
            :disabled="isSubmitting || categories.length === 0"
            class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-50"
          >
            <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
            <span>Lưu sản phẩm</span>
          </button>
        </div>
      </form>
    </Modal>

    <!-- Edit Product Modal -->
    <Modal :isOpen="isEditModalOpen" title="Cập Nhật Sản Phẩm" @close="isEditModalOpen = false">
      <form @submit.prevent="handleUpdateProduct" class="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div v-if="categories.length === 0" class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          Chưa có danh mục nào trên sàn. Vui lòng tạo danh mục trong trang Quản lý Danh mục.
        </div>
        <div v-else>
          <label class="block text-xs font-bold text-slate-700 mb-1">
            Danh mục sản phẩm <span class="text-rose-500">*</span>
          </label>
          <select
            v-model="editForm.categoryId"
            required
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:border-indigo-500"
          >
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Tên sản phẩm</label>
          <input
            v-model="editForm.name"
            type="text"
            required
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Giá gốc (VNĐ)</label>
            <input
              v-model="editForm.basePrice"
              type="number"
              min="0"
              required
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Giá bán / Khuyến mãi</label>
            <input
              v-model="editForm.salePrice"
              type="number"
              min="0"
              placeholder="Để trống nếu không giảm"
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
            />
          </div>
        </div>

        <div class="pt-2 border-t border-slate-100">
          <ProductImageUploader
            v-model="editForm.images"
            :disabled="isSubmitting"
            @uploading-change="isImageUploading = $event"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Mô tả sản phẩm</label>
          <textarea
            v-model="editForm.description"
            rows="3"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
          ></textarea>
        </div>

        <label class="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
          <input v-model="editForm.isActive" type="checkbox" class="w-4 h-4 rounded text-indigo-600" />
          <span class="text-xs font-semibold text-slate-700">Hiển thị mở bán công khai</span>
        </label>

        <div class="pt-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            @click="isEditModalOpen = false"
            class="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
          >
            Hủy
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700"
          >
            <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
            <span>Lưu cập nhật</span>
          </button>
        </div>
      </form>
    </Modal>
  </AdminLayout>
</template>
