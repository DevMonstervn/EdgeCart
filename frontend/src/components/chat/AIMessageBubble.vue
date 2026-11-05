<script setup lang="ts">
import { computed } from 'vue';
import type { AIMessage } from '@edgecart/shared';
import AIProductCard from './AIProductCard.vue';
import {
  Bot,
  User,
  Package,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Truck,
  RotateCcw,
} from 'lucide-vue-next';

const props = defineProps<{
  message: AIMessage;
}>();

const emit = defineEmits<{
  (e: 'navigate'): void;
}>();

const isUser = computed(() => props.message.role === 'user');

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}
</script>

<template>
  <div class="flex gap-2.5 sm:gap-3" :class="isUser ? 'flex-row-reverse' : 'flex-row'">
    <!-- Avatar -->
    <div
      class="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 shadow-xs"
      :class="
        isUser
          ? 'bg-slate-800 text-white'
          : 'bg-gradient-to-tr from-brand-600 to-indigo-600 text-white font-bold'
      "
    >
      <User v-if="isUser" class="w-4 h-4" />
      <Bot v-else class="w-4 h-4" />
    </div>

    <!-- Bubble Content Container -->
    <div class="max-w-[85%] sm:max-w-[80%] space-y-2.5">
      <!-- Text Bubble -->
      <div
        class="px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words"
        :class="
          isUser
            ? 'bg-brand-600 text-white rounded-tr-xs shadow-xs'
            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs shadow-xs'
        "
      >
        {{ message.content }}
      </div>

      <!-- Rich Payload: Product Cards Carousel / Grid -->
      <div
        v-if="message.metadata?.products && message.metadata.products.length > 0"
        class="space-y-1.5 pt-1"
      >
        <div class="text-[11px] font-bold text-slate-500 flex items-center gap-1">
          <span>Gợi ý sản phẩm thực tế từ EdgeCart:</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <AIProductCard
            v-for="p in message.metadata.products"
            :key="p.id"
            :product="p"
            @navigate="emit('navigate')"
          />
        </div>
      </div>

      <!-- Rich Payload: Product Comparison Table -->
      <div
        v-if="message.metadata?.comparison"
        class="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs space-y-2 text-xs overflow-x-auto"
      >
        <div class="font-bold text-slate-900 flex items-center gap-1.5">
          <ShieldCheck class="w-4 h-4 text-brand-600" />
          <span>Bảng so sánh chi tiết:</span>
        </div>
        <table class="w-full text-left border-collapse min-w-[280px]">
          <thead>
            <tr class="border-b border-slate-100">
              <th class="py-1.5 px-2 font-bold text-slate-500">Đặc tính</th>
              <th
                v-for="prod in message.metadata.comparison.products"
                :key="prod.id"
                class="py-1.5 px-2 font-bold text-slate-900"
              >
                {{ prod.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="attr in message.metadata.comparison.attributes"
              :key="attr.name"
              class="border-b border-slate-50"
            >
              <td class="py-1.5 px-2 text-slate-500 font-medium">{{ attr.label }}</td>
              <td
                v-for="prod in message.metadata.comparison.products"
                :key="prod.id"
                class="py-1.5 px-2 font-bold text-slate-800"
              >
                {{ attr.values[prod.id] }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Rich Payload: Orders Summary -->
      <div
        v-if="message.metadata?.orders && message.metadata.orders.length > 0"
        class="space-y-2 pt-1"
      >
        <div
          v-for="ord in message.metadata.orders"
          :key="ord.id"
          class="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs space-y-2 text-xs text-left"
        >
          <div class="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <span class="font-bold text-slate-900 flex items-center gap-1.5">
              <Package class="w-3.5 h-3.5 text-brand-600" />
              <span>{{ ord.orderNumber }}</span>
            </span>
            <span
              class="text-[10px] font-bold px-2 py-0.5 rounded-full"
              :class="
                ord.shippingStatus === 'DELIVERED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              "
            >
              {{ ord.shippingStatus }}
            </span>
          </div>

          <div class="space-y-1 text-slate-600 text-[11px]">
            <div class="flex justify-between">
              <span>Tổng thanh toán:</span>
              <strong class="text-brand-700 font-bold">{{ formatVND(ord.totalAmount) }}</strong>
            </div>
            <div class="flex justify-between">
              <span>Phương thức:</span>
              <span>{{ ord.paymentMethod }} ({{ ord.paymentStatus }})</span>
            </div>
            <div class="flex justify-between">
              <span>Số lượng mặt hàng:</span>
              <span>{{ ord.itemsCount }} sản phẩm</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Rich Payload: Store Policy Highlights -->
      <div
        v-if="message.metadata?.policy"
        class="bg-brand-50/50 rounded-2xl border border-brand-200 p-3 text-xs space-y-1.5 text-left"
      >
        <div class="font-bold text-brand-900 flex items-center gap-1.5">
          <Truck v-if="message.metadata.policy.topic === 'shipping'" class="w-4 h-4 text-brand-600" />
          <RotateCcw v-else-if="message.metadata.policy.topic === 'return_refund'" class="w-4 h-4 text-brand-600" />
          <ShieldCheck v-else class="w-4 h-4 text-brand-600" />
          <span>{{ message.metadata.policy.title }}</span>
        </div>
        <p class="text-slate-700 font-medium">{{ message.metadata.policy.summary }}</p>
        <ul class="list-disc pl-4 space-y-0.5 text-slate-600 text-[11px]">
          <li v-for="(detail, idx) in message.metadata.policy.details" :key="idx">
            {{ detail }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
