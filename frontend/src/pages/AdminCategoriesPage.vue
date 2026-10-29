<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { adminService } from '../services/admin.service.js';
import { useToastStore } from '../stores/toast.js';
import { useConfirmStore } from '../stores/confirm.js';
import type { Category } from '@edgecart/shared';
import AdminLayout from '../layouts/AdminLayout.vue';
import SkeletonLoader from '../components/SkeletonLoader.vue';
import Modal from '../components/Modal.vue';
import { slugifyVietnamese } from '../utils/format.js';
import {
  FolderTree,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Layers,
} from 'lucide-vue-next';

const toast = useToastStore();
const confirmModal = useConfirmStore();

const categories = ref<Category[]>([]);
const isLoading = ref(true);
const isSubmitting = ref(false);
const searchQuery = ref('');
const statusFilter = ref<'all' | 'active' | 'inactive'>('all');

const isCreateModalOpen = ref(false);
const isEditModalOpen = ref(false);
const isSlugAuto = ref(true);

const createForm = ref({
  name: '',
  slug: '',
  description: '',
  sortOrder: 0,
});

const editForm = ref({
  id: '',
  name: '',
  slug: '',
  description: '',
  sortOrder: 0,
  isActive: true,
});

const filteredCategories = computed(() => {
  let list = categories.value;

  if (statusFilter.value === 'active') {
    list = list.filter((c) => c.isActive);
  } else if (statusFilter.value === 'inactive') {
    list = list.filter((c) => !c.isActive);
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));
  }

  return list;
});

async function loadCategories() {
  isLoading.value = true;
  try {
    categories.value = await adminService.getCategories();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể tải danh sách danh mục');
  } finally {
    isLoading.value = false;
  }
}

function openCreateModal() {
  isSlugAuto.value = true;
  createForm.value = {
    name: '',
    slug: '',
    description: '',
    sortOrder: categories.value.length * 10,
  };
  isCreateModalOpen.value = true;
}

function handleNameInput() {
  if (isSlugAuto.value) {
    createForm.value.slug = slugifyVietnamese(createForm.value.name);
  }
}

function openEditModal(category: Category) {
  editForm.value = {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description || '',
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
  isEditModalOpen.value = true;
}

async function handleCreateCategory() {
  if (!createForm.value.name.trim() || !createForm.value.slug.trim()) {
    toast.error('Tên và đường dẫn slug không được để trống');
    return;
  }

  isSubmitting.value = true;
  try {
    await adminService.createCategory({
      name: createForm.value.name.trim(),
      slug: createForm.value.slug.trim().toLowerCase(),
      description: createForm.value.description.trim() || undefined,
      sortOrder: Number(createForm.value.sortOrder) || 0,
    });
    toast.success('Đã tạo danh mục mới thành công');
    isCreateModalOpen.value = false;
    await loadCategories();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể tạo danh mục');
  } finally {
    isSubmitting.value = false;
  }
}

async function handleUpdateCategory() {
  if (!editForm.value.name.trim() || !editForm.value.slug.trim()) {
    toast.error('Tên và đường dẫn slug không được để trống');
    return;
  }

  isSubmitting.value = true;
  try {
    await adminService.updateCategory(editForm.value.id, {
      name: editForm.value.name.trim(),
      slug: editForm.value.slug.trim().toLowerCase(),
      description: editForm.value.description.trim() || undefined,
      sortOrder: Number(editForm.value.sortOrder) || 0,
      isActive: editForm.value.isActive,
    });
    toast.success('Cập nhật danh mục thành công');
    isEditModalOpen.value = false;
    await loadCategories();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể cập nhật danh mục');
  } finally {
    isSubmitting.value = false;
  }
}

async function handleToggleStatus(category: Category) {
  const newStatus = !category.isActive;
  try {
    await adminService.toggleCategoryStatus(category.id, newStatus);
    toast.success(`Đã ${newStatus ? 'hiển thị' : 'ẩn'} danh mục "${category.name}"`);
    await loadCategories();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể đổi trạng thái danh mục');
  }
}

async function handleDeleteCategory(category: Category) {
  const confirmed = await confirmModal.ask({
    title: 'Xóa danh mục',
    message: `Bạn có chắc muốn xóa danh mục "${category.name}"?`,
    description: 'Thao tác này không thể hoàn tác. Các sản phẩm thuộc danh mục này có thể cần được phân loại lại.',
    confirmText: 'Xác nhận xóa',
    cancelText: 'Hủy bỏ',
    variant: 'danger',
  });
  if (!confirmed) return;

  try {
    await adminService.deleteCategory(category.id);
    toast.success(`Đã xóa danh mục "${category.name}" thành công`);
    await loadCategories();
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Không thể xóa danh mục');
  }
}

onMounted(async () => {
  await loadCategories();
});
</script>

<template>
  <AdminLayout>
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FolderTree class="w-6 h-6 text-indigo-600" />
            <span>Quản Lý Danh Mục Ngành Hàng</span>
          </h2>
          <p class="text-xs sm:text-sm text-slate-500 mt-0.5">
            Thiết lập danh mục sản phẩm chung cấp sàn. Seller và Admin sẽ phân loại hàng hóa dựa trên các danh mục này.
          </p>
        </div>

        <button
          @click="openCreateModal"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition self-start"
        >
          <Plus class="w-4 h-4" />
          <span>Thêm danh mục</span>
        </button>
      </div>

      <!-- Filters & Search -->
      <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-3">
        <div class="relative flex-1">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Tìm theo tên hoặc slug danh mục..."
            class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
          />
          <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <select
          v-model="statusFilter"
          aria-label="Lọc trạng thái"
          class="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hiển thị</option>
          <option value="inactive">Đang ẩn</option>
        </select>
      </div>

      <!-- Categories Table / List -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div v-if="isLoading" class="p-6">
          <SkeletonLoader :lines="4" />
        </div>

        <!-- Empty state when no categories at all -->
        <div v-else-if="categories.length === 0" class="py-14 px-4 text-center">
          <div class="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FolderTree class="w-7 h-7" />
          </div>
          <h3 class="text-base font-bold text-slate-800">Chưa có danh mục nào trên sàn</h3>
          <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Hệ thống cần ít nhất một danh mục ngành hàng để Admin và người bán (Seller) có thể thêm sản phẩm.
          </p>
          <button
            @click="openCreateModal"
            class="mt-5 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Plus class="w-4 h-4" />
            <span>Tạo danh mục đầu tiên</span>
          </button>
        </div>

        <!-- Empty state when filter matches nothing -->
        <div v-else-if="filteredCategories.length === 0" class="py-12 text-center text-xs text-slate-400">
          Không tìm thấy danh mục nào phù hợp với bộ lọc.
        </div>

        <!-- Table View -->
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                <th class="py-3 px-4">Tên danh mục</th>
                <th class="py-3 px-4">Slug URL</th>
                <th class="py-3 px-4">Mô tả</th>
                <th class="py-3 px-4 text-center">Thứ tự</th>
                <th class="py-3 px-4 text-center">Trạng thái</th>
                <th class="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50 text-xs">
              <tr
                v-for="cat in filteredCategories"
                :key="cat.id"
                class="hover:bg-slate-50/70 transition"
                :class="{ 'opacity-60 bg-slate-50/30': !cat.isActive }"
              >
                <!-- Name -->
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">
                      <Layers class="w-4 h-4" />
                    </div>
                    <div>
                      <p class="font-bold text-slate-900">{{ cat.name }}</p>
                      <p class="text-[10px] text-slate-400">ID: {{ cat.id }}</p>
                    </div>
                  </div>
                </td>

                <!-- Slug -->
                <td class="py-3 px-4 font-mono text-[11px] text-slate-600">
                  /category/{{ cat.slug }}
                </td>

                <!-- Description -->
                <td class="py-3 px-4 text-slate-500 max-w-xs truncate">
                  {{ cat.description || '—' }}
                </td>

                <!-- Sort Order -->
                <td class="py-3 px-4 text-center">
                  <span class="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[11px] font-bold">
                    {{ cat.sortOrder }}
                  </span>
                </td>

                <!-- Status -->
                <td class="py-3 px-4 text-center">
                  <span
                    v-if="cat.isActive"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                  >
                    <Eye class="w-3 h-3" />
                    <span>Hiển thị</span>
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200"
                  >
                    <EyeOff class="w-3 h-3" />
                    <span>Đang ẩn</span>
                  </span>
                </td>

                <!-- Actions -->
                <td class="py-3 px-4 text-right">
                  <div class="inline-flex items-center gap-1">
                    <button
                      @click="handleToggleStatus(cat)"
                      class="p-1.5 rounded-lg transition"
                      :class="cat.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'"
                      :title="cat.isActive ? 'Ẩn danh mục' : 'Hiển thị danh mục'"
                    >
                      <EyeOff v-if="cat.isActive" class="w-4 h-4" />
                      <Eye v-else class="w-4 h-4" />
                    </button>

                    <button
                      @click="openEditModal(cat)"
                      class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition"
                      title="Chỉnh sửa danh mục"
                    >
                      <Edit2 class="w-4 h-4" />
                    </button>

                    <button
                      @click="handleDeleteCategory(cat)"
                      class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                      title="Xóa danh mục"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create Category Modal -->
    <Modal :isOpen="isCreateModalOpen" title="Thêm Danh Mục Ngành Hàng Mới" @close="isCreateModalOpen = false">
      <form @submit.prevent="handleCreateCategory" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">
            Tên danh mục <span class="text-rose-500">*</span>
          </label>
          <input
            v-model="createForm.name"
            @input="handleNameInput"
            type="text"
            required
            placeholder="Ví dụ: Thiết bị & Phụ kiện công nghệ"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs font-bold text-slate-700">
              Slug URL <span class="text-rose-500">*</span>
            </label>
            <button
              type="button"
              @click="isSlugAuto = !isSlugAuto"
              class="text-[10px] text-indigo-600 hover:underline"
            >
              {{ isSlugAuto ? 'Chỉnh sửa slug thủ công' : 'Tự động tạo từ tên' }}
            </button>
          </div>
          <input
            v-model="createForm.slug"
            @input="isSlugAuto = false"
            type="text"
            required
            placeholder="thiet-bi-phu-kien-cong-nghe"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:border-indigo-500"
          />
          <p class="text-[10px] text-slate-400 mt-1">
            Đường dẫn hiển thị trên thanh địa chỉ URL: /category/{{ createForm.slug || '...' }}
          </p>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Mô tả danh mục</label>
          <textarea
            v-model="createForm.description"
            rows="3"
            placeholder="Mô tả ngắn gọn về ngành hàng này..."
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
          ></textarea>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Thứ tự sắp xếp (Sort Order)</label>
          <input
            v-model.number="createForm.sortOrder"
            type="number"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
          />
          <p class="text-[10px] text-slate-400 mt-1">Số nhỏ hơn sẽ được ưu tiên hiển thị trước.</p>
        </div>

        <div class="pt-2 flex justify-end gap-2">
          <button
            type="button"
            @click="isCreateModalOpen = false"
            class="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50"
          >
            <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
            <span>Tạo danh mục</span>
          </button>
        </div>
      </form>
    </Modal>

    <!-- Edit Category Modal -->
    <Modal :isOpen="isEditModalOpen" title="Chỉnh Sửa Danh Mục Ngành Hàng" @close="isEditModalOpen = false">
      <form @submit.prevent="handleUpdateCategory" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">
            Tên danh mục <span class="text-rose-500">*</span>
          </label>
          <input
            v-model="editForm.name"
            type="text"
            required
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">
            Slug URL <span class="text-rose-500">*</span>
          </label>
          <input
            v-model="editForm.slug"
            type="text"
            required
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Mô tả danh mục</label>
          <textarea
            v-model="editForm.description"
            rows="3"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
          ></textarea>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Thứ tự sắp xếp</label>
          <input
            v-model.number="editForm.sortOrder"
            type="number"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div class="flex items-center gap-2 pt-1">
          <input
            id="editCategoryActive"
            v-model="editForm.isActive"
            type="checkbox"
            class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label for="editCategoryActive" class="text-xs font-bold text-slate-700 cursor-pointer">
            Hiển thị danh mục trên sàn (Kích hoạt)
          </label>
        </div>

        <div class="pt-2 flex justify-end gap-2">
          <button
            type="button"
            @click="isEditModalOpen = false"
            class="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50"
          >
            <Loader2 v-if="isSubmitting" class="w-3.5 h-3.5 animate-spin" />
            <span>Lưu thay đổi</span>
          </button>
        </div>
      </form>
    </Modal>
  </AdminLayout>
</template>
