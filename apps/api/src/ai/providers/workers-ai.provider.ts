import type { AIProvider, ProviderChatMessage, ProviderResponse } from '../interfaces/provider.js';
import type { AIToolDefinition, AIToolCall, AIStreamChunk } from '@edgecart/shared';

export interface WorkersAIModelInfo {
  id: string;
  name: string;
  description: string;
}

export const WORKERS_AI_MODELS = {
  LLAMA_3_3_70B: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  LLAMA_3_1_8B: '@cf/meta/llama-3.1-8b-instruct',
  DEEPSEEK_R1_32B: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  MISTRAL_7B: '@cf/mistral/mistral-7b-instruct-v0.2',
} as const;

export class WorkersAIProvider implements AIProvider {
  readonly providerName = 'cloudflare-workers-ai';
  private aiBinding?: any;
  private model: string;

  constructor(aiBinding?: any, model: string = WORKERS_AI_MODELS.LLAMA_3_3_70B) {
    this.aiBinding = aiBinding;
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  private formatMessages(
    messages: ProviderChatMessage[],
    systemInstruction?: string
  ): Array<{ role: string; content: string; name?: string; tool_calls?: any[] }> {
    const formatted: Array<{ role: string; content: string; name?: string; tool_calls?: any[] }> = [];

    if (systemInstruction) {
      formatted.push({
        role: 'system',
        content: systemInstruction,
      });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        if (!systemInstruction) {
          formatted.push({ role: 'system', content: msg.content });
        }
        continue;
      }

      if (msg.role === 'tool') {
        formatted.push({
          role: 'tool',
          name: msg.name,
          content: msg.content,
        });
        continue;
      }

      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        formatted.push({
          role: 'assistant',
          content: msg.content || '',
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments || {}),
            },
          })),
        });
        continue;
      }

      formatted.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content || '',
      });
    }

    return formatted;
  }

  private formatTools(tools?: AIToolDefinition[]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  private extractToolCalls(rawResult: any): AIToolCall[] {
    const calls: AIToolCall[] = [];

    // Format 1: rawResult.tool_calls
    const rawCalls = rawResult.tool_calls || rawResult.choices?.[0]?.message?.tool_calls;
    if (Array.isArray(rawCalls) && rawCalls.length > 0) {
      for (const tc of rawCalls) {
        const name = tc.name || tc.function?.name;
        let args = tc.arguments || tc.function?.arguments || {};
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            args = {};
          }
        }
        if (name) {
          calls.push({
            id: tc.id || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name,
            arguments: args,
          });
        }
      }
    }

    return calls;
  }

  private extractContent(rawResult: any): string {
    if (typeof rawResult.response === 'string') return rawResult.response.trim();
    if (typeof rawResult.content === 'string') return rawResult.content.trim();
    if (typeof rawResult.choices?.[0]?.message?.content === 'string') {
      return rawResult.choices[0].message.content.trim();
    }
    return '';
  }

  private categorizeError(err: unknown): { isQuota: boolean; reason: string } {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();

    if (
      lower.includes('neuron') ||
      lower.includes('quota') ||
      lower.includes('rate limit') ||
      lower.includes('429') ||
      lower.includes('exceeded')
    ) {
      return {
        isQuota: true,
        reason: 'QUOTA_EXCEEDED: Cloudflare Workers AI daily Neurons allowance exhausted [429]',
      };
    }

    return {
      isQuota: false,
      reason: `WORKERS_AI_ERROR: ${msg.slice(0, 120)}`,
    };
  }

  async generateResponse(
    messages: ProviderChatMessage[],
    tools?: AIToolDefinition[],
    options?: {
      temperature?: number;
      maxOutputTokens?: number;
      systemInstruction?: string;
    }
  ): Promise<ProviderResponse> {
    if (!this.aiBinding || typeof this.aiBinding.run !== 'function') {
      const fallback = this.generateMockFallback(messages, tools);
      fallback.providerUsed = 'mock-fallback';
      fallback.modelUsed = this.model;
      fallback.fallbackReason = 'NO_AI_BINDING: Cloudflare Workers AI binding (env.AI) is not configured';
      return fallback;
    }

    const formattedMessages = this.formatMessages(messages, options?.systemInstruction);
    const formattedTools = this.formatTools(tools);

    const payload: any = {
      messages: formattedMessages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxOutputTokens ?? 2048,
    };

    if (formattedTools && formattedTools.length > 0) {
      payload.tools = formattedTools;
    }

    try {
      const res = await this.aiBinding.run(this.model, payload);
      const toolCalls = this.extractToolCalls(res);
      const content = this.extractContent(res);

      return {
        message: {
          role: 'assistant',
          content,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        providerUsed: 'workers-ai',
        modelUsed: this.model,
      };
    } catch (err: unknown) {
      const { reason } = this.categorizeError(err);
      console.warn(`[WorkersAIProvider] ${reason}. Falling back gracefully.`);
      const fallback = this.generateMockFallback(messages, tools);
      fallback.providerUsed = 'mock-fallback';
      fallback.modelUsed = this.model;
      fallback.fallbackReason = reason;
      return fallback;
    }
  }

  async *streamResponse(
    messages: ProviderChatMessage[],
    tools?: AIToolDefinition[],
    options?: {
      temperature?: number;
      maxOutputTokens?: number;
      systemInstruction?: string;
    }
  ): AsyncIterable<AIStreamChunk> {
    if (!this.aiBinding || typeof this.aiBinding.run !== 'function') {
      yield* this.streamMockFallback(
        messages,
        tools,
        'NO_AI_BINDING: Cloudflare Workers AI binding (env.AI) is not configured'
      );
      return;
    }

    const formattedMessages = this.formatMessages(messages, options?.systemInstruction);
    const formattedTools = this.formatTools(tools);

    const payload: any = {
      messages: formattedMessages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxOutputTokens ?? 2048,
      stream: true,
    };

    if (formattedTools && formattedTools.length > 0) {
      payload.tools = formattedTools;
    }

    let stream: any;
    try {
      stream = await this.aiBinding.run(this.model, payload);
    } catch (err: unknown) {
      const { reason } = this.categorizeError(err);
      console.warn(`[WorkersAIProvider] Stream init error: ${reason}. Falling back gracefully.`);
      yield* this.streamMockFallback(messages, tools, reason);
      return;
    }

    if (!stream || typeof stream.getReader !== 'function') {
      // In case the binding returned a plain object instead of a stream
      const text = this.extractContent(stream);
      if (text) {
        for (const word of text.split(' ')) {
          yield { type: 'text_delta', delta: word + ' ' };
        }
      }
      yield {
        type: 'done',
        metadata: {
          provider: 'workers-ai',
          model: this.model,
        },
      };
      return;
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.response || parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              yield {
                type: 'text_delta',
                delta,
              };
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      const { reason } = this.categorizeError(err);
      console.warn(`[WorkersAIProvider] Stream read error: ${reason}. Falling back.`);
      yield* this.streamMockFallback(messages, tools, reason);
      return;
    }

    yield {
      type: 'done',
      metadata: {
        provider: 'workers-ai',
        model: this.model,
      },
    };
  }

  // Graceful Mock Fallback for local development or when daily Neurons quota is exhausted
  private generateMockFallback(
    messages: ProviderChatMessage[],
    tools?: AIToolDefinition[]
  ): ProviderResponse {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'tool') {
      try {
        const toolResult = JSON.parse(lastMsg.content || '{}');

        if (toolResult.requiresAuth || (typeof toolResult.error === 'string' && toolResult.error.includes('đăng nhập'))) {
          return {
            message: {
              role: 'assistant',
              content:
                'Bạn chưa đăng nhập tài khoản EdgeCart. Vui lòng đăng nhập để tôi có thể hỗ trợ bạn tra cứu danh sách đơn hàng cá nhân một cách an toàn nhé!',
            },
            providerUsed: 'mock-fallback',
          };
        }

        if (lastMsg.name === 'get_my_orders' || Array.isArray(toolResult.orders)) {
          if (!toolResult.orders || toolResult.orders.length === 0) {
            return {
              message: {
                role: 'assistant',
                content:
                  'Bạn hiện tại chưa có đơn hàng nào trên sàn EdgeCart. Hãy tham khảo các sản phẩm nổi bật của chúng tôi để bắt đầu mua sắm nhé!',
              },
              providerUsed: 'mock-fallback',
            };
          }
          const count = toolResult.totalOrders || toolResult.orders.length;
          return {
            message: {
              role: 'assistant',
              content: `Tôi đã tìm thấy ${count} đơn hàng gần đây của bạn trên EdgeCart. Bạn có thể xem chi tiết thông tin đơn hàng bên dưới.`,
            },
            providerUsed: 'mock-fallback',
          };
        }

        if (lastMsg.name === 'get_my_order_details') {
          if (toolResult.error) {
            return {
              message: {
                role: 'assistant',
                content: toolResult.error,
              },
              providerUsed: 'mock-fallback',
            };
          }
          return {
            message: {
              role: 'assistant',
              content: `Dưới đây là thông tin chi tiết cho đơn hàng ${toolResult.orderNumber}: Trạng thái vận chuyển "${toolResult.shippingStatus}", phương thức thanh toán "${toolResult.paymentMethod}".`,
            },
            providerUsed: 'mock-fallback',
          };
        }

        if (lastMsg.name === 'compare_products' || toolResult.comparedCount !== undefined) {
          if (toolResult.error) {
            return {
              message: {
                role: 'assistant',
                content: toolResult.error,
              },
              providerUsed: 'mock-fallback',
            };
          }
          return {
            message: {
              role: 'assistant',
              content:
                'Tôi đã lập bảng so sánh chi tiết giữa các sản phẩm để bạn tiện đánh giá và lựa chọn sản phẩm phù hợp nhất.',
            },
            providerUsed: 'mock-fallback',
          };
        }

        if (lastMsg.name === 'get_store_policy' || toolResult.policy) {
          const policy = toolResult.policy;
          if (policy) {
            const detailsList = policy.details && policy.details.length > 0
              ? '\n\n• ' + policy.details.join('\n• ')
              : '';
            return {
              message: {
                role: 'assistant',
                content: `**${policy.title}**\n\n${policy.summary}${detailsList}`,
              },
              providerUsed: 'mock-fallback',
            };
          }
        }

        if (lastMsg.name === 'search_products' || Array.isArray(toolResult.products)) {
          const count = toolResult.totalFound || toolResult.products?.length || 0;
          if (count === 0) {
            return {
              message: {
                role: 'assistant',
                content:
                  'Rất tiếc, tôi chưa tìm thấy sản phẩm nào phù hợp với yêu cầu của bạn trên EdgeCart. Bạn có thể thử tìm với từ khóa khác xem sao nhé!',
              },
              providerUsed: 'mock-fallback',
            };
          }
          return {
            message: {
              role: 'assistant',
              content: `Tôi đã tìm thấy ${count} sản phẩm phù hợp với nhu cầu của bạn trên EdgeCart. Mời bạn tham khảo danh sách bên dưới:`,
            },
            providerUsed: 'mock-fallback',
          };
        }
      } catch {}
    }

    // Intent detection for Turn 1
    const userMsgs = messages.filter((m) => m.role === 'user');
    const latestUserMsg = userMsgs[userMsgs.length - 1]?.content || '';
    const lowerMsg = latestUserMsg.toLowerCase();

    // 1. Policy triggers
    const policyKeywords: Record<string, string> = {
      'vận chuyển': 'shipping',
      'giao hàng': 'shipping',
      'phí ship': 'shipping',
      'thanh toán': 'payment',
      'trả tiền': 'payment',
      'cod': 'payment',
      'đổi trả': 'return_refund',
      'hoàn tiền': 'return_refund',
      'trả hàng': 'return_refund',
      'bảo hành': 'warranty',
    };

    for (const [kw, topic] of Object.entries(policyKeywords)) {
      if (lowerMsg.includes(kw)) {
        if (tools?.some((t) => t.name === 'get_store_policy')) {
          return {
            message: {
              role: 'assistant',
              content: '',
              toolCalls: [
                {
                  id: `tc_${Date.now()}`,
                  name: 'get_store_policy',
                  arguments: { topic },
                },
              ],
            },
            providerUsed: 'mock-fallback',
          };
        }
      }
    }

    // 2. Order lookup triggers
    const orderTriggers = [
      'đơn hàng',
      'don hang',
      'tra cứu đơn',
      'kiem tra don',
      'tình trạng đơn',
      'đơn mua',
      'mua của tôi',
      'lịch sử đơn',
    ];
    if (orderTriggers.some((t) => lowerMsg.includes(t))) {
      const orderNumMatch = latestUserMsg.match(/ORD-[A-Za-z0-9-]+/i);
      if (orderNumMatch && tools?.some((t) => t.name === 'get_my_order_details')) {
        return {
          message: {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: `tc_${Date.now()}`,
                name: 'get_my_order_details',
                arguments: { orderNumberOrId: orderNumMatch[0].toUpperCase() },
              },
            ],
          },
          providerUsed: 'mock-fallback',
        };
      }

      if (tools?.some((t) => t.name === 'get_my_orders')) {
        return {
          message: {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: `tc_${Date.now()}`,
                name: 'get_my_orders',
                arguments: { limit: 5 },
              },
            ],
          },
          providerUsed: 'mock-fallback',
        };
      }
    }

    // 3. Product comparison triggers
    const compareTriggers = ['so sánh', 'so sanh', 'compare', 'khác nhau', 'khac nhau', 'hơn hay', 'hon hay'];
    const isCompareIntent = compareTriggers.some((t) => lowerMsg.includes(t));

    if (isCompareIntent && tools?.some((t) => t.name === 'compare_products')) {
      const cleanMsg = lowerMsg
        .replace(/^(hãy|vui lòng|làm ơn|giúp mình|giúp tôi|nhờ bạn)?\s*(so sánh|so sanh|compare)\s*(sản phẩm|sp)?/i, '')
        .trim();

      const parts = cleanMsg
        .split(/\s*(?:và|va|với|voi|vs|hoặc|hoac|hay)\s+/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 2);

      let candidates = parts;
      if (candidates.length < 2) {
        const tokens = cleanMsg.split(/\s+/).filter((w) => w.length >= 3);
        if (tokens.length >= 2) {
          candidates = [tokens[0], tokens[tokens.length - 1]];
        }
      }

      const productSlugsOrIds = candidates.slice(0, 4);

      if (productSlugsOrIds.length >= 2) {
        return {
          message: {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: `tc_${Date.now()}`,
                name: 'compare_products',
                arguments: { productSlugsOrIds },
              },
            ],
          },
          providerUsed: 'mock-fallback',
        };
      }
    }

    // 4. Product search triggers
    const searchTriggers = ['tìm', 'tim', 'mua', 'xem', 'sản phẩm', 'áo', 'quần', 'tai nghe', 'chuột', 'balo', 'đèn', 'giá'];
    if (searchTriggers.some((t) => lowerMsg.includes(t))) {
      let query = 'sản phẩm';
      if (lowerMsg.includes('polo')) query = 'polo';
      else if (lowerMsg.includes('balo')) query = 'balo';
      else if (lowerMsg.includes('chuột')) query = 'chuột';
      else if (lowerMsg.includes('tai nghe')) query = 'tai nghe';
      else if (lowerMsg.includes('đèn')) query = 'đèn';
      else if (lowerMsg.includes('bàn phím')) query = 'bàn phím';
      else if (lowerMsg.includes('áo')) query = 'áo';
      else if (lowerMsg.includes('quần')) query = 'quần';
      else {
        query =
          latestUserMsg
            .replace(/^(tìm kiếm|tìm mua|tìm|mua|cho mình xem|cho tôi xem|tôi muốn mua|tôi muốn tìm)\s+/i, '')
            .trim()
            .slice(0, 50) || latestUserMsg.slice(0, 50);
      }

      if (tools?.some((t) => t.name === 'search_products')) {
        return {
          message: {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: `tc_${Date.now()}`,
                name: 'search_products',
                arguments: { query },
              },
            ],
          },
          providerUsed: 'mock-fallback',
        };
      }
    }

    return {
      message: {
        role: 'assistant',
        content:
          'Xin chào! Tôi là Trợ lý AI của EdgeCart (vận hành bởi Cloudflare Workers AI). Tôi có thể hỗ trợ bạn tìm kiếm sản phẩm, so sánh thông số, tra cứu tình trạng đơn hàng hoặc giải đáp các chính sách giao nhận và đổi trả.',
      },
      providerUsed: 'mock-fallback',
    };
  }

  private async *streamMockFallback(
    messages: ProviderChatMessage[],
    tools?: AIToolDefinition[],
    fallbackReason?: string
  ): AsyncIterable<AIStreamChunk> {
    const response = this.generateMockFallback(messages, tools);

    if (response.message.content) {
      const words = response.message.content.split(' ');
      for (const word of words) {
        yield {
          type: 'text_delta',
          delta: word + ' ',
        };
        await new Promise((r) => setTimeout(r, 20));
      }
    }

    yield {
      type: 'done',
      metadata: {
        provider: 'mock-fallback',
        model: this.model,
        fallbackReason,
      },
    };
  }
}
