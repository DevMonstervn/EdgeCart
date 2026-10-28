<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

const props = defineProps<{
  page: number;
  totalPages: number;
}>();

const emit = defineEmits<{
  (e: 'change', newPage: number): void;
}>();

function goTo(p: number) {
  if (p >= 1 && p <= props.totalPages && p !== props.page) {
    emit('change', p);
  }
}
</script>

<template>
  <div v-if="totalPages > 1" class="flex items-center justify-center gap-1.5 my-8 select-none">
    <button
      @click="goTo(page - 1)"
      :disabled="page <= 1"
      class="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
      aria-label="Trang trước"
    >
      <ChevronLeft class="w-4 h-4" />
    </button>

    <div class="flex items-center gap-1 px-2 text-sm font-semibold text-slate-700">
      <span>Trang {{ page }} / {{ totalPages }}</span>
    </div>

    <button
      @click="goTo(page + 1)"
      :disabled="page >= totalPages"
      class="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
      aria-label="Trang sau"
    >
      <ChevronRight class="w-4 h-4" />
    </button>
  </div>
</template>
