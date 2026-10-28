<script setup lang="ts">
import { useRouter } from 'vue-router';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import { Compass } from 'lucide-vue-next';

const router = useRouter();
</script>

<template>
  <DefaultLayout>
    <div class="min-h-[60vh] flex items-center justify-center px-4">
      <div class="text-center max-w-md py-12">
        <div class="w-20 h-20 bg-emerald-50 text-brand-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Compass class="w-10 h-10 stroke-1" />
        </div>
        <h1 class="text-6xl font-black text-slate-900 tracking-tight mb-2">404</h1>
        <h2 class="text-xl font-bold text-slate-800 mb-2">Không tìm thấy trang</h2>
        <p class="text-xs sm:text-sm text-slate-500 mb-8 leading-relaxed">
          Đường dẫn bạn yêu cầu không tồn tại hoặc đã được chuyển đến vị trí khác trên Cloudflare Edge.
        </p>
        <button
          @click="router.push('/')"
          class="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-brand-600/20 active:scale-95 transition"
        >
          Quay lại Trang Chủ
        </button>
      </div>
    </div>
  </DefaultLayout>
</template>
