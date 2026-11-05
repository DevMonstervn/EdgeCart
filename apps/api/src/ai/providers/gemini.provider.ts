import type { AIProvider, ProviderChatMessage, ProviderResponse } from '../interfaces/provider.js';
import type { AIToolDefinition, AIToolCall, AIStreamChunk } from '@edgecart/shared';

export class GeminiProvider implements AIProvider {
  readonly providerName = 'google-gemini';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model: string = 'gemini-1.5-flash') {
    this.apiKey = (apiKey || '').trim();
    this.model = model;
  }

  private mapRole(role: string): string {
    if (role === 'assistant') return 'model';
    if (role === 'tool') return 'function';
    return 'user';
  }

  private formatContents(messages: ProviderChatMessage[]): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue; // Handled separately in system_instruction

      if (msg.role === 'tool') {
        contents.push({
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: msg.name || 'tool_result',
                response: {
                  content: msg.content,
                },
              },
            },
          ],
        });
        continue;
      }

      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const parts: any[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          });
        }
        contents.push({ role: 'model', parts });
        continue;
      }

      contents.push({
        role: this.mapRole(msg.role),
        parts: [{ text: msg.content || '' }],
      });
    }

    return contents;
  }

  private formatTools(tools?: AIToolDefinition[]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return [
      {
        function_declarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
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
    if (!this.apiKey) {
      return this.generateMockFallback(messages, tools);
    }

    const systemInstruction = options?.systemInstruction
      ? { parts: [{ text: options.systemInstruction }] }
      : undefined;

    const payload: any = {
      contents: this.formatContents(messages),
      generationConfig: {
        temperature: options?.temperature ?? 0.3,
        maxOutputTokens: options?.maxOutputTokens ?? 2048,
      },
    };

    if (systemInstruction) {
      payload.system_instruction = systemInstruction;
    }

    const formattedTools = this.formatTools(tools);
    if (formattedTools) {
      payload.tools = formattedTools;
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini API Error [${res.status}]: ${errBody}`);
    }

    const data: any = await res.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let textContent = '';
    const toolCalls: AIToolCall[] = [];

    for (const part of parts) {
      if (part.text) {
        textContent += part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
        });
      }
    }

    return {
      message: {
        role: 'assistant',
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      finishReason: candidate?.finishReason,
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount || 0,
            completionTokens: data.usageMetadata.candidatesTokenCount || 0,
            totalTokens: data.usageMetadata.totalTokenCount || 0,
          }
        : undefined,
    };
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
    if (!this.apiKey) {
      yield* this.streamMockFallback(messages, tools);
      return;
    }

    const systemInstruction = options?.systemInstruction
      ? { parts: [{ text: options.systemInstruction }] }
      : undefined;

    const payload: any = {
      contents: this.formatContents(messages),
      generationConfig: {
        temperature: options?.temperature ?? 0.3,
        maxOutputTokens: options?.maxOutputTokens ?? 2048,
      },
    };

    if (systemInstruction) {
      payload.system_instruction = systemInstruction;
    }

    const formattedTools = this.formatTools(tools);
    if (formattedTools) {
      payload.tools = formattedTools;
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      yield {
        type: 'error',
        error: `Gemini API Error [${res.status}]: ${errBody}`,
      };
      return;
    }

    if (!res.body) {
      yield { type: 'error', error: 'Không nhận được dữ liệu stream từ Gemini API' };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const candidate = parsed.candidates?.[0];
          const parts = candidate?.content?.parts || [];

          for (const part of parts) {
            if (part.text) {
              yield {
                type: 'text_delta',
                delta: part.text,
              };
            }
          }
        } catch {}
      }
    }

    yield { type: 'done' };
  }

  // Graceful Mock Fallback for local development when no API key is specified
  private generateMockFallback(
    messages: ProviderChatMessage[],
    tools?: AIToolDefinition[]
  ): ProviderResponse {
    // 1. Process Tool Execution Results (Turn 2 synthesis in mock fallback)
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'tool') {
      try {
        const toolResult = JSON.parse(lastMsg.content || '{}');

        // Case A: Requires authentication or unauthorized
        if (toolResult.requiresAuth || (typeof toolResult.error === 'string' && toolResult.error.includes('đăng nhập'))) {
          return {
            message: {
              role: 'assistant',
              content:
                'Bạn chưa đăng nhập tài khoản EdgeCart. Vui lòng đăng nhập để tôi có thể hỗ trợ bạn tra cứu danh sách đơn hàng cá nhân một cách an toàn nhé!',
            },
          };
        }

        // Case B: Order list
        if (lastMsg.name === 'get_my_orders' || Array.isArray(toolResult.orders)) {
          if (!toolResult.orders || toolResult.orders.length === 0) {
            return {
              message: {
                role: 'assistant',
                content:
                  'Bạn hiện tại chưa có đơn hàng nào trên sàn EdgeCart. Hãy tham khảo các sản phẩm nổi bật của chúng tôi để bắt đầu mua sắm nhé!',
              },
            };
          }
          const count = toolResult.totalOrders || toolResult.orders.length;
          return {
            message: {
              role: 'assistant',
              content: `Tôi đã tìm thấy ${count} đơn hàng gần đây của bạn trên EdgeCart. Bạn có thể xem chi tiết thông tin đơn hàng bên dưới.`,
            },
          };
        }

        // Case C: Order details
        if (lastMsg.name === 'get_my_order_details') {
          if (toolResult.error) {
            return {
              message: {
                role: 'assistant',
                content: toolResult.error,
              },
            };
          }
          return {
            message: {
              role: 'assistant',
              content: `Dưới đây là thông tin chi tiết cho đơn hàng ${toolResult.orderNumber}: Trạng thái vận chuyển "${toolResult.shippingStatus}", phương thức thanh toán "${toolResult.paymentMethod}".`,
            },
          };
        }

        // Case D: Store policy
        if (lastMsg.name === 'get_store_policy' || toolResult.title) {
          const details = Array.isArray(toolResult.details)
            ? toolResult.details.map((d: string) => `• ${d}`).join('\n')
            : '';
          return {
            message: {
              role: 'assistant',
              content: `**${toolResult.title || 'Chính sách EdgeCart'}**\n\n${toolResult.summary || ''}\n\n${details}`,
            },
          };
        }

        // Case E: Product search
        if (lastMsg.name === 'search_products' || Array.isArray(toolResult.products)) {
          const count = toolResult.totalFound ?? toolResult.products?.length ?? 0;
          if (count === 0) {
            return {
              message: {
                role: 'assistant',
                content:
                  'Rất tiếc, tôi chưa tìm thấy sản phẩm nào khớp với tìm kiếm của bạn. Bạn hãy thử tìm với từ khóa chung hơn nhé!',
              },
            };
          }
          return {
            message: {
              role: 'assistant',
              content: `Tôi đã tìm thấy ${count} sản phẩm phù hợp với nhu cầu của bạn tại EdgeCart. Bạn có thể tham khảo chi tiết các gợi ý bên dưới:`,
            },
          };
        }

        // Case F: Product comparison
        if (lastMsg.name === 'compare_products' || toolResult.comparedCount) {
          if (toolResult.error) {
            return {
              message: {
                role: 'assistant',
                content: toolResult.error,
              },
            };
          }
          return {
            message: {
              role: 'assistant',
              content:
                'Tôi đã lập bảng so sánh chi tiết giữa các sản phẩm để bạn tiện đánh giá và lựa chọn sản phẩm phù hợp nhất.',
            },
          };
        }
      } catch {
        // Fall through to general response if JSON parsing fails
      }
    }

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content.toLowerCase() || '';

    // 2. Only propose Tool Calling if tools are defined and enabled in options
    if (tools && tools.length > 0) {
      // Check if message asks for product search
      if (
        lastUserMsg.includes('tìm') ||
        lastUserMsg.includes('mua') ||
        lastUserMsg.includes('áo') ||
        lastUserMsg.includes('quần') ||
        lastUserMsg.includes('giá') ||
        lastUserMsg.includes('polo')
      ) {
        let query = lastUserMsg;
        if (lastUserMsg.includes('polo')) query = 'polo';
        else if (lastUserMsg.includes('áo')) query = 'áo';
        else if (lastUserMsg.includes('quần')) query = 'quần';
        else {
          query = lastUserMsg
            .replace(/^(tìm kiếm|tìm mua|tìm|mua|cho mình xem|cho tôi xem|tôi muốn mua|tôi muốn tìm)\s+/i, '')
            .trim() || lastUserMsg;
        }

        return {
          message: {
            role: 'assistant',
            content: 'Tôi đang tìm kiếm các sản phẩm phù hợp với yêu cầu của bạn...',
            toolCalls: [
              {
                id: `tc_${Date.now()}`,
                name: 'search_products',
                arguments: { query },
              },
            ],
          },
        };
      }

      // Check if message asks for policies
      if (
        lastUserMsg.includes('vận chuyển') ||
        lastUserMsg.includes('ship') ||
        lastUserMsg.includes('phí') ||
        lastUserMsg.includes('bảo hành') ||
        lastUserMsg.includes('đổi trả')
      ) {
        let topic = 'shipping';
        if (lastUserMsg.includes('bảo hành')) topic = 'warranty';
        else if (lastUserMsg.includes('đổi trả') || lastUserMsg.includes('hoàn tiền')) topic = 'return_refund';
        else if (lastUserMsg.includes('thanh toán')) topic = 'payment';

        return {
          message: {
            role: 'assistant',
            content: 'Để tôi kiểm tra chính sách của EdgeCart cho bạn...',
            toolCalls: [
              {
                id: `tc_${Date.now()}`,
                name: 'get_store_policy',
                arguments: { topic },
              },
            ],
          },
        };
      }

      if (lastUserMsg.includes('đơn hàng') || lastUserMsg.includes('order')) {
        return {
          message: {
            role: 'assistant',
            content: 'Để tôi tra cứu danh sách đơn hàng của bạn...',
            toolCalls: [
              {
                id: `tc_${Date.now()}`,
                name: 'get_my_orders',
                arguments: { limit: 5 },
              },
            ],
          },
        };
      }
    }

    return {
      message: {
        role: 'assistant',
        content:
          'Xin chào! Tôi là Trợ lý AI của EdgeCart. Tôi có thể hỗ trợ bạn tìm kiếm sản phẩm, so sánh thông số, tra cứu tình trạng đơn hàng hoặc giải đáp các chính sách giao nhận và đổi trả.',
      },
    };
  }

  private async *streamMockFallback(
    messages: ProviderChatMessage[],
    tools?: AIToolDefinition[]
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

    yield { type: 'done' };
  }
}
