<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-50 px-4">
    <div class="text-center max-w-md">
      <h1 class="text-7xl font-extrabold text-brand-600 mb-4">404</h1>
      <h2 class="text-2xl font-bold text-slate-800 mb-2">Trang không tồn tại</h2>
      <p class="text-slate-600 text-sm mb-6">Đường dẫn bạn yêu cầu không khả dụng hoặc đã được di chuyển.</p>
      <button @click="router.push('/')" class="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition">
        Về trang chủ
      </button>
    </div>
  </div>
</template>
