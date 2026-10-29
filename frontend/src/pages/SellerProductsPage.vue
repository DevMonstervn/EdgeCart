<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { sellerService } from '../services/seller.service.js';
import { productService } from '../services/product.service.js';
import { useToastStore } from '../stores/toast.js';
import type { Category, Product, ProductImageInput } from '@edgecart/shared';
import SellerLayout from '../layouts/SellerLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
import Modal from '../components/Modal.vue';
import ProductImageUploader from '../components/ProductImageUploader.vue';
import { formatVND, slugifyVietnamese } from '../utils/format.js';
import { Plus, Search, Edit, EyeOff, Package, Trash2, Loader2 } from 'lucide-vue-next';

const toast = useToastStore();

const products = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const page = ref(1);
const totalPages = ref(1);
const searchQuery = ref('');

const isLoading = ref(true);
const error = ref<string | null>(null);
const isSubmitting = ref(false);
const isImageUploading = ref(false);

const isCreateModalOpen = ref(false);
const isEditModalOpen = ref(false);
const isSlugManuallyEdited = ref(false);

interface VariantDraft {
  sku: string;
  title: string;
  price: number;
  stockQuantity: number;
}

const createForm = ref({
  categoryId: '',
  name: '',
  slug: '',
  basePrice: 250000,
  salePrice: '' as string | number,
  description: '',
  images: [] as ProductImageInput[],
  variants: [
    {
      sku: 'SHOP-SKU-01',
      title: 'Tiêu chuẩn',
      price: 250000,
      stockQuantity: 20,
    },
  ] as VariantDraft[],
});

const editForm = ref({
  id: '',
  categoryId: '',
  name: '',
  basePrice: 0,
  salePrice: '' as string | number,
  description: '',
  isActive: true,
  images: [] as ProductImageInput[],
});

function handleNameInput() {
  if (!isSlugManuallyEdited.value) {
    createForm.value.slug = slugifyVietnamese(createForm.value.name);
  }
}

function addVariantRow() {
  const idx = createForm.value.variants.length + 1;
  createForm.value.variants.push({
    sku: `SHOP-SKU-0${idx}`,
    title: `Phân loại ${idx}`,
    price: Number(createForm.value.salePrice) || Number(createForm.value.basePrice) || 100000,
    stockQuantity: 10,
  });
}

function removeVariantRow(index: number) {
  if (createForm.value.variants.length <= 1) return;
  createForm.value.variants.splice(index, 1);
}

async function loadInitialData() {
  isLoading.value = true;
  error.value = null;
  try {
    const [catList, prodRes] = await Promise.all([
      productService.getCategories().catch(() => [] as Category[]),
      sellerService.getProducts({
        q: searchQuery.value.trim() || undefined,
        page: page.value,
        limit: 15,
      }),
    ]);
    categories.value = catList;
    if (!createForm.value.categoryId && catList.length > 0) {
      createForm.value.categoryId = catList[0].id;
    }
    products.value = prodRes.products;
    totalPages.value = prodRes.meta?.totalPages || 1;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Không thể tải danh sách sản phẩm';
  } finally {
    isLoading.value = false;
  }
}

async function loadProducts() {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await sellerService.getProducts({
      q: searchQuery.value.trim() || undefined,
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
  isSlugManuallyEdited.value = false;
  createForm.value = {
    categoryId: categories.value[0]?.id || '',
    name: '',
    slug: '',
    basePrice: 250000,
    salePrice: '',
    description: '',
    images: [],
    variants: [
      {
        sku: `SKU-${Date.now().toString().slice(-5)}`,
        title: 'Tiêu chuẩn',
        price: 250000,
        stockQuantity: 20,
      },
    ],
  };
  isCreateModalOpen.value = true;
}

async function handleCreateProduct() {
  if (isSubmitting.value) return;
  if (isImageUploading.value) {
    toast.error('Vui lòng đợi tải ảnh sản phẩm lên R2 hoàn tất trước khi lưu');
    return;
  }
  if (!createForm.value.categoryId) {
    toast.error('Vui lòng chọn danh mục sản phẩm');
    return;
  }

  const basePrice = Math.round(Number(createForm.value.basePrice) || 0);
  const rawSale = createForm.value.salePrice;
  const salePrice = rawSale === '' || rawSale === null ? null : Math.round(Number(rawSale));

  isSubmitting.value = true;
  try {
    await sellerService.createProduct({
      categoryId: createForm.value.categoryId,
      name: createForm.value.name.trim(),
      slug: createForm.value.slug.trim().toLowerCase(),
      description: createForm.value.description.trim() || null,
      basePrice,
      salePrice,
      images: createForm.value.images.map((img, idx) => ({
        imageUrl: img.imageUrl,
        r2Key: img.r2Key,
        altText: img.altText?.trim() || null,
        sortOrder: idx,
      })),
      variants: createForm.value.variants.map((v) => ({
        sku: v.sku.trim(),
        title: v.title.trim(),
        price: Math.round(Number(v.price) || basePrice),
        stockQuantity: Math.max(0, Math.round(Number(v.stockQuantity) || 0)),
      })),
    });
    toast.success('Đã đăng sản phẩm mới lên gian hàng!');
    isCreateModalOpen.value = false;
    page.value = 1;
    await loadProducts();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Đăng sản phẩm thất bại');
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
    await sellerService.updateProduct(editForm.value.id, {
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
    toast.success('Đã cập nhật thông tin sản phẩm!');
    isEditModalOpen.value = false;
    await loadProducts();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Cập nhật sản phẩm thất bại');
  } finally {
    isSubmitting.value = false;
  }
}

async function handleHideProduct(p: Product) {
  if (!confirm(`Bạn muốn ẩn sản phẩm "${p.name}" khỏi gian hàng công khai?`)) return;
  try {
    await sellerService.deleteProduct(p.id);
    toast.success('Đã ẩn sản phẩm khỏi gian hàng');
    await loadProducts();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể ẩn sản phẩm');
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

onMounted(() => {
  loadInitialData();
});
</script>

<template>
  <SellerLayout>
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Sản Phẩm Của Shop</h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
            Đăng tải, chỉnh sửa giá bán và bật/tắt hiển thị sản phẩm thuộc gian hàng của bạn
          </p>
        </div>

        <button
          @click="openCreateModal"
          class="inline-flex items-center gap-1.5 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-sm transition self-start"
        >
          <Plus class="w-4 h-4" />
          <span>Đăng sản phẩm mới</span>
        </button>
      </div>

      <!-- Search Bar -->
      <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex gap-3">
        <div class="relative flex-1">
          <input
            v-model="searchQuery"
            @keyup.enter="handleSearch"
            type="text"
            placeholder="Tìm theo tên sản phẩm hoặc slug..."
            class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-brand-500"
          />
          <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <button
          @click="handleSearch"
          class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition"
        >
          Tìm kiếm
        </button>
      </div>

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

      <EmptyState
        v-else-if="products.length === 0"
        title="Gian hàng chưa có sản phẩm nào"
        description="Hãy bắt đầu đăng sản phẩm đầu tiên kèm biến thể SKU và số lượng tồn kho để mở bán."
        actionText="Đăng sản phẩm ngay"
        @action="openCreateModal"
      >
        <template #icon>
          <Package class="w-8 h-8 text-slate-400 stroke-1" />
        </template>
      </EmptyState>

      <div v-else class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div
          tabindex="0"
          role="region"
          aria-label="Danh sách sản phẩm của cửa hàng"
          class="ec-table-region"
        >
          <table class="w-full text-left text-xs ec-stacked-table">
            <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
              <tr>
                <th class="px-5 py-3">Sản phẩm</th>
                <th class="px-5 py-3">Biến thể SKU</th>
                <th class="px-5 py-3">Giá gốc</th>
                <th class="px-5 py-3">Giá bán</th>
                <th class="px-5 py-3">Trạng thái</th>
                <th class="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
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
                <td data-label="Biến thể" class="px-5 py-3.5 text-slate-600">
                  {{ p.variants?.length || 0 }} SKU
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
                  <button
                    @click="openEditModal(p)"
                    class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition"
                    title="Chỉnh sửa sản phẩm"
                  >
                    <Edit class="w-3.5 h-3.5" />
                    <span>Sửa</span>
                  </button>
                  <button
                    v-if="p.isActive"
                    @click="handleHideProduct(p)"
                    class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 font-semibold transition"
                    title="Ẩn sản phẩm"
                  >
                    <EyeOff class="w-3.5 h-3.5" />
                    <span>Ẩn</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Pagination :page="page" :totalPages="totalPages" @change="handlePageChange" />
    </div>

    <!-- Create Product Modal -->
    <Modal :isOpen="isCreateModalOpen" title="Đăng Sản Phẩm Mới" @close="isCreateModalOpen = false">
      <form @submit.prevent="handleCreateProduct" class="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div v-if="categories.length === 0" class="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          <p class="font-bold text-amber-900 mb-0.5">Sàn chưa có danh mục sản phẩm</p>
          <p class="text-amber-700">Vui lòng liên hệ ban quản trị sàn EdgeCart để thiết lập danh mục ngành hàng trước khi đăng bán sản phẩm.</p>
        </div>
        <div v-else>
          <label class="block text-xs font-bold text-slate-700 mb-1">Danh mục ngành hàng *</label>
          <select
            v-model="createForm.categoryId"
            required
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:border-indigo-500"
          >
            <option value="" disabled>-- Chọn danh mục --</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Tên sản phẩm *</label>
            <input
              v-model="createForm.name"
              @input="handleNameInput"
              type="text"
              required
              minlength="2"
              placeholder="Ví dụ: Bàn phím cơ không dây"
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Slug URL *</label>
            <input
              v-model="createForm.slug"
              @input="isSlugManuallyEdited = true"
              type="text"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="ban-phim-co-khong-day"
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Giá niêm yết (VNĐ) *</label>
            <input
              v-model="createForm.basePrice"
              type="number"
              min="0"
              required
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Giá khuyến mãi (tùy chọn)</label>
            <input
              v-model="createForm.salePrice"
              type="number"
              min="0"
              placeholder="Để trống nếu không giảm"
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
            />
          </div>
        </div>

        <!-- Variants Builder -->
        <div class="space-y-2.5 pt-2 border-t border-slate-100">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold text-slate-800">Danh sách biến thể (SKU) *</label>
            <button
              type="button"
              @click="addVariantRow"
              class="text-xs font-bold text-brand-600 hover:text-brand-700"
            >
              + Thêm phân loại
            </button>
          </div>

          <div
            v-for="(variant, idx) in createForm.variants"
            :key="idx"
            class="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2"
          >
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold text-slate-500">Biến thể #{{ idx + 1 }}</span>
              <button
                v-if="createForm.variants.length > 1"
                type="button"
                @click="removeVariantRow(idx)"
                class="text-rose-500 hover:text-rose-700 p-0.5"
                title="Xóa biến thể"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <input
                v-model="variant.sku"
                type="text"
                required
                minlength="2"
                placeholder="Mã SKU"
                class="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
              />
              <input
                v-model="variant.title"
                type="text"
                required
                placeholder="Tên phân loại (Đen / M)"
                class="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
              <input
                v-model="variant.price"
                type="number"
                min="0"
                required
                placeholder="Giá bán SKU"
                class="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
              <input
                v-model="variant.stockQuantity"
                type="number"
                min="0"
                required
                placeholder="Tồn kho ban đầu"
                class="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>
        </div>

        <div class="pt-2 border-t border-slate-100">
          <ProductImageUploader
            v-model="createForm.images"
            :disabled="isSubmitting"
            @uploading-change="isImageUploading = $event"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Mô tả sản phẩm</label>
          <textarea
            v-model="createForm.description"
            rows="3"
            placeholder="Thông số kỹ thuật, chất liệu, hướng dẫn sử dụng..."
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
            class="inline-flex items-center gap-1.5 px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold"
          >
            <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
            <span>Đăng bán</span>
          </button>
        </div>
      </form>
    </Modal>

    <!-- Edit Product Modal -->
    <Modal :isOpen="isEditModalOpen" title="Cập Nhật Sản Phẩm" @close="isEditModalOpen = false">
      <form @submit.prevent="handleUpdateProduct" class="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Danh mục ngành hàng</label>
          <select
            v-model="editForm.categoryId"
            required
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
          >
            <option v-for="c in categories" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Tên sản phẩm</label>
          <input
            v-model="editForm.name"
            type="text"
            required
            minlength="2"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Giá niêm yết (VNĐ)</label>
            <input
              v-model="editForm.basePrice"
              type="number"
              min="0"
              required
              class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Giá khuyến mãi</label>
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
          <input v-model="editForm.isActive" type="checkbox" class="w-4 h-4 rounded text-brand-600" />
          <span class="text-xs font-semibold text-slate-700">Hiển thị mở bán công khai trên gian hàng</span>
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
            class="inline-flex items-center gap-1.5 px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold"
          >
            <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
            <span>Lưu cập nhật</span>
          </button>
        </div>
      </form>
    </Modal>
  </SellerLayout>
</template>
