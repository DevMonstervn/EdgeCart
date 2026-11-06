<script setup lang="ts">
import { useAIChatStore } from '../../stores/ai-chat.js';
import { Sparkles, Bot, MessageSquare } from 'lucide-vue-next';

const aiChat = useAIChatStore();
</script>

<template>
  <div class="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40">
    <!-- Floating Launcher Trigger Button -->
    <button
      type="button"
      @click="aiChat.toggleChat"
      class="group relative flex items-center justify-center w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-brand-700 via-brand-600 to-indigo-600 text-white shadow-xl hover:shadow-brand-500/30 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer"
      title="Hỏi Trợ lý AI EdgeCart"
    >
      <!-- Glow Pulse Effect -->
      <span
        class="absolute -inset-1 rounded-full bg-gradient-to-r from-brand-500 to-indigo-500 opacity-40 blur-xs group-hover:opacity-75 animate-pulse transition duration-500"
      />

      <!-- Icon -->
      <div class="relative z-10 flex items-center justify-center">
        <Sparkles class="w-6 h-6 text-amber-300 group-hover:rotate-12 transition-transform duration-300" />
      </div>

      <!-- Online Indicator Dot -->
      <span
        class="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white z-20 animate-pulse"
      />

      <!-- Floating Tooltip on Hover (Desktop) -->
      <div
        class="hidden sm:group-hover:flex absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-slate-900/90 text-white text-xs font-bold whitespace-nowrap shadow-lg backdrop-blur-xs items-center gap-1.5 pointer-events-none transition-all animate-in fade-in zoom-in-95"
      >
        <span>Trợ lý AI EdgeCart</span>
      </div>
    </button>
  </div>
</template>
