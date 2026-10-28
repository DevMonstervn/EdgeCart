<script setup lang="ts">
import Toast from '../components/Toast.vue';
import { Zap, ShieldCheck } from 'lucide-vue-next';
</script>

<template>
  <div class="min-h-screen flex flex-col justify-center bg-slate-50 py-12 sm:px-6 lg:px-8 relative overflow-hidden">
    <!-- Background Edge Glow Decoration -->
    <div class="absolute -top-40 -right-40 w-96 h-96 bg-brand-200/40 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl pointer-events-none"></div>

    <div class="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10 px-4">
      <RouterLink to="/" class="inline-flex items-center gap-2.5 mb-6">
        <div class="w-11 h-11 rounded-2xl bg-brand-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-brand-600/30">
          EC
        </div>
        <span class="text-2xl font-black tracking-tight text-slate-900">EdgeCart</span>
      </RouterLink>

      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold mb-4">
        <Zap class="w-3.5 h-3.5 text-emerald-600" />
        Xác thực bảo mật tại Cloudflare Edge
      </div>
    </div>

    <div class="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
      <div class="bg-white py-8 px-6 sm:px-10 shadow-xl shadow-slate-200/50 rounded-3xl border border-slate-100">
        <slot />
      </div>

      <div class="mt-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
        <ShieldCheck class="w-4 h-4 text-emerald-600" />
        <span>Bảo vệ bởi Cloudflare WAF & WebCrypto Encryption</span>
      </div>
    </div>

    <Toast />
  </div>
</template>
