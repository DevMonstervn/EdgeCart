<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useCartStore } from '../stores/cart.js';
import { useToastStore } from '../stores/toast.js';
import AuthLayout from '../layouts/AuthLayout.vue';
import { Mail, Lock, Loader2, AlertCircle } from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const cart = useCartStore();
const toast = useToastStore();

const email = ref('');
const password = ref('');
const rememberMe = ref(true);
const localError = ref<string | null>(null);
const isSubmitting = ref(false);

async function handleLogin() {
  localError.value = null;

  if (!email.value || !password.value) {
    localError.value = 'Vui lòng nhập đầy đủ email và mật khẩu';
    return;
  }

  isSubmitting.value = true;
  try {
    await auth.login({
      email: email.value.trim(),
      password: password.value,
    });

    toast.success('Đăng nhập thành công!');

    // Automatically merge guest cart with server cart
    await cart.mergeGuestCart();

    // Redirect to target route or Home
    const redirectUrl = (route.query.redirect as string) || '/';
    router.push(redirectUrl);
  } catch (err: unknown) {
    localError.value = err instanceof Error ? err.message : 'Sai tài khoản hoặc mật khẩu';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <div class="space-y-6">
      <div class="text-center">
        <h2 class="text-xl font-black text-slate-900 tracking-tight">Đăng Nhập</h2>
        <p class="text-xs text-slate-500 mt-1">Chào mừng bạn quay trở lại với EdgeCart</p>
      </div>

      <!-- Error Alert -->
      <div
        v-if="localError"
        class="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
      >
        <AlertCircle class="w-4 h-4 shrink-0" />
        <span>{{ localError }}</span>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleLogin" class="space-y-4">
        <!-- Email -->
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Email</label>
          <div class="relative">
            <input
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="name@example.com"
              class="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            />
            <Mail class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <!-- Password -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs font-bold text-slate-700">Mật khẩu</label>
            <a href="#" class="text-[11px] font-semibold text-brand-600 hover:text-brand-700">Quên mật khẩu?</a>
          </div>
          <div class="relative">
            <input
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              placeholder="••••••••"
              class="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            />
            <Lock class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <!-- Remember Me -->
        <div class="flex items-center">
          <input
            id="remember-me"
            v-model="rememberMe"
            type="checkbox"
            class="h-4 w-4 text-brand-600 focus:ring-brand-500 border-slate-300 rounded"
          />
          <label for="remember-me" class="ml-2 block text-xs text-slate-600 font-medium">
            Ghi nhớ phiên đăng nhập
          </label>
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full py-3.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white font-bold text-sm shadow-md shadow-brand-600/30 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
          <span>{{ isSubmitting ? 'Đang xác thực...' : 'Đăng nhập ngay' }}</span>
        </button>
      </form>

      <!-- Bottom Switch to Register -->
      <div class="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
        Chưa có tài khoản?
        <RouterLink to="/register" class="font-bold text-brand-600 hover:text-brand-700 ml-1">
          Đăng ký tài khoản mới
        </RouterLink>
      </div>
    </div>
  </AuthLayout>
</template>
