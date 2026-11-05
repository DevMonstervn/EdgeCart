import type { Env } from '../../types/env.js';
import { AIConversationRepository } from '../../repositories/ai-conversation.repo.js';
import { GeminiProvider } from '../providers/gemini.provider.js';
import { BUSINESS_TOOLS, executeBusinessTool } from '../tools/business-tools.js';
import type {
  AIConversation,
  AIMessage,
  AIStreamChunk,
  AIMessageMetadata,
  AIProductCardData,
} from '@edgecart/shared';
import type { ProviderChatMessage } from '../interfaces/provider.js';

export class AIOrchestratorService {
  private repo: AIConversationRepository;
  private provider: GeminiProvider;

  constructor(private env: Env) {
    this.repo = new AIConversationRepository(env.DB);
    this.provider = new GeminiProvider(env.GEMINI_API_KEY, env.AI_MODEL || 'gemini-1.5-flash');
  }

  private getSystemPrompt(): string {
    return `Bạn là "EdgeCart AI Assistant" — Trợ lý Mua sắm và Chăm sóc Khách hàng thông minh, chính thức của sàn thương mại điện tử EdgeCart.

NHIỆM VỤ CHÍNH:
1. Tư vấn mua sắm: Giúp khách hàng tìm kiếm sản phẩm, gợi ý theo tầm giá/nhu cầu, so sánh cấu hình và chất liệu sản phẩm.
2. Hỗ trợ khách hàng: Giải đáp chính xác các chính sách vận chuyển, thanh toán, đổi trả, bảo hành của EdgeCart.
3. Tra cứu đơn hàng: Hỗ trợ khách hàng đã đăng nhập tra cứu tình trạng giao hàng, tiến độ thanh toán và danh sách đơn mua.

QUY TẮC CỐT LÕI (BẮT BUỘC TUÂN THỦ 100%):
- LUÔN LUÔN gọi công cụ (tool calling) khi khách hàng tìm kiếm sản phẩm hoặc hỏi chính sách/đơn hàng.
- TUYỆT ĐỐI KHÔNG BỊA ĐẶT sản phẩm, giá bán, mã đơn hàng, số lượng tồn kho hay chính sách nếu công cụ không trả về.
- Khi tìm thấy sản phẩm từ tool "search_products", hãy tóm tắt ngắn gọn lý do sản phẩm phù hợp với khách, nêu rõ giá bán và tình trạng tồn kho.
- Nếu không tìm thấy sản phẩm, hãy nhẹ nhàng báo cho khách biết và gợi ý từ khóa mở rộng hơn.
- Với câu hỏi về đơn hàng cá nhân: Nếu hệ thống báo "Chưa đăng nhập", hãy nhắc khách đăng nhập tài khoản để xem được thông tin an toàn.
- Giữ phong cách giao tiếp tiếng Việt tự nhiên, lịch sự, nhiệt tình, chuyên nghiệp và ngắn gọn.`;
  }

  async getOrCreateConversation(
    conversationId?: string | null,
    userId?: string | null,
    sessionId?: string | null,
    firstMessageText?: string
  ): Promise<AIConversation> {
    if (conversationId) {
      const existing = await this.repo.getConversationById(conversationId, userId, sessionId);
      if (existing) return existing;
    }

    const id = crypto.randomUUID();
    let title = 'Cuộc trò chuyện mới';
    if (firstMessageText) {
      title = firstMessageText.trim().slice(0, 35) + (firstMessageText.length > 35 ? '...' : '');
    }

    return await this.repo.createConversation({
      id,
      userId,
      sessionId,
      title,
    });
  }

  async processMessage(params: {
    conversationId?: string | null;
    userId?: string | null;
    sessionId?: string | null;
    userMessage: string;
  }): Promise<{
    conversation: AIConversation;
    userMessage: AIMessage;
    assistantMessage: AIMessage;
  }> {
    const { conversationId, userId, sessionId, userMessage } = params;

    const conversation = await this.getOrCreateConversation(
      conversationId,
      userId,
      sessionId,
      userMessage
    );

    // Save user message in DB
    const savedUserMsg = await this.repo.createMessage({
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      role: 'user',
      content: userMessage,
    });

    // Load recent history (last 10 messages)
    const history = await this.repo.getMessages(conversation.id, 10);
    const chatMessages: ProviderChatMessage[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const options = {
      systemInstruction: this.getSystemPrompt(),
      temperature: 0.3,
    };

    // First call to model with business tools
    const response1 = await this.provider.generateResponse(chatMessages, BUSINESS_TOOLS, options);
    let finalAssistantText = response1.message.content || '';
    const metadata: AIMessageMetadata = {};

    // Check if model called tools
    if (response1.message.toolCalls && response1.message.toolCalls.length > 0) {
      chatMessages.push({
        role: 'assistant',
        content: response1.message.content,
        toolCalls: response1.message.toolCalls,
      });

      for (const tc of response1.message.toolCalls) {
        const toolExec = await executeBusinessTool(tc.name, tc.arguments, {
          env: this.env,
          userId,
          sessionId,
        });

        if (toolExec.productCards && toolExec.productCards.length > 0) {
          metadata.products = toolExec.productCards;
        }
        if (toolExec.comparison) {
          metadata.comparison = toolExec.comparison;
        }
        if (toolExec.orders) {
          metadata.orders = toolExec.orders;
        }
        if (toolExec.policy) {
          metadata.policy = toolExec.policy;
        }

        chatMessages.push({
          role: 'tool',
          name: tc.name,
          toolCallId: tc.id,
          content: JSON.stringify(toolExec.result),
        });
      }

      // Second call to model to synthesize answer based on tool outputs
      const response2 = await this.provider.generateResponse(chatMessages, undefined, options);
      finalAssistantText = response2.message.content || finalAssistantText;
    }

    if (!finalAssistantText) {
      finalAssistantText = 'Tôi đã kiểm tra dữ liệu nhưng chưa tìm thấy thông tin phù hợp. Bạn có thể diễn đạt lại câu hỏi giúp tôi được không?';
    }

    // Save assistant message with metadata
    const savedAssistantMsg = await this.repo.createMessage({
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      role: 'assistant',
      content: finalAssistantText,
      metadataJson: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
    });

    await this.repo.touchConversation(conversation.id);

    return {
      conversation,
      userMessage: savedUserMsg,
      assistantMessage: savedAssistantMsg,
    };
  }

  async *streamProcessMessage(params: {
    conversationId?: string | null;
    userId?: string | null;
    sessionId?: string | null;
    userMessage: string;
  }): AsyncIterable<AIStreamChunk> {
    const { conversationId, userId, sessionId, userMessage } = params;

    const conversation = await this.getOrCreateConversation(
      conversationId,
      userId,
      sessionId,
      userMessage
    );

    // Yield initial conversation metadata
    yield {
      type: 'metadata',
      conversationId: conversation.id,
      title: conversation.title,
    };

    // Save user message in DB
    await this.repo.createMessage({
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      role: 'user',
      content: userMessage,
    });

    // Load recent history (last 10 messages)
    const history = await this.repo.getMessages(conversation.id, 10);
    const chatMessages: ProviderChatMessage[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const options = {
      systemInstruction: this.getSystemPrompt(),
      temperature: 0.3,
    };

    // First call to check if tools are required
    const response1 = await this.provider.generateResponse(chatMessages, BUSINESS_TOOLS, options);
    const metadata: AIMessageMetadata = {};
    let fullText = '';

    if (response1.message.toolCalls && response1.message.toolCalls.length > 0) {
      chatMessages.push({
        role: 'assistant',
        content: response1.message.content,
        toolCalls: response1.message.toolCalls,
      });

      for (const tc of response1.message.toolCalls) {
        const toolExec = await executeBusinessTool(tc.name, tc.arguments, {
          env: this.env,
          userId,
          sessionId,
        });

        if (toolExec.productCards && toolExec.productCards.length > 0) {
          metadata.products = toolExec.productCards;
          yield {
            type: 'product_cards',
            products: toolExec.productCards,
          };
        }
        if (toolExec.comparison) {
          metadata.comparison = toolExec.comparison;
        }
        if (toolExec.orders) {
          metadata.orders = toolExec.orders;
        }
        if (toolExec.policy) {
          metadata.policy = toolExec.policy;
        }

        chatMessages.push({
          role: 'tool',
          name: tc.name,
          toolCallId: tc.id,
          content: JSON.stringify(toolExec.result),
        });
      }

      // Stream the second call with tool results
      for await (const chunk of this.provider.streamResponse(chatMessages, undefined, options)) {
        if (chunk.type === 'text_delta' && chunk.delta) {
          fullText += chunk.delta;
          yield chunk;
        }
      }
    } else {
      // Model answered directly without tools
      if (response1.message.content) {
        fullText = response1.message.content;
        const words = fullText.split(' ');
        for (const w of words) {
          yield {
            type: 'text_delta',
            delta: w + ' ',
          };
        }
      }
    }

    if (!fullText) {
      fullText = 'Tôi có thể hỗ trợ gì thêm cho bạn trong việc mua sắm hôm nay?';
      yield { type: 'text_delta', delta: fullText };
    }

    // Save final assistant message to D1
    await this.repo.createMessage({
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      role: 'assistant',
      content: fullText,
      metadataJson: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
    });

    await this.repo.touchConversation(conversation.id);
    yield { type: 'done', metadata };
  }
}
