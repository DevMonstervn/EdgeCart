<script setup lang="ts">
import { ref, computed, useId } from 'vue';
import type { ProductImageInput } from '@edgecart/shared';
import { uploadService, validateImageFileClient } from '../services/upload.service.js';
import { UploadCloud, Star, Trash2, AlertCircle } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    modelValue: ProductImageInput[];
    maxImages?: number;
    disabled?: boolean;
  }>(),
  {
    maxImages: 8,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: ProductImageInput[]): void;
  (e: 'uploading-change', isUploading: boolean): void;
}>();

const uid = useId();
const inputId = `ec-img-upload-${uid}`;
const hintId = `ec-img-hint-${uid}`;
const errorId = `ec-img-err-${uid}`;

const fileInputRef = ref<HTMLInputElement | null>(null);
const errorMessage = ref<string | null>(null);
const totalBatchCount = ref(0);
const completedBatchCount = ref(0);

const isUploading = computed(() => totalBatchCount.value > 0);
const remainingSlots = computed(() => Math.max(0, props.maxImages - props.modelValue.length));
const describedByIds = computed(() => (errorMessage.value ? `${hintId} ${errorId}` : hintId));

function normalizeOrder(list: ProductImageInput[]): ProductImageInput[] {
  return list.map((item, idx) => ({
    ...item,
    sortOrder: idx,
  }));
}

async function handleFileSelection(event: Event) {
  const input = event.target as HTMLInputElement;
  const selectedFiles = input.files ? Array.from(input.files) : [];
  input.value = '';

  if (selectedFiles.length === 0) return;
  errorMessage.value = null;

  if (selectedFiles.length > remainingSlots.value) {
    errorMessage.value =
      remainingSlots.value === 0
        ? `Sản phẩm đã đạt giới hạn tối đa ${props.maxImages} ảnh.`
        : `Chỉ có thể tải thêm tối đa ${remainingSlots.value} ảnh nữa (tối đa ${props.maxImages} ảnh/sản phẩm).`;
    return;
  }

  for (const file of selectedFiles) {
    const clientErr = validateImageFileClient(file);
    if (clientErr) {
      errorMessage.value = clientErr;
      return;
    }
  }

  totalBatchCount.value = selectedFiles.length;
  completedBatchCount.value = 0;
  emit('uploading-change', true);

  const nextImages = [...props.modelValue];

  try {
    for (const file of selectedFiles) {
      const uploaded = await uploadService.uploadImage(file);
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      nextImages.push({
        imageUrl: uploaded.imageUrl,
        r2Key: uploaded.r2Key,
        altText: baseName ? baseName.slice(0, 120) : null,
        sortOrder: nextImages.length,
      });
      completedBatchCount.value += 1;
      emit('update:modelValue', normalizeOrder(nextImages));
    }
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Tải ảnh lên thất bại. Vui lòng thử lại.';
  } finally {
    totalBatchCount.value = 0;
    completedBatchCount.value = 0;
    emit('uploading-change', false);
  }
}

function setAsPrimary(index: number) {
  if (index <= 0 || index >= props.modelValue.length) return;
  const copy = [...props.modelValue];
  const [chosen] = copy.splice(index, 1);
  copy.unshift(chosen);
  emit('update:modelValue', normalizeOrder(copy));
}

function removeImage(index: number) {
  if (index < 0 || index >= props.modelValue.length) return;
  const copy = [...props.modelValue];
  copy.splice(index, 1);
  emit('update:modelValue', normalizeOrder(copy));
}

function updateAltText(index: number, value: string) {
  if (index < 0 || index >= props.modelValue.length) return;
  const copy = [...props.modelValue];
  copy[index] = {
    ...copy[index],
    altText: value,
  };
  emit('update:modelValue', normalizeOrder(copy));
}
</script>

<template>
  <fieldset class="space-y-2.5 border-0 p-0 m-0 min-w-0">
    <div class="flex items-center justify-between gap-2">
      <legend class="text-xs font-bold text-slate-800 p-0">
        Hình ảnh sản phẩm ({{ modelValue.length }}/{{ maxImages }})
      </legend>
    </div>

    <p :id="hintId" class="text-[11px] text-slate-500 leading-relaxed">
      Hỗ trợ WebP, PNG, JPG, AVIF — tối đa 5 MB/ảnh. Ảnh đầu tiên sẽ hiển thị làm ảnh đại diện trên gian hàng.
    </p>

    <div class="relative">
      <input
        ref="fileInputRef"
        :id="inputId"
        name="productImages"
        type="file"
        accept="image/webp,image/png,image/jpeg,image/avif"
        multiple
        :disabled="disabled || isUploading || remainingSlots === 0"
        :aria-describedby="describedByIds"
        :aria-invalid="errorMessage ? 'true' : undefined"
        class="ec-visually-hidden ec-upload-input"
        @change="handleFileSelection"
      />
      <label
        :for="inputId"
        class="ec-upload-trigger flex flex-col items-center justify-center gap-1.5 px-4 py-4 rounded-2xl border-2 border-dashed transition text-center"
        :class="
          disabled || isUploading || remainingSlots === 0
            ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
            : 'border-slate-300 bg-slate-50/70 hover:border-brand-500 hover:bg-brand-50/40 text-slate-700 cursor-pointer'
        "
      >
        <UploadCloud class="w-5 h-5 text-brand-600" aria-hidden="true" />
        <span class="text-xs font-bold">
          {{
            remainingSlots === 0
              ? 'Đã đạt số lượng ảnh tối đa'
              : 'Chọn tệp ảnh từ thiết bị để tải lên Cloudflare R2'
          }}
        </span>
      </label>
    </div>

    <!-- Native progress element for interstitial upload progress instead of noisy aria-live -->
    <div v-if="isUploading" class="space-y-1">
      <div class="flex items-center justify-between text-[11px] font-semibold text-brand-700">
        <span>Đang tải ảnh lên R2 ({{ completedBatchCount }}/{{ totalBatchCount }})...</span>
      </div>
      <progress
        :value="completedBatchCount"
        :max="totalBatchCount"
        class="w-full h-2 rounded-full overflow-hidden accent-brand-600"
      >
        {{ completedBatchCount }} / {{ totalBatchCount }}
      </progress>
    </div>

    <!-- Error feedback announced via role="alert" -->
    <div
      v-if="errorMessage"
      :id="errorId"
      role="alert"
      class="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2"
    >
      <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <span>{{ errorMessage }}</span>
    </div>

    <!-- Ordered gallery list with explicit role="list" to preserve semantics in Safari under CSS Grid -->
    <ol
      v-if="modelValue.length > 0"
      role="list"
      class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 list-none p-0 m-0"
    >
      <li
        v-for="(img, idx) in modelValue"
        :key="img.r2Key"
        class="p-2 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col gap-2"
      >
        <div class="relative aspect-square rounded-xl overflow-hidden bg-white border border-slate-100">
          <img
            :src="img.imageUrl"
            :alt="img.altText || `Ảnh sản phẩm thứ ${idx + 1}`"
            class="w-full h-full object-cover"
          />
          <span
            v-if="idx === 0"
            class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-slate-900/85 text-white text-[10px] font-bold"
          >
            Ảnh đại diện
          </span>
        </div>

        <div>
          <label :for="`${inputId}-alt-${idx}`" class="block text-[10px] font-semibold text-slate-600 mb-0.5">
            Mô tả ảnh #{{ idx + 1 }}
          </label>
          <input
            :id="`${inputId}-alt-${idx}`"
            :name="`imageAlt_${idx}`"
            type="text"
            maxlength="255"
            :value="img.altText || ''"
            placeholder="Ví dụ: Mặt trước sản phẩm"
            class="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px]"
            @input="updateAltText(idx, ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="flex items-center justify-between gap-1 pt-0.5">
          <button
            v-if="idx > 0"
            type="button"
            :aria-label="`Đặt làm ảnh đại diện cho ảnh thứ ${idx + 1}`"
            class="ec-img-action-btn inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-brand-400 text-[10px] font-semibold text-slate-700"
            @click="setAsPrimary(idx)"
          >
            <Star class="w-3 h-3 text-amber-500" aria-hidden="true" />
            <span>Đại diện</span>
          </button>
          <span v-else class="text-[10px] font-semibold text-emerald-700 px-1">Ảnh chính</span>

          <button
            type="button"
            :aria-label="`Xóa ảnh sản phẩm thứ ${idx + 1}`"
            class="ec-img-action-btn inline-flex items-center gap-1 px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-100/70 text-[10px] font-semibold"
            @click="removeImage(idx)"
          >
            <Trash2 class="w-3 h-3" aria-hidden="true" />
            <span>Xóa</span>
          </button>
        </div>
      </li>
    </ol>
  </fieldset>
</template>

<style scoped>
.ec-visually-hidden {
  position: absolute;
  clip-path: inset(50%);
  overflow: hidden;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  white-space: nowrap;
}

.ec-upload-input:focus-visible + .ec-upload-trigger {
  outline: 3px solid #0284c7;
  outline-offset: 2px;
}

.ec-img-action-btn {
  min-block-size: 24px;
  min-inline-size: 24px;
}

.ec-img-action-btn:focus-visible {
  outline: 2px solid #0284c7;
  outline-offset: 2px;
}
</style>
