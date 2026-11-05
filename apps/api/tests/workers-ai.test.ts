import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import { signJwt } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/crypto.js';
import { WorkersAIProvider, WORKERS_AI_MODELS } from '../src/ai/providers/workers-ai.provider.js';
import type { Env } from '../src/types/env.js';

function createMockAiBinding(options?: {
  shouldThrowQuota?: boolean;
  toolCallsToReturn?: any[];
  textToReturn?: string;
}) {
  return {
    run: async (model: string, input: any) => {
      if (options?.shouldThrowQuota) {
        throw new Error('Daily Neurons quota exceeded (429 Rate Limit)');
      }

      if (input.stream) {
        const text = options?.textToReturn || 'Xin chào! Tôi là trợ lý AI EdgeCart.';
        const words = text.split(' ');
        return new ReadableStream({
          start(controller) {
            for (const w of words) {
              const chunk = `data: ${JSON.stringify({ response: w + ' ' })}\n\n`;
              controller.enqueue(new TextEncoder().encode(chunk));
            }
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
      }

      if (options?.toolCallsToReturn && options.toolCallsToReturn.length > 0) {
        return {
          response: '',
          tool_calls: options.toolCallsToReturn,
        };
      }

      return {
        response: options?.textToReturn || 'Dạ, sản phẩm này hiện đang có sẵn tại sàn EdgeCart với giá ưu đãi.',
      };
    },
  };
}

describe('Cloudflare Workers AI Provider & Integration Tests', () => {
  let env: Env;
  let userTokenA: string;
  const userAId = 'usr_wai_test_a';

  beforeEach(async () => {
    env = createTestEnv();

    const passHash = await hashPassword('Password123!');

    // Seed test user
    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
      VALUES (?, 'wai.user.a@edgecart.vn', ?, 'Khách Hàng WAI', '0912345678', 'CUSTOMER', 'ACTIVE');
    `)
      .bind(userAId, passHash)
      .run();

    userTokenA = await signJwt(
      { sub: userAId, email: 'wai.user.a@edgecart.vn', role: 'CUSTOMER' },
      env.JWT_SECRET,
      86400
    );

    // Seed test products
    await env.DB.prepare(`
      INSERT INTO categories (id, name, slug, description, sort_order, is_active)
      VALUES ('cat_wai_tech', 'Thiết Bị Số', 'thiet-bi-so', 'Đồ công nghệ', 1, 1);
    `).run();

    await env.DB.prepare(`
      INSERT INTO products (id, category_id, name, slug, description, base_price, sale_price, is_featured, is_active)
      VALUES 
        ('prod_wai_mouse', 'cat_wai_tech', 'Chuột Không Dây ProMouse', 'chuot-khong-day-promouse', 'Chuột công thái học', 500000, 450000, 1, 1),
        ('prod_wai_pad', 'cat_wai_tech', 'Lót Chuột Gaming DeskPad', 'lot-chuot-gaming-deskpad', 'Lót chuột cỡ lớn', 200000, 180000, 1, 1);
    `).run();

    await env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES 
        ('var_wai_mouse', 'prod_wai_mouse', 'MS-PRO-01', 'Đen Nhám', 450000, 30, 1),
        ('var_wai_pad', 'prod_wai_pad', 'PAD-XL-01', 'Xám Đen', 180000, 50, 1);
    `).run();
  });

  // 1. Direct WorkersAIProvider Unit Tests
  it('1. WorkersAIProvider generates response via env.AI binding with correct telemetry', async () => {
    const mockAi = createMockAiBinding({
      textToReturn: 'EdgeCart có chính sách giao hàng toàn quốc và miễn phí với đơn từ 500k.',
    });
    const provider = new WorkersAIProvider(mockAi, WORKERS_AI_MODELS.LLAMA_3_3_70B);

    const res = await provider.generateResponse([
      { role: 'user', content: 'EdgeCart có chính sách giao hàng thế nào?' },
    ]);

    expect(res.providerUsed).toBe('workers-ai');
    expect(res.modelUsed).toBe(WORKERS_AI_MODELS.LLAMA_3_3_70B);
    expect(res.message.content).toContain('chính sách giao hàng');
  });

  it('2. WorkersAIProvider extracts structured tool_calls correctly', async () => {
    const mockAi = createMockAiBinding({
      toolCallsToReturn: [
        {
          name: 'search_products',
          arguments: { query: 'chuột không dây', limit: 3 },
        },
      ],
    });
    const provider = new WorkersAIProvider(mockAi);

    const res = await provider.generateResponse(
      [{ role: 'user', content: 'Tìm chuột không dây' }],
      [
        {
          name: 'search_products',
          description: 'Tìm kiếm sản phẩm',
          parameters: { type: 'object' },
        },
      ]
    );

    expect(res.providerUsed).toBe('workers-ai');
    expect(res.message.toolCalls).toBeDefined();
    expect(res.message.toolCalls?.length).toBe(1);
    expect(res.message.toolCalls![0].name).toBe('search_products');
    expect(res.message.toolCalls![0].arguments).toEqual({ query: 'chuột không dây', limit: 3 });
  });

  it('3. WorkersAIProvider handles streaming with ReadableStream properly', async () => {
    const mockAi = createMockAiBinding({
      textToReturn: 'Sản phẩm Chuột Không Dây ProMouse đang sẵn hàng.',
    });
    const provider = new WorkersAIProvider(mockAi);

    const chunks = [];
    for await (const chunk of provider.streamResponse([
      { role: 'user', content: 'Có chuột không dây không?' },
    ])) {
      chunks.push(chunk);
    }

    const textChunks = chunks.filter((c) => c.type === 'text_delta');
    expect(textChunks.length).toBeGreaterThan(0);
    const fullText = textChunks.map((c) => c.delta).join('');
    expect(fullText).toContain('Chuột Không Dây ProMouse');

    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk).toBeDefined();
    expect(doneChunk?.metadata?.provider).toBe('workers-ai');
  });

  it('4. WorkersAIProvider handles daily Neurons quota exhaustion with graceful mock fallback', async () => {
    const mockAi = createMockAiBinding({ shouldThrowQuota: true });
    const provider = new WorkersAIProvider(mockAi);

    const res = await provider.generateResponse([
      { role: 'user', content: 'Chính sách bảo hành tại EdgeCart?' },
    ]);

    expect(res.providerUsed).toBe('mock-fallback');
    expect(res.fallbackReason).toContain('QUOTA_EXCEEDED');
    expect(res.fallbackReason).toContain('Neurons');
  });

  it('5. WorkersAIProvider falls back gracefully when env.AI binding is missing', async () => {
    const provider = new WorkersAIProvider(undefined);

    const res = await provider.generateResponse([
      { role: 'user', content: 'Xin chào' },
    ]);

    expect(res.providerUsed).toBe('mock-fallback');
    expect(res.fallbackReason).toContain('NO_AI_BINDING');
  });

  // 2. Full HTTP Orchestrator Integration with env.AI
  it('6. POST /api/v1/ai/chat uses Workers AI and stamps provider: workers-ai in metadata', async () => {
    env.AI = createMockAiBinding({
      textToReturn: 'Dạ, EdgeCart hỗ trợ giao hàng nhanh trong 2 giờ tại các thành phố lớn.',
    });
    env.AI_PROVIDER = 'workers-ai';

    const res = await app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': 'wai_integration_test',
        },
        body: JSON.stringify({
          message: 'Thời gian giao hàng bao lâu?',
          stream: false,
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.assistantMessage.content).toContain('giao hàng');
    expect(body.data.assistantMessage.metadata?.provider).toBe('workers-ai');
    expect(body.data.assistantMessage.metadata?.model).toBe(WORKERS_AI_MODELS.LLAMA_3_3_70B);
  });

  it('7. POST /api/v1/ai/chat supports tool execution loop with Workers AI', async () => {
    let callCount = 0;
    env.AI = {
      run: async (model: string, input: any) => {
        callCount++;
        if (callCount === 1) {
          // Turn 1: AI calls search_products tool
          return {
            response: '',
            tool_calls: [
              {
                name: 'search_products',
                arguments: { query: 'ProMouse', limit: 2 },
              },
            ],
          };
        }
        // Turn 2: AI synthesizes answer after receiving tool results
        return {
          response: 'Tôi đã tìm thấy sản phẩm Chuột Không Dây ProMouse với giá 450.000 đ.',
        };
      },
    };
    env.AI_PROVIDER = 'workers-ai';

    const res = await app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': 'wai_tool_loop_test',
        },
        body: JSON.stringify({
          message: 'Tìm chuột ProMouse',
          stream: false,
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(callCount).toBe(2);
    expect(body.data.assistantMessage.content).toContain('Chuột Không Dây ProMouse');
    expect(body.data.assistantMessage.metadata?.products?.length).toBeGreaterThan(0);
    expect(body.data.assistantMessage.metadata?.provider).toBe('workers-ai');
  });

  it('8. POST /api/v1/ai/chat streaming (SSE) functions with Workers AI', async () => {
    env.AI = createMockAiBinding({
      textToReturn: 'EdgeCart kính chào quý khách, chúc bạn mua sắm vui vẻ.',
    });
    env.AI_PROVIDER = 'workers-ai';

    const res = await app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': 'wai_sse_test',
        },
        body: JSON.stringify({
          message: 'Chào bạn',
          stream: true,
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('event: metadata');
    expect(text).toContain('event: text_delta');
    expect(text).toContain('event: done');
    expect(text).toContain('"provider":"workers-ai"');
  });

  it('9. GET /api/v1/ai/models reports workers-ai provider and binding status', async () => {
    env.AI = createMockAiBinding();
    env.AI_PROVIDER = 'workers-ai';

    const res = await app.request(
      '/api/v1/ai/models',
      {
        method: 'GET',
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.provider).toBe('cloudflare-workers-ai');
    expect(body.data.hasAIBinding).toBe(true);
    expect(body.data.configuredModel).toBe(WORKERS_AI_MODELS.LLAMA_3_3_70B);
    expect(body.data.availableModels.length).toBeGreaterThan(0);
  });
});
