<script setup lang="ts">
import { useToastStore } from '../stores/toast.js';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-vue-next';

const toastStore = useToastStore();
</script>

<template>
  <div
    class="fixed bottom-20 md:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    aria-live="polite"
  >
    <TransitionGroup
      enter-active-class="transform ease-out duration-300 transition"
      enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
      enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-for="toast in toastStore.toasts"
        :key="toast.id"
        class="pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border text-sm backdrop-blur-md transition-all"
        :class="{
          'bg-white/95 border-emerald-200 text-slate-800': toast.type === 'success',
          'bg-white/95 border-rose-200 text-slate-800': toast.type === 'error',
          'bg-white/95 border-slate-200 text-slate-800': toast.type === 'info',
        }"
      >
        <CheckCircle2 v-if="toast.type === 'success'" class="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <AlertCircle v-else-if="toast.type === 'error'" class="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
        <Info v-else class="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />

        <div class="flex-1 font-medium leading-tight">
          {{ toast.message }}
        </div>

        <button
          @click="toastStore.remove(toast.id)"
          class="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg transition"
          aria-label="Đóng thông báo"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
