<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useConfirmStore } from '../stores/confirm.js';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  X,
} from 'lucide-vue-next';

const confirmStore = useConfirmStore();

function handleKeydown(e: KeyboardEvent) {
  if (!confirmStore.isOpen) return;
  if (e.key === 'Escape') {
    confirmStore.handleCancel();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="confirmStore.isOpen"
        class="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
        @click.self="confirmStore.handleCancel()"
        role="dialog"
        aria-modal="true"
        :aria-label="confirmStore.title"
      >
        <div
          class="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-100 relative transform transition-all space-y-5"
        >
          <!-- Close Button -->
          <button
            @click="confirmStore.handleCancel()"
            class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
            aria-label="Đóng bảng xác nhận"
          >
            <X class="w-4 h-4" />
          </button>

          <!-- Header with Variant Icon -->
          <div class="flex items-start gap-4">
            <div
              v-if="confirmStore.variant === 'success'"
              class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0"
            >
              <CheckCircle2 class="w-6 h-6" />
            </div>
            <div
              v-else-if="confirmStore.variant === 'danger'"
              class="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0"
            >
              <AlertTriangle class="w-6 h-6" />
            </div>
            <div
              v-else-if="confirmStore.variant === 'warning'"
              class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0"
            >
              <AlertCircle class="w-6 h-6" />
            </div>
            <div
              v-else
              class="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 border border-brand-100 flex items-center justify-center shrink-0"
            >
              <HelpCircle class="w-6 h-6" />
            </div>

            <div class="min-w-0 pr-6">
              <h3 class="text-base sm:text-lg font-black text-slate-900 leading-tight">
                {{ confirmStore.title }}
              </h3>
              <p class="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed font-medium">
                {{ confirmStore.message }}
              </p>
            </div>
          </div>

          <!-- Optional Detailed Context / Description -->
          <div
            v-if="confirmStore.description"
            class="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-500 leading-relaxed"
          >
            {{ confirmStore.description }}
          </div>

          <!-- Actions Footer (Mobile-first, large tap targets) -->
          <div class="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              @click="confirmStore.handleCancel()"
              class="w-full sm:flex-1 py-3 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm transition text-center cursor-pointer min-h-[44px]"
            >
              {{ confirmStore.cancelText }}
            </button>

            <button
              type="button"
              @click="confirmStore.handleConfirm()"
              class="w-full sm:flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition text-center text-white shadow-md active:scale-98 cursor-pointer min-h-[44px]"
              :class="{
                'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20': confirmStore.variant === 'success',
                'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20': confirmStore.variant === 'danger',
                'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20': confirmStore.variant === 'warning',
                'bg-brand-600 hover:bg-brand-700 shadow-brand-600/20': confirmStore.variant === 'primary',
              }"
            >
              {{ confirmStore.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
