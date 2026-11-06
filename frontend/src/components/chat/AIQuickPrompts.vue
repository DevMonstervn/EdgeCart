<script setup lang="ts">
import { Sparkles, ShoppingBag, Truck, Package, RotateCcw } from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'select', prompt: string): void;
}>();

const suggestions = [
  {
    icon: ShoppingBag,
    label: 'Tìm áo polo nam',
    prompt: 'Tìm cho tôi các mẫu áo polo nam thể thao chất lượng',
  },
  {
    icon: Sparkles,
    label: 'Đồ đẹp dưới 300k',
    prompt: 'Gợi ý các sản phẩm thời trang giá dưới 300.000 VNĐ',
  },
  {
    icon: Truck,
    label: 'Freeship thế nào?',
    prompt: 'Chính sách miễn phí vận chuyển của EdgeCart như thế nào?',
  },
  {
    icon: Package,
    label: 'Tra cứu đơn hàng',
    prompt: 'Kiểm tra trạng thái đơn hàng gần đây của tôi',
  },
  {
    icon: RotateCcw,
    label: 'Chính sách đổi trả',
    prompt: 'Quy định đổi trả và hoàn tiền của EdgeCart ra sao?',
  },
];
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
      <Sparkles class="w-3.5 h-3.5 text-brand-500" />
      <span>Gợi ý câu hỏi nhanh:</span>
    </div>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="item in suggestions"
        :key="item.label"
        type="button"
        @click="emit('select', item.prompt)"
        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-50 text-slate-600 hover:text-brand-700 text-xs font-semibold border border-transparent hover:border-brand-200 transition cursor-pointer active:scale-98"
      >
        <component :is="item.icon" class="w-3 h-3 text-brand-500 shrink-0" />
        <span>{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>
