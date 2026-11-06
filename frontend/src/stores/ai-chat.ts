import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AIConversation, AIMessage, AIProductCardData } from '@edgecart/shared';
import { aiService } from '../services/ai.service.js';

export const useAIChatStore = defineStore('aiChat', () => {
  const isOpen = ref(false);
  const conversations = ref<AIConversation[]>([]);
  const currentConversationId = ref<string | null>(null);
  const messages = ref<AIMessage[]>([]);
  const isStreaming = ref(false);
  const currentStreamingText = ref('');
  const currentStreamingProducts = ref<AIProductCardData[]>([]);
  const error = ref<string | null>(null);

  let activeAbortController: AbortController | null = null;

  const currentConversation = computed(() => {
    return conversations.value.find((c) => c.id === currentConversationId.value) || null;
  });

  function cancelStreaming() {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    if (isStreaming.value) {
      isStreaming.value = false;
      if (currentStreamingText.value) {
        messages.value.push({
          id: `asst_aborted_${Date.now()}`,
          conversationId: currentConversationId.value || 'temp',
          role: 'assistant',
          content: currentStreamingText.value,
          metadata: {
            products:
              currentStreamingProducts.value.length > 0
                ? currentStreamingProducts.value
                : undefined,
          },
          createdAt: new Date().toISOString(),
        });
        currentStreamingText.value = '';
        currentStreamingProducts.value = [];
      }
    }
  }

  function toggleChat() {
    if (isOpen.value) {
      closeChat();
    } else {
      openChat();
    }
  }

  function openChat() {
    isOpen.value = true;
    if (conversations.value.length === 0) {
      loadConversations();
    }
  }

  function closeChat() {
    cancelStreaming();
    isOpen.value = false;
  }

  async function loadConversations() {
    try {
      conversations.value = await aiService.listConversations();
    } catch {
      conversations.value = [];
    }
  }

  async function selectConversation(id: string) {
    if (currentConversationId.value === id) return;
    cancelStreaming();
    currentConversationId.value = id;
    error.value = null;

    const data = await aiService.getConversation(id);
    if (data) {
      messages.value = data.messages;
    } else {
      messages.value = [];
    }
  }

  function startNewConversation() {
    cancelStreaming();
    currentConversationId.value = null;
    messages.value = [];
    currentStreamingText.value = '';
    currentStreamingProducts.value = [];
    error.value = null;
  }

  async function deleteCurrentConversation() {
    if (!currentConversationId.value) return;
    cancelStreaming();
    const targetId = currentConversationId.value;
    const success = await aiService.deleteConversation(targetId);
    if (success) {
      conversations.value = conversations.value.filter((c) => c.id !== targetId);
      startNewConversation();
    }
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming.value) return;

    error.value = null;
    isStreaming.value = true;
    currentStreamingText.value = '';
    currentStreamingProducts.value = [];

    // Optimistically add user message to list
    const tempUserMsgId = `usr_temp_${Date.now()}`;
    messages.value.push({
      id: tempUserMsgId,
      conversationId: currentConversationId.value || 'temp',
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    });

    cancelStreaming();
    activeAbortController = new AbortController();

    try {
      await aiService.streamMessage({
        conversationId: currentConversationId.value,
        message: trimmed,
        signal: activeAbortController.signal,
        onChunk: (chunk) => {
          if (chunk.type === 'metadata') {
            if (chunk.conversationId) {
              currentConversationId.value = chunk.conversationId;
              // If new conversation, add to conversations list
              const exists = conversations.value.find((c) => c.id === chunk.conversationId);
              if (!exists && chunk.title) {
                conversations.value.unshift({
                  id: chunk.conversationId,
                  title: chunk.title,
                  status: 'ACTIVE',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
              }
            }
          } else if (chunk.type === 'text_delta' && chunk.delta) {
            currentStreamingText.value += chunk.delta;
          } else if (chunk.type === 'product_cards' && chunk.products) {
            currentStreamingProducts.value = chunk.products;
          } else if (chunk.type === 'error' && chunk.error) {
            error.value = chunk.error;
          } else if (chunk.type === 'done') {
            // Append final assistant message
            const assistantMsg: AIMessage = {
              id: `asst_${Date.now()}`,
              conversationId: currentConversationId.value || 'temp',
              role: 'assistant',
              content: currentStreamingText.value,
              metadata: {
                ...(chunk.metadata || {}),
                products:
                  currentStreamingProducts.value.length > 0
                    ? currentStreamingProducts.value
                    : chunk.metadata?.products,
              },
              createdAt: new Date().toISOString(),
            };
            messages.value.push(assistantMsg);
            currentStreamingText.value = '';
            currentStreamingProducts.value = [];
          }
        },
        onComplete: () => {
          isStreaming.value = false;
          activeAbortController = null;
        },
        onError: (err) => {
          isStreaming.value = false;
          activeAbortController = null;
          error.value = err.message || 'Không thể kết nối đến Trợ lý AI';
          // Also append fallback message
          if (currentStreamingText.value) {
            messages.value.push({
              id: `asst_err_${Date.now()}`,
              conversationId: currentConversationId.value || 'temp',
              role: 'assistant',
              content: currentStreamingText.value,
              createdAt: new Date().toISOString(),
            });
            currentStreamingText.value = '';
          }
        },
      });
    } catch (err: unknown) {
      isStreaming.value = false;
      activeAbortController = null;
      error.value = err instanceof Error ? err.message : 'Lỗi gửi tin nhắn';
    }
  }

  return {
    isOpen,
    conversations,
    currentConversationId,
    currentConversation,
    messages,
    isStreaming,
    currentStreamingText,
    currentStreamingProducts,
    error,
    toggleChat,
    openChat,
    closeChat,
    loadConversations,
    selectConversation,
    startNewConversation,
    deleteCurrentConversation,
    cancelStreaming,
    sendMessage,
  };
});
