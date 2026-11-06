<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue';
import { useAIChatStore } from '../../stores/ai-chat.js';
import AIMessageBubble from './AIMessageBubble.vue';
import AIProductCard from './AIProductCard.vue';
import AIQuickPrompts from './AIQuickPrompts.vue';
import {
  X,
  Send,
  Sparkles,
  Bot,
  Plus,
  History,
  Trash2,
  Loader2,
  Square,
  ChevronDown,
  Info,
} from 'lucide-vue-next';

const aiChat = useAIChatStore();
const inputText = ref('');
const messagesContainer = ref<HTMLDivElement | null>(null);
const isHistoryOpen = ref(false);

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}

watch(
  () => [aiChat.messages.length, aiChat.currentStreamingText],
  () => {
    scrollToBottom();
  }
);

onMounted(() => {
  if (aiChat.isOpen) {
    scrollToBottom();
  }
});

function handleSend() {
  const text = inputText.value.trim();
  if (!text || aiChat.isStreaming) return;
  inputText.value = '';
  aiChat.sendMessage(text);
  scrollToBottom();
}

function handleSelectPrompt(prompt: string) {
  inputText.value = '';
  aiChat.sendMessage(prompt);
  scrollToBottom();
}

function handleNewChat() {
  aiChat.startNewConversation();
  isHistoryOpen.value = false;
}

function handleSelectHistory(id: string) {
  aiChat.selectConversation(id);
  isHistoryOpen.value = false;
  scrollToBottom();
}
</script>

<template>
  <div
    v-if="aiChat.isOpen"
    class="fixed z-50 flex flex-col bg-white shadow-2xl transition-all duration-300 overflow-hidden border border-slate-200/80
      inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[420px] sm:h-[620px] sm:rounded-3xl"
  >
    <!-- Header -->
    <div
      class="px-4 py-3 bg-gradient-to-r from-brand-700 via-brand-600 to-indigo-700 text-white flex items-center justify-between shrink-0 shadow-xs"
    >
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center font-bold text-white shadow-xs">
          <Sparkles class="w-4 h-4 text-amber-300" />
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <h3 class="font-black text-sm tracking-tight text-white">EdgeCart AI Assistant</h3>
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Sẵn sàng" />
          </div>
          <p class="text-[10px] text-brand-100 font-medium">Trợ lý mua sắm & chăm sóc khách hàng</p>
        </div>
      </div>

      <!-- Header Action Controls -->
      <div class="flex items-center gap-1">
        <!-- History Toggle -->
        <button
          type="button"
          @click="isHistoryOpen = !isHistoryOpen"
          class="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition text-brand-100 hover:text-white cursor-pointer"
          title="Lịch sử hội thoại"
        >
          <History class="w-4 h-4" />
        </button>

        <!-- New Chat Button -->
        <button
          type="button"
          @click="handleNewChat"
          class="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition text-brand-100 hover:text-white cursor-pointer"
          title="Cuộc trò chuyện mới"
        >
          <Plus class="w-4 h-4" />
        </button>

        <!-- Close Drawer -->
        <button
          type="button"
          @click="aiChat.closeChat"
          class="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition text-brand-100 hover:text-white cursor-pointer"
          title="Đóng"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- History Sliding Overlay -->
    <div
      v-if="isHistoryOpen"
      class="absolute top-14 inset-x-0 bottom-0 bg-white z-20 p-4 flex flex-col space-y-3 animate-in fade-in slide-in-from-top-4 duration-200"
    >
      <div class="flex items-center justify-between pb-2 border-b border-slate-100">
        <h4 class="text-xs font-bold text-slate-800">Lịch sử các cuộc trò chuyện</h4>
        <button
          type="button"
          @click="isHistoryOpen = false"
          class="text-xs font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          Quay lại
        </button>
      </div>

      <div class="flex-1 overflow-y-auto space-y-1.5">
        <div v-if="aiChat.conversations.length === 0" class="p-6 text-center text-xs text-slate-400">
          Chưa có lịch sử cuộc trò chuyện nào.
        </div>
        <button
          v-for="c in aiChat.conversations"
          :key="c.id"
          type="button"
          @click="handleSelectHistory(c.id)"
          class="w-full p-2.5 rounded-xl text-left text-xs transition flex items-center justify-between cursor-pointer border"
          :class="
            aiChat.currentConversationId === c.id
              ? 'bg-brand-50 border-brand-200 text-brand-700 font-bold'
              : 'hover:bg-slate-50 border-transparent text-slate-700'
          "
        >
          <span class="truncate flex-1">{{ c.title }}</span>
          <span class="text-[10px] text-slate-400 shrink-0 ml-2">
            {{ new Date(c.updatedAt).toLocaleDateString('vi-VN') }}
          </span>
        </button>
      </div>

      <button
        v-if="aiChat.currentConversationId"
        type="button"
        @click="aiChat.deleteCurrentConversation"
        class="w-full py-2 px-3 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Trash2 class="w-3.5 h-3.5" />
        <span>Xóa cuộc trò chuyện hiện tại</span>
      </button>
    </div>

    <!-- Messages Container -->
    <div
      ref="messagesContainer"
      class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50"
    >
      <!-- Empty State / Welcome Screen -->
      <div v-if="aiChat.messages.length === 0 && !aiChat.isStreaming" class="py-6 text-center space-y-4">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-md">
          <Bot class="w-8 h-8" />
        </div>
        <div>
          <h4 class="text-sm font-black text-slate-900 mb-1">Chào mừng bạn đến với EdgeCart AI!</h4>
          <p class="text-xs text-slate-500 max-w-xs mx-auto">
            Tôi có thể hỗ trợ bạn tìm sản phẩm chính hãng, so sánh giá, tư vấn theo ngân sách và tra cứu đơn hàng nhanh chóng.
          </p>
        </div>

        <!-- Quick Suggestions -->
        <div class="pt-2 text-left">
          <AIQuickPrompts @select="handleSelectPrompt" />
        </div>
      </div>

      <!-- Messages Stream -->
      <template v-else>
        <AIMessageBubble
          v-for="msg in aiChat.messages"
          :key="msg.id"
          :message="msg"
          @navigate="aiChat.closeChat"
        />

        <!-- Active Streaming Bubble -->
        <div
          v-if="aiChat.isStreaming && (aiChat.currentStreamingText || aiChat.currentStreamingProducts.length > 0)"
          class="flex gap-2.5 sm:gap-3 flex-row"
        >
          <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-brand-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Bot class="w-4 h-4" />
          </div>
          <div class="max-w-[85%] sm:max-w-[80%] space-y-2">
            <!-- Streaming text with blinking cursor -->
            <div
              v-if="aiChat.currentStreamingText"
              class="px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-800 rounded-tl-xs shadow-xs text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words"
            >
              {{ aiChat.currentStreamingText }}<span class="inline-block w-1.5 h-3.5 bg-brand-600 animate-pulse ml-0.5" />
            </div>

            <!-- Streaming Products Preview -->
            <div
              v-if="aiChat.currentStreamingProducts.length > 0"
              class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1"
            >
              <AIProductCard
                v-for="p in aiChat.currentStreamingProducts"
                :key="p.id"
                :product="p"
                @navigate="aiChat.closeChat"
              />
            </div>
          </div>
        </div>

        <!-- Typing Indicator when waiting for initial stream -->
        <div
          v-if="aiChat.isStreaming && !aiChat.currentStreamingText && aiChat.currentStreamingProducts.length === 0"
          class="flex items-center gap-2 text-xs text-slate-400 pl-2"
        >
          <div class="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center">
            <Bot class="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div class="flex items-center gap-1 bg-white border border-slate-200 px-3 py-2 rounded-2xl shadow-xs">
            <span class="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" />
            <span class="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce [animation-delay:0.2s]" />
            <span class="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce [animation-delay:0.4s]" />
          </div>
        </div>
      </template>

      <!-- Error State Banner -->
      <div
        v-if="aiChat.error"
        class="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between"
      >
        <span>{{ aiChat.error }}</span>
      </div>
    </div>

    <!-- Input Footer -->
    <div class="p-3 bg-white border-t border-slate-100 shrink-0 space-y-2">
      <form @submit.prevent="handleSend" class="flex items-center gap-2">
        <input
          v-model="inputText"
          type="text"
          placeholder="Hỏi về sản phẩm, đơn hàng, chính sách..."
          class="flex-1 px-3.5 py-2.5 bg-slate-100 focus:bg-white border border-transparent focus:border-brand-500 rounded-2xl text-xs sm:text-sm focus:outline-hidden transition"
          :disabled="aiChat.isStreaming"
        />
        <button
          v-if="aiChat.isStreaming"
          type="button"
          @click="aiChat.cancelStreaming"
          class="w-10 h-10 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center transition shadow-xs cursor-pointer active:scale-95 shrink-0"
          title="Dừng phản hồi"
        >
          <Square class="w-3.5 h-3.5 fill-current text-white" />
        </button>
        <button
          v-else
          type="submit"
          :disabled="!inputText.trim()"
          class="w-10 h-10 rounded-2xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition shadow-xs cursor-pointer active:scale-95 shrink-0"
          title="Gửi tin nhắn"
        >
          <Send class="w-4 h-4" />
        </button>
      </form>
      <div class="text-[10px] text-center text-slate-400 flex items-center justify-center gap-1">
        <Info class="w-3 h-3 text-slate-400 shrink-0" />
        <span>Trợ lý AI tra cứu trực tiếp dữ liệu chính xác từ hệ sinh thái EdgeCart</span>
      </div>
    </div>
  </div>
</template>
