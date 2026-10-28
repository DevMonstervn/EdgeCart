<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: 'card' | 'text' | 'table' | 'product-detail';
    count?: number;
  }>(),
  {
    type: 'card',
    count: 1,
  }
);
</script>

<template>
  <div>
    <!-- Product Card Skeleton -->
    <div v-if="type === 'card'" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <div
        v-for="i in count"
        :key="i"
        class="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm animate-pulse flex flex-col"
      >
        <div class="w-full aspect-square bg-slate-200 rounded-xl mb-3"></div>
        <div class="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
        <div class="h-3 bg-slate-200 rounded w-1/2 mb-3"></div>
        <div class="mt-auto flex items-center justify-between pt-2">
          <div class="h-5 bg-slate-200 rounded w-20"></div>
          <div class="h-8 w-8 bg-slate-200 rounded-lg"></div>
        </div>
      </div>
    </div>

    <!-- Table Skeleton -->
    <div v-else-if="type === 'table'" class="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm animate-pulse">
      <div class="h-8 bg-slate-200 rounded w-full mb-4"></div>
      <div v-for="i in count" :key="i" class="h-12 bg-slate-100 rounded w-full mb-2"></div>
    </div>

    <!-- Product Detail Skeleton -->
    <div v-else-if="type === 'product-detail'" class="grid grid-cols-1 md:grid-cols-2 gap-8 animate-pulse">
      <div class="aspect-square bg-slate-200 rounded-3xl w-full"></div>
      <div class="flex flex-col gap-4">
        <div class="h-6 bg-slate-200 rounded w-1/4"></div>
        <div class="h-8 bg-slate-200 rounded w-3/4"></div>
        <div class="h-7 bg-slate-200 rounded w-1/3"></div>
        <div class="h-24 bg-slate-100 rounded-2xl w-full mt-4"></div>
        <div class="h-12 bg-slate-200 rounded-xl w-full mt-6"></div>
      </div>
    </div>
  </div>
</template>
