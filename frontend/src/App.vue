<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { useCartStore } from './stores/cart.js';
import ConfirmModal from './components/ConfirmModal.vue';

const auth = useAuthStore();
const cart = useCartStore();

onMounted(async () => {
  if (auth.isAuthenticated) {
    await auth.fetchProfile();
    await cart.fetchBackendCart();
  }
});
</script>

<template>
  <RouterView />
  <ConfirmModal />
</template>
