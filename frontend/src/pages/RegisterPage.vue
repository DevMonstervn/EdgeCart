<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useCartStore } from '../stores/cart.js';
import { useToastStore } from '../stores/toast.js';
import AuthLayout from '../layouts/AuthLayout.vue';
import { User, Mail, Phone, Lock, Loader2, AlertCircle } from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const cart = useCartStore();
const toast = useToastStore();

const fullName = ref('');
const email = ref('');
const phone = ref('');
const password = ref('');
const confirmPassword = ref('');

const localError = ref<string | null>(null);
const isSubmitting = ref(false);

async function handleRegister() {
  localError.value = null;

  if (!fullName.value.trim() || fullName.value.length < 2) {
    localError.value = 'Họ và tên tối thiểu 2 ký tự';
    return;
  }

  if (!email.value.trim() || !email.value.includes('@')) {
    localError.value = 'Email không hợp lệ';
    return;
  }

  if (password.value.length < 8) {
    localError.value = 'Mật khẩu phải có tối thiểu 8 ký tự';
    return;
  }

  if (password.value !== confirmPassword.value) {
    localError.value = 'Xác nhận mật khẩu không khớp';
    return;
  }

  isSubmitting.value = true;
  try {
    await auth.register({
      fullName: fullName.value.trim(),
      email: email.value.trim(),
      phone: phone.value.trim() || undefined,
      password: password.value,
    });

    toast.success('Đăng ký tài khoản thành công!');
    await cart.mergeGuestCart();
    const redirectUrl = (route.query.redirect as string) || '/';
    router.push(redirectUrl);
  } catch (err: unknown) {
    localError.value = err instanceof Error ? err.message : 'Đăng ký không thành công';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <div class="space-y-6">
      <div class="text-center">
        <h2 class="text-xl font-black text-slate-900 tracking-tight">Tạo Tài Khoản Mới</h2>
        <p class="text-xs text-slate-500 mt-1">Đăng ký để nhận ưu đãi thành viên và lưu trữ đơn hàng</p>
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
      <form @submit.prevent="handleRegister" class="space-y-4">
        <!-- Full Name -->
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Họ và tên</label>
          <div class="relative">
            <input
              v-model="fullName"
              type="text"
              required
              placeholder="Nguyễn Văn A"
              class="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            />
            <User class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

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

        <!-- Phone -->
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Số điện thoại (Tùy chọn)</label>
          <div class="relative">
            <input
              v-model="phone"
              type="tel"
              placeholder="0912345678"
              class="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            />
            <Phone class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <!-- Password -->
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Mật khẩu (Tối thiểu 8 ký tự)</label>
          <div class="relative">
            <input
              v-model="password"
              type="password"
              required
              autocomplete="new-password"
              placeholder="••••••••"
              class="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            />
            <Lock class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <!-- Confirm Password -->
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Nhập lại mật khẩu</label>
          <div class="relative">
            <input
              v-model="confirmPassword"
              type="password"
              required
              autocomplete="new-password"
              placeholder="••••••••"
              class="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:border-brand-500 transition"
            />
            <Lock class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full py-3.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white font-bold text-sm shadow-md shadow-brand-600/30 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
          <span>{{ isSubmitting ? 'Đang tạo tài khoản...' : 'Hoàn tất đăng ký' }}</span>
        </button>
      </form>

      <!-- Bottom Switch to Login -->
      <div class="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
        Đã có tài khoản?
        <RouterLink :to="{ path: '/login', query: route.query.redirect ? { redirect: route.query.redirect } : {} }" class="font-bold text-brand-600 hover:text-brand-700 ml-1">
          Đăng nhập ngay
        </RouterLink>
      </div>
    </div>
  </AuthLayout>
</template>
