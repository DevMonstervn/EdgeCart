<script setup lang="ts">
import { PackageOpen } from 'lucide-vue-next';

withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    actionText?: string;
    actionTo?: string;
  }>(),
  {
    title: 'Không có dữ liệu',
    description: 'Chưa có thông tin hoặc sản phẩm nào trong mục này.',
  }
);

defineEmits<{
  (e: 'action'): void;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-white rounded-2xl border border-slate-100 shadow-sm max-w-md mx-auto my-8">
    <div class="w-16 h-16 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mb-4">
      <slot name="icon">
        <PackageOpen class="w-8 h-8 stroke-1 text-slate-400" />
      </slot>
    </div>

    <h3 class="text-lg font-bold text-slate-800 mb-1">{{ title }}</h3>
    <p class="text-sm text-slate-500 mb-6 max-w-xs">{{ description }}</p>

    <div v-if="actionText">
      <RouterLink
        v-if="actionTo"
        :to="actionTo"
        class="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm transition shadow-sm active:scale-95"
      >
        {{ actionText }}
      </RouterLink>
      <button
        v-else
        @click="$emit('action')"
        class="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm transition shadow-sm active:scale-95"
      >
        {{ actionText }}
      </button>
    </div>
  </div>
</template>
