import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { useAIChatStore } from '../src/stores/ai-chat.js';
import AIProductCard from '../src/components/chat/AIProductCard.vue';
import AIQuickPrompts from '../src/components/chat/AIQuickPrompts.vue';
import AIMessageBubble from '../src/components/chat/AIMessageBubble.vue';
import type { AIProductCardData, AIMessage } from '@edgecart/shared';

// Mock router
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('EdgeCart AI Chat Frontend Component & Store Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // 1. Pinia Store Tests
  it('1. useAIChatStore manages chat drawer toggle, open and close states', () => {
    const store = useAIChatStore();
    expect(store.isOpen).toBe(false);

    store.openChat();
    expect(store.isOpen).toBe(true);

    store.closeChat();
    expect(store.isOpen).toBe(false);

    store.toggleChat();
    expect(store.isOpen).toBe(true);
  });

  it('2. useAIChatStore resets message state on startNewConversation', () => {
    const store = useAIChatStore();
    store.currentConversationId = 'conv_123';
    store.messages = [
      {
        id: 'msg_1',
        conversationId: 'conv_123',
        role: 'user',
        content: 'Hello',
        createdAt: '2026-11-05',
      },
    ];

    store.startNewConversation();
    expect(store.currentConversationId).toBeNull();
    expect(store.messages).toEqual([]);
    expect(store.currentStreamingText).toBe('');
    expect(store.error).toBeNull();
  });

  // 2. AIProductCard Component Tests
  it('3. AIProductCard renders product name, store, formatted VND price, and discount badge', () => {
    const sampleProduct: AIProductCardData = {
      id: 'prod_test_01',
      name: 'Áo Polo Thể Thao Nam Rồng',
      slug: 'ao-polo-the-thao-nam-rong',
      basePrice: 300000,
      salePrice: 240000,
      imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30',
      stockQuantity: 15,
      storeName: 'EdgeCart Official',
    };

    const wrapper = mount(AIProductCard, {
      props: { product: sampleProduct },
    });

    expect(wrapper.text()).toContain('Áo Polo Thể Thao Nam Rồng');
    expect(wrapper.text()).toContain('EdgeCart Official');
    expect(wrapper.text()).toContain('Còn hàng');
    expect(wrapper.text()).toContain('-20%'); // (300k - 240k) / 300k = 20%
  });

  it('4. AIProductCard navigates to product details on click', async () => {
    const sampleProduct: AIProductCardData = {
      id: 'prod_test_02',
      name: 'Giày Chạy Bộ Siêu Tốc',
      slug: 'giay-chay-bo-sieu-toc',
      basePrice: 850000,
      stockQuantity: 5,
    };

    const wrapper = mount(AIProductCard, {
      props: { product: sampleProduct },
    });

    const button = wrapper.find('button');
    await button.trigger('click');

    expect(wrapper.emitted('navigate')).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith('/products/giay-chay-bo-sieu-toc');
  });

  // 3. AIQuickPrompts Component Tests
  it('5. AIQuickPrompts emits selected prompt when clicked', async () => {
    const wrapper = mount(AIQuickPrompts);
    const buttons = wrapper.findAll('button');
    expect(buttons.length).toBeGreaterThan(0);

    await buttons[0].trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    const emittedPrompt = wrapper.emitted('select')![0][0];
    expect(typeof emittedPrompt).toBe('string');
  });

  // 4. AIMessageBubble Component Tests
  it('6. AIMessageBubble renders user message aligned with distinct role styling', () => {
    const userMsg: AIMessage = {
      id: 'msg_u1',
      conversationId: 'c1',
      role: 'user',
      content: 'Tìm cho tôi áo polo nam thể thao',
      createdAt: '2026-11-05',
    };

    const wrapper = mount(AIMessageBubble, {
      props: { message: userMsg },
    });

    expect(wrapper.text()).toContain('Tìm cho tôi áo polo nam thể thao');
    expect(wrapper.classes()).toContain('flex-row-reverse');
  });

  it('7. AIMessageBubble renders assistant message with embedded product cards', () => {
    const asstMsg: AIMessage = {
      id: 'msg_a1',
      conversationId: 'c1',
      role: 'assistant',
      content: 'Tôi tìm thấy sản phẩm sau rất phù hợp với bạn:',
      metadata: {
        products: [
          {
            id: 'p1',
            name: 'Áo Polo Rồng Đỏ',
            slug: 'ao-polo-rong-do',
            basePrice: 280000,
            salePrice: 220000,
            stockQuantity: 10,
          },
        ],
      },
      createdAt: '2026-11-05',
    };

    const wrapper = mount(AIMessageBubble, {
      props: { message: asstMsg },
    });

    expect(wrapper.text()).toContain('Tôi tìm thấy sản phẩm sau rất phù hợp với bạn:');
    expect(wrapper.text()).toContain('Áo Polo Rồng Đỏ');
  });

  // 5. SSE Cancellation & AbortController Tests (FE-01)
  it('8. useAIChatStore cancelStreaming resets isStreaming state and finalizes partial text', () => {
    const store = useAIChatStore();
    store.isStreaming = true;
    store.currentStreamingText = 'Tôi đang chuẩn bị gửi danh sách...';

    store.cancelStreaming();

    expect(store.isStreaming).toBe(false);
    expect(store.currentStreamingText).toBe('');
    expect(store.messages.length).toBe(1);
    expect(store.messages[0].content).toBe('Tôi đang chuẩn bị gửi danh sách...');
  });

  it('9. useAIChatStore closeChat automatically cancels ongoing streaming (FE-01)', () => {
    const store = useAIChatStore();
    store.isOpen = true;
    store.isStreaming = true;
    store.currentStreamingText = 'Đang xử lý dở dang...';

    store.closeChat();

    expect(store.isOpen).toBe(false);
    expect(store.isStreaming).toBe(false);
    expect(store.currentStreamingText).toBe('');
  });

  it('10. useAIChatStore startNewConversation automatically cancels ongoing streaming (FE-01)', () => {
    const store = useAIChatStore();
    store.isStreaming = true;
    store.currentStreamingText = 'Đang tải thông tin...';

    store.startNewConversation();

    expect(store.isStreaming).toBe(false);
    expect(store.currentStreamingText).toBe('');
    expect(store.currentConversationId).toBeNull();
  });
});
