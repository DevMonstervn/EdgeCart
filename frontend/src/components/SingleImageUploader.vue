<script setup lang="ts">
import { ref, computed } from 'vue';
import { uploadService } from '../services/upload.service.js';
import { useToastStore } from '../stores/toast.js';
import { Camera, UploadCloud, Trash2, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    folder?: 'avatars' | 'stores' | 'products';
    shape?: 'circle' | 'square' | 'banner';
    label?: string;
    hint?: string;
    disabled?: boolean;
  }>(),
  {
    modelValue: '',
    folder: 'avatars',
    shape: 'circle',
    label: '',
    hint: '',
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'uploading', isUploading: boolean): void;
}>();

const toast = useToastStore();
const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const errorMsg = ref<string | null>(null);
const isDragging = ref(false);

const hasImage = computed(() => Boolean(props.modelValue && props.modelValue.trim().length > 0));

function triggerFilePick() {
  if (props.disabled || isUploading.value) return;
  fileInput.value?.click();
}

async function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (!file) return;

  await uploadFile(file);
}

async function uploadFile(file: File) {
  errorMsg.value = null;
  isUploading.value = true;
  emit('uploading', true);

  try {
    const uploaded = await uploadService.uploadImage(file, props.folder);
    emit('update:modelValue', uploaded.imageUrl);
    toast.success('Tải ảnh lên thành công!');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Tải ảnh lên thất bại';
    errorMsg.value = msg;
    toast.error(msg);
  } finally {
    isUploading.value = false;
    emit('uploading', false);
  }
}

function handleRemove() {
  if (props.disabled || isUploading.value) return;
  emit('update:modelValue', '');
  errorMsg.value = null;
}

function handleDrop(e: DragEvent) {
  isDragging.value = false;
  if (props.disabled || isUploading.value) return;
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    uploadFile(file);
  }
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="label" class="flex items-center justify-between">
      <label class="block text-xs font-bold text-slate-700">{{ label }}</label>
      <span v-if="hint" class="text-[11px] text-slate-400">{{ hint }}</span>
    </div>

    <!-- Hidden native file input -->
    <input
      ref="fileInput"
      type="file"
      accept="image/webp,image/png,image/jpeg,image/avif"
      class="hidden"
      :disabled="disabled || isUploading"
      @change="handleFileChange"
    />

    <!-- Shape: Circle (for Avatar) -->
    <div v-if="shape === 'circle'" class="flex items-center gap-4">
      <div
        class="relative w-24 h-24 rounded-full overflow-hidden border-2 transition group select-none shrink-0"
        :class="[
          hasImage ? 'border-brand-500 shadow-sm' : 'border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100',
          isDragging ? 'border-brand-600 bg-brand-50/50' : '',
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        ]"
        @click="triggerFilePick"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
      >
        <img
          v-if="hasImage"
          :src="modelValue!"
          alt="Avatar"
          class="w-full h-full object-cover"
        />
        <div v-else class="w-full h-full flex flex-col items-center justify-center text-slate-400">
          <Camera class="w-7 h-7" />
          <span class="text-[10px] font-semibold mt-1">Chọn ảnh</span>
        </div>

        <!-- Hover overlay -->
        <div
          v-if="!disabled && !isUploading"
          class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white"
        >
          <Camera class="w-6 h-6" />
        </div>

        <!-- Uploading overlay -->
        <div
          v-if="isUploading"
          class="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center text-white"
        >
          <Loader2 class="w-6 h-6 animate-spin text-brand-400" />
        </div>
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="triggerFilePick"
            :disabled="disabled || isUploading"
            class="px-3 py-1.5 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <UploadCloud class="w-3.5 h-3.5" />
            <span>{{ hasImage ? 'Thay đổi ảnh' : 'Tải ảnh lên' }}</span>
          </button>
          <button
            v-if="hasImage"
            type="button"
            @click="handleRemove"
            :disabled="disabled || isUploading"
            class="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
            title="Xóa ảnh"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
        <p class="text-[11px] text-slate-400 leading-tight">
          WebP, PNG, JPG tối đa 5 MB. Ảnh được tải an toàn lên Cloudflare R2.
        </p>
      </div>
    </div>

    <!-- Shape: Square (for Store Logo) -->
    <div v-else-if="shape === 'square'" class="flex items-center gap-4">
      <div
        class="relative w-24 h-24 rounded-2xl overflow-hidden border-2 transition group select-none shrink-0"
        :class="[
          hasImage ? 'border-brand-500 shadow-sm' : 'border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100',
          isDragging ? 'border-brand-600 bg-brand-50/50' : '',
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        ]"
        @click="triggerFilePick"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
      >
        <img
          v-if="hasImage"
          :src="modelValue!"
          alt="Logo"
          class="w-full h-full object-cover"
        />
        <div v-else class="w-full h-full flex flex-col items-center justify-center text-slate-400 p-2 text-center">
          <ImageIcon class="w-6 h-6" />
          <span class="text-[10px] font-semibold mt-1">Logo</span>
        </div>

        <div
          v-if="!disabled && !isUploading"
          class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white"
        >
          <Camera class="w-6 h-6" />
        </div>

        <div
          v-if="isUploading"
          class="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center text-white"
        >
          <Loader2 class="w-6 h-6 animate-spin text-brand-400" />
        </div>
      </div>

      <div class="space-y-1.5 flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="triggerFilePick"
            :disabled="disabled || isUploading"
            class="px-3.5 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <UploadCloud class="w-4 h-4" />
            <span>{{ hasImage ? 'Thay logo mới' : 'Tải logo lên' }}</span>
          </button>
          <button
            v-if="hasImage"
            type="button"
            @click="handleRemove"
            :disabled="disabled || isUploading"
            class="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
            title="Xóa logo"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
        <p class="text-[11px] text-slate-400">
          Khuyến nghị tỷ lệ vuông 1:1, tối thiểu 200x200px.
        </p>
      </div>
    </div>

    <!-- Shape: Banner (for Store Banner) -->
    <div v-else-if="shape === 'banner'" class="space-y-2">
      <div
        class="relative w-full h-36 sm:h-44 rounded-2xl overflow-hidden border-2 transition group select-none flex items-center justify-center"
        :class="[
          hasImage ? 'border-brand-500 shadow-sm' : 'border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100',
          isDragging ? 'border-brand-600 bg-brand-50/50' : '',
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        ]"
        @click="triggerFilePick"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
      >
        <img
          v-if="hasImage"
          :src="modelValue!"
          alt="Banner"
          class="w-full h-full object-cover"
        />
        <div v-else class="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
          <UploadCloud class="w-8 h-8 mb-2" />
          <span class="text-xs font-bold text-slate-600">Bấm hoặc kéo thả ảnh bìa gian hàng vào đây</span>
          <span class="text-[11px] text-slate-400 mt-0.5">Khuyến nghị ảnh ngang tỷ lệ 16:5 (1200x380px)</span>
        </div>

        <div
          v-if="!disabled && !isUploading"
          class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white gap-2"
        >
          <Camera class="w-5 h-5" />
          <span class="text-xs font-bold">Thay đổi ảnh bìa</span>
        </div>

        <div
          v-if="isUploading"
          class="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center text-white gap-2"
        >
          <Loader2 class="w-6 h-6 animate-spin text-brand-400" />
          <span class="text-xs font-bold">Đang tải ảnh lên Cloudflare R2...</span>
        </div>
      </div>

      <div v-if="hasImage" class="flex justify-end">
        <button
          type="button"
          @click="handleRemove"
          :disabled="disabled || isUploading"
          class="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>Gỡ bỏ ảnh bìa</span>
        </button>
      </div>
    </div>

    <!-- Error notice -->
    <div v-if="errorMsg" class="flex items-center gap-1.5 text-xs text-rose-600 font-medium">
      <AlertCircle class="w-3.5 h-3.5 shrink-0" />
      <span>{{ errorMsg }}</span>
    </div>
  </div>
</template>
