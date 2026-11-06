import type { AIProvider, ProviderChatMessage, ProviderResponse } from '../interfaces/provider.js';
import type { AIToolDefinition, AIToolCall, AIStreamChunk } from '@edgecart/shared';

export interface GeminiModelInfo {
  name: string;
  displayName: string;
  supportedGenerationMethods: string[];
}

export async function queryAvailableGeminiModels(apiKey: string): Promise<GeminiModelInfo[]> {
  if (!apiKey || !apiKey.trim()) return [];
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google ListModels failed [${res.status}]: ${errText}`);
  }

  const data: any = await res.json();
  const models = data.models || [];
  return models
    .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m: any) => ({
      name: (m.name || '').replace(/^models\//, ''),
      displayName: m.displayName || m.name,
      supportedGenerationMethods: m.supportedGenerationMethods,
    }));
}

export class GeminiProvider implements AIProvider {
  readonly providerName = 'google-gemini';
  private apiKey: string;
  private model: string;
  private hasAttemptedModelResolution = false;

  constructor(apiKey?: string, model: string = 'gemini-3.8-flash') {
    this.apiKey = (apiKey || '').trim();
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  async listAvailableModels(): Promise<GeminiModelInfo[]> {
    return queryAvailableGeminiModels(this.apiKey);
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

  private categorizeError(status: number, errBody: string): string {
    if (status === 401 || status === 403) {
      return `AUTH_ERROR: Invalid or unauthorized Gemini API key [${status}]`;
    }
    if (status === 404) {
      return `MODEL_NOT_FOUND: Model "${this.model}" not found for API version v1beta [404]`;
    }
    if (status === 429) {
      return `QUOTA_EXCEEDED: Free-tier quota or rate limit exceeded [429]`;
    }
    if (status === 400) {
      if (errBody.includes('location is not supported') || errBody.includes('FAILED_PRECONDITION')) {
        return `LOCATION_UNSUPPORTED: Upstream region geo-restriction [400]`;
      }
      return `INVALID_ARGUMENT: Bad request to Gemini API [400]: ${errBody.slice(0, 120)}`;
    }
    if (status >= 500) {
      return `UPSTREAM_ERROR: Google Gemini service unavailable [${status}]`;
    }
    return `HTTP_ERROR_${status}: ${errBody.slice(0, 120)}`;
  }

  private async tryResolveWorkingModel(): Promise<boolean> {
    if (this.hasAttemptedModelResolution || !this.apiKey) return false;
    this.hasAttemptedModelResolution = true;

    try {
      console.info('[GeminiProvider] Attempting dynamic model discovery via ListModels...');
      const available = await this.listAvailableModels();
      if (available.length === 0) return false;

      // Filter out the failed model
      const candidates = available.filter((m) => m.name !== this.model && !this.model.includes(m.name));
      const pool = candidates.length > 0 ? candidates : available;

      // Prefer available flash models
      const preferred =
        pool.find((m) => m.name.includes('3.8-flash'))?.name ||
        pool.find((m) => m.name.includes('2.5-flash'))?.name ||
        pool.find((m) => m.name.includes('2.0-flash'))?.name ||
        pool.find((m) => m.name.includes('flash'))?.name ||
        pool[0]?.name;

      if (preferred && preferred !== this.model) {
        console.info(`[GeminiProvider] Resolved active model from "${this.model}" to "${preferred}".`);
        this.model = preferred;
        return true;
      }
    } catch (err: unknown) {
      console.warn(`[GeminiProvider] Dynamic model resolution failed: ${err}`);
    }
    return false;
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
      const fallback = this.generateMockFallback(messages, tools);
      fallback.providerUsed = 'mock-fallback';
      fallback.fallbackReason = 'NO_API_KEY: GEMINI_API_KEY is not configured';
      return fallback;
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

    let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    try {
      let res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Handle 404 Model Not Found with dynamic model recovery
      if (res.status === 404) {
        const recovered = await this.tryResolveWorkingModel();
        if (recovered) {
          endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
          res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        const fallbackReason = this.categorizeError(res.status, errBody);
        console.warn(`[GeminiProvider] ${fallbackReason}. Falling back gracefully.`);
        const fallback = this.generateMockFallback(messages, tools);
        fallback.providerUsed = 'mock-fallback';
        fallback.modelUsed = this.model;
        fallback.fallbackReason = fallbackReason;
        return fallback;
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
        providerUsed: 'gemini',
        modelUsed: this.model,
      };
    } catch (err: unknown) {
      const fallbackReason = `NETWORK_ERROR: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`[GeminiProvider] ${fallbackReason}. Falling back gracefully.`);
      const fallback = this.generateMockFallback(messages, tools);
      fallback.providerUsed = 'mock-fallback';
      fallback.modelUsed = this.model;
      fallback.fallbackReason = fallbackReason;
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
    if (!this.apiKey) {
      yield* this.streamMockFallback(messages, tools, 'NO_API_KEY: GEMINI_API_KEY is not configured');
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

    let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Handle 404 Model Not Found with dynamic model recovery
      if (res.status === 404) {
        const recovered = await this.tryResolveWorkingModel();
        if (recovered) {
          endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
          res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        const fallbackReason = this.categorizeError(res.status, errBody);
        console.warn(`[GeminiProvider] Upstream Gemini stream error (${res.status}): ${fallbackReason}. Falling back gracefully.`);
        yield* this.streamMockFallback(messages, tools, fallbackReason);
        return;
      }
    } catch (err: unknown) {
      const fallbackReason = `NETWORK_ERROR: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`[GeminiProvider] Network stream error: ${fallbackReason}. Falling back gracefully.`);
      yield* this.streamMockFallback(messages, tools, fallbackReason);
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

    yield {
      type: 'done',
      metadata: {
        provider: 'gemini',
        model: this.model,
      },
    };
  }

  // Graceful Mock Fallback for local development or when upstream API fails
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
            providerUsed: 'mock-fallback',
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

        // Case C: Order details
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

        // Case D: Product comparison (Handled before policy to prevent confusion)
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

        // Case E: Store policy
        if (lastMsg.name === 'get_store_policy' || toolResult.title) {
          const details = Array.isArray(toolResult.details)
            ? toolResult.details.map((d: string) => `• ${d}`).join('\n')
            : '';
          return {
            message: {
              role: 'assistant',
              content: `**${toolResult.title || 'Chính sách EdgeCart'}**\n\n${toolResult.summary || ''}\n\n${details}`,
            },
            providerUsed: 'mock-fallback',
          };
        }

        // Case F: Product search
        if (lastMsg.name === 'search_products' || Array.isArray(toolResult.products)) {
          const count = toolResult.totalFound ?? toolResult.products?.length ?? 0;
          if (count === 0) {
            return {
              message: {
                role: 'assistant',
                content:
                  'Rất tiếc, tôi chưa tìm thấy sản phẩm nào khớp với tìm kiếm của bạn. Bạn hãy thử tìm với từ khóa chung hơn nhé!',
              },
              providerUsed: 'mock-fallback',
            };
          }
          return {
            message: {
              role: 'assistant',
              content: `Tôi đã tìm thấy ${count} sản phẩm phù hợp với nhu cầu của bạn tại EdgeCart. Bạn có thể tham khảo chi tiết các gợi ý bên dưới:`,
            },
            providerUsed: 'mock-fallback',
          };
        }
      } catch {
        // Fall through to general response if JSON parsing fails
      }
    }

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content.toLowerCase() || '';

    // 2. Only propose Tool Calling if tools are defined and enabled in options
    if (tools && tools.length > 0) {
      // PRIORITY 1: Product Comparison Intent (Must run before generic "giá" / price search)
      const isCompare =
        lastUserMsg.includes('so sánh') ||
        lastUserMsg.includes('đối chiếu') ||
        lastUserMsg.includes('khác biệt') ||
        lastUserMsg.includes('khác nhau giữa') ||
        lastUserMsg.includes('compare');

      if (isCompare) {
        // Extract 2 to 4 product identifiers or names from natural language
        const cleanMsg = lastUserMsg
          .replace(/^(hãy|vui lòng|bạn hãy|giúp tôi|hãy giúp tôi|hãy so sánh|so sánh|đối chiếu|so sánh chi tiết|so sánh giúp|so sánh sản phẩm|so sánh giữa)\s+/i, '')
          .trim();

        const parts = cleanMsg
          .split(/\s+(?:và|với|vs|cùng)\s+|,\s*/i)
          .map((p) => p.replace(/^(sản phẩm|mẫu|chiếc|cái|đồ)\s+/i, '').trim())
          .filter((p) => p.length >= 2);

        const candidates = parts.slice(0, 4);

        if (candidates.length >= 2) {
          return {
            message: {
              role: 'assistant',
              content: 'Tôi đang so sánh các sản phẩm bạn yêu cầu...',
              toolCalls: [
                {
                  id: `tc_${Date.now()}`,
                  name: 'compare_products',
                  arguments: { productSlugsOrIds: candidates },
                },
              ],
            },
            providerUsed: 'mock-fallback',
          };
        } else {
          return {
            message: {
              role: 'assistant',
              content:
                'Để so sánh, bạn vui lòng cung cấp tên hoặc đường dẫn của ít nhất 2 sản phẩm (ví dụ: "So sánh Balo laptop UrbanShield và Giá đỡ laptop StandPro").',
            },
            providerUsed: 'mock-fallback',
          };
        }
      }

      // PRIORITY 2: Store Policies
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
          providerUsed: 'mock-fallback',
        };
      }

      // PRIORITY 3: Order Lookup (Checked before general "mua" to support "đơn hàng đã mua")
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
          providerUsed: 'mock-fallback',
        };
      }

      // PRIORITY 4: Product Search
      if (
        lastUserMsg.includes('tìm') ||
        lastUserMsg.includes('mua') ||
        lastUserMsg.includes('áo') ||
        lastUserMsg.includes('quần') ||
        lastUserMsg.includes('balo') ||
        lastUserMsg.includes('laptop') ||
        lastUserMsg.includes('tai nghe') ||
        lastUserMsg.includes('bàn phím') ||
        lastUserMsg.includes('cốc') ||
        lastUserMsg.includes('giá') ||
        lastUserMsg.includes('polo')
      ) {
        let query = lastUserMsg;
        if (lastUserMsg.includes('polo')) query = 'polo';
        else if (lastUserMsg.includes('balo')) query = 'balo';
        else if (lastUserMsg.includes('tai nghe')) query = 'tai nghe';
        else if (lastUserMsg.includes('bàn phím')) query = 'bàn phím';
        else if (lastUserMsg.includes('cốc')) query = 'cốc';
        else if (lastUserMsg.includes('áo')) query = 'áo';
        else if (lastUserMsg.includes('quần')) query = 'quần';
        else {
          query =
            lastUserMsg
              .replace(/^(tìm kiếm|tìm mua|tìm|mua|cho mình xem|cho tôi xem|tôi muốn mua|tôi muốn tìm)\s+/i, '')
              .trim()
              .slice(0, 50) || lastUserMsg.slice(0, 50);
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
          providerUsed: 'mock-fallback',
        };
      }
    }

    return {
      message: {
        role: 'assistant',
        content:
          'Xin chào! Tôi là Trợ lý AI của EdgeCart. Tôi có thể hỗ trợ bạn tìm kiếm sản phẩm, so sánh thông số, tra cứu tình trạng đơn hàng hoặc giải đáp các chính sách giao nhận và đổi trả.',
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
