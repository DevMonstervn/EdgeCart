import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import { signJwt } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/crypto.js';
import { executeBusinessTool } from '../src/ai/tools/business-tools.js';
import { AIConversationRepository } from '../src/repositories/ai-conversation.repo.js';
import type { Env } from '../src/types/env.js';

describe('EdgeCart AI Assistant Integration & Security Tests', () => {
  let env: Env;
  let userTokenA: string;
  let userTokenB: string;
  const userAId = 'usr_ai_test_a';
  const userBId = 'usr_ai_test_b';

  beforeEach(async () => {
    env = createTestEnv();

    const passHash = await hashPassword('Password123!');

    // Seed test users
    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
      VALUES
        (?, 'ai.user.a@edgecart.vn', ?, 'Khách Hàng A', '0911223344', 'CUSTOMER', 'ACTIVE'),
        (?, 'ai.user.b@edgecart.vn', ?, 'Khách Hàng B', '0999887766', 'CUSTOMER', 'ACTIVE');
    `)
      .bind(userAId, passHash, userBId, passHash)
      .run();

    userTokenA = await signJwt(
      { sub: userAId, email: 'ai.user.a@edgecart.vn', role: 'CUSTOMER' },
      env.JWT_SECRET,
      86400
    );
    userTokenB = await signJwt(
      { sub: userBId, email: 'ai.user.b@edgecart.vn', role: 'CUSTOMER' },
      env.JWT_SECRET,
      86400
    );

    // Seed test category
    await env.DB.prepare(`
      INSERT INTO categories (id, name, slug, description, sort_order, is_active)
      VALUES ('cat_ai_fashion', 'Thời Trang', 'thoi-trang', 'Đồ mặc cao cấp', 1, 1);
    `).run();

    // Seed test product & variant
    await env.DB.prepare(`
      INSERT INTO products (id, category_id, name, slug, description, base_price, sale_price, is_featured, is_active)
      VALUES 
        ('prod_ai_polo', 'cat_ai_fashion', 'Áo Polo Thể Thao Nam Rồng', 'ao-polo-the-thao-nam-rong', 'Áo polo chất liệu poly co giãn', 300000, 249000, 1, 1),
        ('prod_ai_balo', 'cat_ai_fashion', 'Balo laptop UrbanShield', 'balo-laptop-urbanshield', 'Balo chống nước cao cấp', 850000, 720000, 1, 1),
        ('prod_ai_stand', 'cat_ai_fashion', 'Giá đỡ laptop StandPro', 'gia-do-laptop-standpro', 'Giá đỡ nhôm công thái học', 350000, 290000, 1, 1);
    `).run();

    await env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES 
        ('var_ai_polo_l', 'prod_ai_polo', 'POLO-MR-L', 'Xanh Navy / L', 249000, 25, 1),
        ('var_ai_balo', 'prod_ai_balo', 'BALO-UB-01', 'Đen Tiêu Chuẩn', 720000, 15, 1),
        ('var_ai_stand', 'prod_ai_stand', 'STAND-PRO-AL', 'Bạc Nhôm', 290000, 40, 1);
    `).run();

    // Seed test order for User A
    await env.DB.prepare(`
      INSERT INTO orders (id, order_number, user_id, customer_email, customer_phone, shipping_name, shipping_address, shipping_province, shipping_district, shipping_ward, payment_method, payment_status, shipping_status, subtotal, total_amount)
      VALUES ('ord_test_01', 'ORD-202611-0001', ?, 'ai.user.a@edgecart.vn', '0911223344', 'Khách Hàng A', 'Số 10 Kim Mã', 'Thành phố Hà Nội', '', 'Phường Giảng Võ', 'COD', 'UNPAID', 'SHIPPING', 249000, 279000);
    `).bind(userAId).run();

    await env.DB.prepare(`
      INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, variant_title, sku, unit_price, quantity, total_price)
      VALUES ('oi_test_01', 'ord_test_01', 'prod_ai_polo', 'var_ai_polo_l', 'Áo Polo Thể Thao Nam Rồng', 'Xanh Navy / L', 'POLO-MR-L', 249000, 1, 249000);
    `).run();
  });

  // 1. Tool Execution: search_products
  it('1. search_products tool returns authentic EdgeCart products without fabrication', async () => {
    const result = await executeBusinessTool(
      'search_products',
      { query: 'polo', limit: 5 },
      { env }
    );

    expect(result.toolName).toBe('search_products');
    expect(result.productCards).toBeDefined();
    expect(result.productCards!.length).toBeGreaterThan(0);
    const polo = result.productCards![0];
    expect(polo.name).toBe('Áo Polo Thể Thao Nam Rồng');
    expect(polo.slug).toBe('ao-polo-the-thao-nam-rong');
    expect(polo.salePrice).toBe(249000);
    expect(polo.stockQuantity).toBe(25);
  });

  // 2. Tool Execution: get_store_policy
  it('2. get_store_policy tool returns verified EdgeCart policies', async () => {
    const resShipping = await executeBusinessTool(
      'get_store_policy',
      { topic: 'shipping' },
      { env }
    );

    expect(resShipping.policy).toBeDefined();
    expect(resShipping.policy?.title).toContain('vận chuyển');
    expect(resShipping.policy?.summary).toContain('500.000');

    const resRefund = await executeBusinessTool(
      'get_store_policy',
      { topic: 'return_refund' },
      { env }
    );
    expect(resRefund.policy?.summary).toContain('30 ngày');
  });

  // 3. Tool Execution: get_my_orders Security
  it('3. get_my_orders rejects unauthenticated requests (Guest Protection)', async () => {
    const result = await executeBusinessTool(
      'get_my_orders',
      { limit: 5 },
      { env, userId: null }
    );

    expect(result.result).toHaveProperty('requiresAuth', true);
  });

  it('4. get_my_orders returns orders owned strictly by the authenticated user', async () => {
    // User A has 1 order
    const resA = await executeBusinessTool(
      'get_my_orders',
      { limit: 5 },
      { env, userId: userAId }
    );

    expect(resA.orders).toBeDefined();
    expect(resA.orders?.length).toBe(1);
    expect(resA.orders![0].orderNumber).toBe('ORD-202611-0001');

    // User B has 0 orders
    const resB = await executeBusinessTool(
      'get_my_orders',
      { limit: 5 },
      { env, userId: userBId }
    );
    expect(resB.orders?.length).toBe(0);
  });

  // 4. Tool Execution: IDOR Prevention in get_my_order_details
  it('5. get_my_order_details enforces strict ownership (IDOR Prevention)', async () => {
    // User B attempts to look up User A's order by order number
    const resB = await executeBusinessTool(
      'get_my_order_details',
      { orderNumberOrId: 'ORD-202611-0001' },
      { env, userId: userBId }
    );

    expect((resB.result as any).error).toContain('Không tìm thấy đơn hàng');

    // User A looks up their own order
    const resA = await executeBusinessTool(
      'get_my_order_details',
      { orderNumberOrId: 'ORD-202611-0001' },
      { env, userId: userAId }
    );

    expect((resA.result as any).orderNumber).toBe('ORD-202611-0001');
    expect((resA.result as any).recipient).toBe('Khách Hàng A');
  });

  // 5. AI Conversation Repository CRUD
  it('6. AIConversationRepository creates and retrieves conversations with isolation', async () => {
    const repo = new AIConversationRepository(env.DB);
    const convA = await repo.createConversation({
      id: 'conv_test_a',
      userId: userAId,
      title: 'Tư vấn áo thể thao',
    });

    expect(convA.id).toBe('conv_test_a');
    expect(convA.userId).toBe(userAId);

    // List for User A
    const listA = await repo.listConversations(userAId);
    expect(listA.length).toBe(1);
    expect(listA[0].id).toBe('conv_test_a');

    // List for User B (Isolated)
    const listB = await repo.listConversations(userBId);
    expect(listB.length).toBe(0);

    // Messages persistence
    await repo.createMessage({
      id: 'msg_01',
      conversationId: 'conv_test_a',
      role: 'user',
      content: 'Cho mình xem áo polo nam',
    });
    await repo.createMessage({
      id: 'msg_02',
      conversationId: 'conv_test_a',
      role: 'assistant',
      content: 'EdgeCart hiện có Áo Polo Thể Thao Nam Rồng giá 249.000 đ',
      metadataJson: JSON.stringify({ products: [{ id: 'prod_ai_polo', name: 'Áo Polo' }] }),
    });

    const messages = await repo.getMessages('conv_test_a');
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].metadata?.products).toBeDefined();

    // Delete conversation
    const deleted = await repo.deleteConversation('conv_test_a', userAId);
    expect(deleted).toBe(true);

    const afterDelete = await repo.getConversationById('conv_test_a', userAId);
    expect(afterDelete).toBeNull();
  });

  // 6. Full API Endpoints
  it('7. POST /api/v1/ai/chat processes message and returns valid response structure', async () => {
    const res = await app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userTokenA}`,
        },
        body: JSON.stringify({
          message: 'EdgeCart có chính sách miễn phí vận chuyển không?',
          stream: false,
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.conversation).toBeDefined();
    expect(body.data.assistantMessage).toBeDefined();
    expect(body.data.assistantMessage.content).toBeTruthy();
  });

  it('8. GET /api/v1/ai/conversations lists conversations for authenticated user', async () => {
    // First send a chat message to create conversation
    await app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userTokenA}`,
        },
        body: JSON.stringify({
          message: 'Tư vấn quần áo cho tôi',
          stream: false,
        }),
      },
      env
    );

    const res = await app.request(
      '/api/v1/ai/conversations',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${userTokenA}`,
        },
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  // 7. Security Hardening Regression Tests (SEC-01 & DB-01)
  it('9. GET /api/v1/ai/conversations/:id rejects unauthenticated & anonymous requests with 401 (SEC-01)', async () => {
    const repo = new AIConversationRepository(env.DB);
    const conv = await repo.createConversation({
      id: 'conv_target_idor',
      userId: userAId,
      title: 'Bí mật kinh doanh',
    });

    // Anonymous request (no Authorization header, no x-session-id)
    const res = await app.request(
      `/api/v1/ai/conversations/${conv.id}`,
      {
        method: 'GET',
      },
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('10. DELETE /api/v1/ai/conversations/:id rejects unauthenticated & anonymous requests with 401 (SEC-01)', async () => {
    const repo = new AIConversationRepository(env.DB);
    const conv = await repo.createConversation({
      id: 'conv_target_delete_idor',
      userId: userAId,
      title: 'Cuộc trò chuyện bảo mật',
    });

    // Anonymous delete attempt
    const res = await app.request(
      `/api/v1/ai/conversations/${conv.id}`,
      {
        method: 'DELETE',
      },
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_UNAUTHORIZED');

    // Verify conversation still exists
    const stillExists = await repo.getConversationById(conv.id, userAId);
    expect(stillExists).not.toBeNull();
  });

  it('11. Cross-user isolation: User B cannot access or delete User A conversation (SEC-01)', async () => {
    const repo = new AIConversationRepository(env.DB);
    const convA = await repo.createConversation({
      id: 'conv_user_a_private',
      userId: userAId,
      title: 'Hội thoại riêng của User A',
    });

    // User B tries to GET User A's conversation
    const getResB = await app.request(
      `/api/v1/ai/conversations/${convA.id}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${userTokenB}`,
        },
      },
      env
    );

    expect(getResB.status).toBe(404);

    // User B tries to DELETE User A's conversation
    const delResB = await app.request(
      `/api/v1/ai/conversations/${convA.id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${userTokenB}`,
        },
      },
      env
    );

    expect(delResB.status).toBe(404);

    // User A can legitimately access their own conversation
    const getResA = await app.request(
      `/api/v1/ai/conversations/${convA.id}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${userTokenA}`,
        },
      },
      env
    );
    expect(getResA.status).toBe(200);
  });

  it('12. Cross-session isolation: Guest Session Y cannot access Guest Session X conversation (SEC-01)', async () => {
    const sessionX = 'sess_guest_x';
    const sessionY = 'sess_guest_y';

    const repo = new AIConversationRepository(env.DB);
    const convX = await repo.createConversation({
      id: 'conv_guest_x',
      sessionId: sessionX,
      title: 'Khách X tìm áo khoác',
    });

    // Guest Session Y attempts to read Guest Session X conversation
    const resY = await app.request(
      `/api/v1/ai/conversations/${convX.id}`,
      {
        method: 'GET',
        headers: {
          'x-session-id': sessionY,
        },
      },
      env
    );
    expect(resY.status).toBe(404);

    // Guest Session X can legitimately read their conversation
    const resX = await app.request(
      `/api/v1/ai/conversations/${convX.id}`,
      {
        method: 'GET',
        headers: {
          'x-session-id': sessionX,
        },
      },
      env
    );
    expect(resX.status).toBe(200);
  });

  it('13. Guest session cannot access authenticated user conversation even with ID (SEC-01)', async () => {
    const repo = new AIConversationRepository(env.DB);
    const convUser = await repo.createConversation({
      id: 'conv_user_private_id',
      userId: userAId,
      title: 'Đơn hàng mật của User A',
    });

    // Guest session tries to access
    const res = await app.request(
      `/api/v1/ai/conversations/${convUser.id}`,
      {
        method: 'GET',
        headers: {
          'x-session-id': 'sess_attacker',
        },
      },
      env
    );
    expect(res.status).toBe(404);
  });

  it('14. Atomic deletion via D1 batch cleans up conversation and messages completely (DB-01)', async () => {
    const repo = new AIConversationRepository(env.DB);
    const conv = await repo.createConversation({
      id: 'conv_batch_test',
      userId: userAId,
      title: 'Xóa kiểm thử D1 Batch',
    });

    await repo.createMessage({
      id: 'msg_b1',
      conversationId: conv.id,
      role: 'user',
      content: 'Tin nhắn 1',
    });
    await repo.createMessage({
      id: 'msg_b2',
      conversationId: conv.id,
      role: 'assistant',
      content: 'Tin nhắn 2',
    });

    // Perform deletion via repo (which uses db.batch)
    const deleted = await repo.deleteConversation(conv.id, userAId);
    expect(deleted).toBe(true);

    // Verify conversation is gone
    const convAfter = await repo.getConversationById(conv.id, userAId);
    expect(convAfter).toBeNull();

    // Verify messages are completely wiped
    const msgsAfter = await repo.getMessages(conv.id);
    expect(msgsAfter.length).toBe(0);
  });

  it('15. Mock fallback Turn 2 correctly synthesizes tool outputs and auth requirements (AI-01)', async () => {
    // Guest queries for orders -> orchestrator executes tool -> mock fallback Turn 2 should advise auth
    const resGuest = await app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': 'guest_order_turn2',
        },
        body: JSON.stringify({
          message: 'Kiểm tra đơn hàng của tôi',
          stream: false,
        }),
      },
      env
    );

    expect(resGuest.status).toBe(200);
    const bodyGuest = (await resGuest.json()) as any;
    expect(bodyGuest.success).toBe(true);
    expect(bodyGuest.data.assistantMessage.content).toContain('đăng nhập');

    // User asks for polo product search -> mock fallback Turn 2 synthesizes product count
    const resSearch = await app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': 'guest_search_turn2',
        },
        body: JSON.stringify({
          message: 'Tìm mua áo polo nam',
          stream: false,
        }),
      },
      env
    );

    expect(resSearch.status).toBe(200);
    const bodySearch = (await resSearch.json()) as any;
    expect(bodySearch.success).toBe(true);
    expect(bodySearch.data.assistantMessage.content).toContain('sản phẩm phù hợp');
    expect(bodySearch.data.assistantMessage.metadata?.products?.length).toBeGreaterThan(0);
  });

  // 16. Product Comparison Tool Execution with Natural Language Names
  it('16. compare_products tool compares products by natural language names and resolves slugs', async () => {
    const result = await executeBusinessTool(
      'compare_products',
      { productSlugsOrIds: ['Balo laptop UrbanShield', 'Giá đỡ laptop StandPro'] },
      { env }
    );

    expect(result.toolName).toBe('compare_products');
    expect(result.comparison).toBeDefined();
    expect(result.comparison?.products.length).toBe(2);
    expect(result.comparison?.attributes.length).toBeGreaterThan(0);
    const names = result.comparison?.products.map((p) => p.name);
    expect(names).toContain('Balo laptop UrbanShield');
    expect(names).toContain('Giá đỡ laptop StandPro');
  });

  // 17. Product Comparison Tool: Insufficient Products Graceful Handling
  it('17. compare_products tool returns graceful polite message when fewer than 2 products found', async () => {
    const result = await executeBusinessTool(
      'compare_products',
      { productSlugsOrIds: ['Sản phẩm không tồn tại 1', 'Sản phẩm không tồn tại 2'] },
      { env }
    );

    expect(result.toolName).toBe('compare_products');
    expect((result.result as any).error).toBeDefined();
    expect((result.result as any).error).toContain('Không tìm thấy đủ ít nhất 2 sản phẩm');
  });

  // 18. End-to-end Chat: Product Comparison Intent Prioritization (P1 Fix)
  it('18. POST /api/v1/ai/chat prioritizes comparison intent over "giá"/search for Vietnamese queries', async () => {
    const res = await app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': 'guest_compare_test',
        },
        body: JSON.stringify({
          message: 'So sánh sản phẩm Balo laptop UrbanShield và Giá đỡ laptop StandPro',
          stream: false,
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.assistantMessage).toBeDefined();
    expect(body.data.assistantMessage.metadata?.comparison).toBeDefined();
    expect(body.data.assistantMessage.metadata?.comparison?.products.length).toBe(2);
  });

  // 19. SQL LIKE Safety: Long queries with special chars do not crash SQLite
  it('19. sanitizeLikeSearch prevents SQLite LIKE pattern crashes on long inputs and wildcards', async () => {
    const longMaliciousQuery = '%'.repeat(50) + "Giá đỡ' AND 1=1 [a-z] %%% " + 'X'.repeat(200);
    const res = await app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': 'guest_sql_safe',
        },
        body: JSON.stringify({
          message: `Tìm sản phẩm ${longMaliciousQuery}`,
          stream: false,
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
  });

  // 20. GET /api/v1/ai/models endpoint security
  it('20. GET /api/v1/ai/models returns model configuration securely without exposing API keys', async () => {
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
    expect(['cloudflare-workers-ai', 'google-gemini']).toContain(body.data.provider);
    expect(body.data.configuredModel).toBeDefined();
    // Verify no secret leak
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('GEMINI_API_KEY');
    expect(bodyStr).not.toContain('AI_SECRET');
  });

  // 21. Telemetry verification: providerUsed and fallbackReason are accurately recorded
  it('21. Provider telemetry differentiates mock-fallback from real Gemini without falsification', async () => {
    const res = await app.request(
      '/api/v1/ai/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': 'guest_telemetry_check',
        },
        body: JSON.stringify({
          message: 'Chính sách bảo hành tại EdgeCart như thế nào?',
          stream: false,
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    const metadata = body.data.assistantMessage.metadata;
    expect(metadata).toBeDefined();
    // In test environment without real key, it must report mock-fallback, NOT gemini
    expect(metadata.provider).toBe('mock-fallback');
    expect(metadata.fallbackReason).toBeDefined();
  });
});
