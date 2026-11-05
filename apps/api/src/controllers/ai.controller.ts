import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Env } from '../types/env.js';
import { AIOrchestratorService } from '../ai/services/orchestrator.service.js';
import { AIConversationRepository } from '../repositories/ai-conversation.repo.js';
import { AIChatRequestSchema, ERROR_CODES } from '@edgecart/shared';
import { ok, fail } from '../utils/response.js';
import { verifyJwt } from '../utils/jwt.js';

export const aiRouter = new Hono<{ Bindings: Env }>();

// Helper to extract optional authenticated user and/or guest session ID
async function getAuthAndSession(c: any): Promise<{
  userId: string | null;
  sessionId: string | null;
}> {
  let userId: string | null = null;
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    if (payload && payload.sub) {
      userId = payload.sub;
    }
  }

  const sessionId =
    c.req.header('x-session-id') ||
    c.req.header('X-Session-Id') ||
    null;

  return { userId, sessionId };
}

// 1. Chat endpoint: supports both SSE streaming and standard JSON
aiRouter.post('/chat', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = AIChatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return fail(c, 400, ERROR_CODES.VALIDATION_ERROR, 'Yêu cầu không hợp lệ', parsed.error.format());
  }

  const { conversationId, message, stream } = parsed.data;
  const { userId, sessionId } = await getAuthAndSession(c);

  const orchestrator = new AIOrchestratorService(c.env);

  // Streaming requested
  if (stream) {
    return streamSSE(c, async (sseStream) => {
      try {
        for await (const chunk of orchestrator.streamProcessMessage({
          conversationId,
          userId,
          sessionId,
          userMessage: message,
        })) {
          await sseStream.writeSSE({
            event: chunk.type,
            data: JSON.stringify(chunk),
          });
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Lỗi xử lý phản hồi AI';
        await sseStream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: errorMsg }),
        });
      }
    });
  }

  // Non-streaming JSON response
  try {
    const result = await orchestrator.processMessage({
      conversationId,
      userId,
      sessionId,
      userMessage: message,
    });
    return ok(c, result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi xử lý hội thoại AI';
    return fail(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, msg);
  }
});

// 2. List conversations
aiRouter.get('/conversations', async (c) => {
  const { userId, sessionId } = await getAuthAndSession(c);
  if (!userId && !sessionId) {
    return ok(c, []);
  }

  const repo = new AIConversationRepository(c.env.DB);
  const conversations = await repo.listConversations(userId, sessionId, 20);
  return ok(c, conversations);
});

// 3. Get single conversation with full message history
aiRouter.get('/conversations/:id', async (c) => {
  const id = c.req.param('id');
  const { userId, sessionId } = await getAuthAndSession(c);

  if (!userId && !sessionId) {
    return fail(c, 401, ERROR_CODES.AUTH_UNAUTHORIZED, 'Yêu cầu định danh người dùng hoặc phiên khách để truy cập');
  }

  const repo = new AIConversationRepository(c.env.DB);
  const conversation = await repo.getConversationById(id, userId, sessionId);

  if (!conversation) {
    return fail(c, 404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy cuộc trò chuyện');
  }

  const messages = await repo.getMessages(id, 50);
  return ok(c, {
    conversation,
    messages,
  });
});

// 4. Delete conversation
aiRouter.delete('/conversations/:id', async (c) => {
  const id = c.req.param('id');
  const { userId, sessionId } = await getAuthAndSession(c);

  if (!userId && !sessionId) {
    return fail(c, 401, ERROR_CODES.AUTH_UNAUTHORIZED, 'Yêu cầu định danh người dùng hoặc phiên khách để xóa cuộc trò chuyện');
  }

  const repo = new AIConversationRepository(c.env.DB);
  const deleted = await repo.deleteConversation(id, userId, sessionId);

  if (!deleted) {
    return fail(c, 404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy cuộc trò chuyện để xóa');
  }

  return ok(c, { message: 'Đã xóa cuộc trò chuyện thành công' });
});

// 5. Query available models securely (does not expose GEMINI_API_KEY)
aiRouter.get('/models', async (c) => {
  const orchestrator = new AIOrchestratorService(c.env);
  const colo = (c.req.raw as any)?.cf?.colo || 'UNKNOWN';
  const apiKey = (c.env.GEMINI_API_KEY || '').trim();

  // Test candidate models directly to diagnose upstream behavior empirically
  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ];
  const modelProbes: Record<string, { status: number; message: string }> = {};

  if (apiKey) {
    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const probeRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
        });
        const probeText = await probeRes.text().catch(() => '');
        let summary = probeText.slice(0, 150);
        try {
          const parsed = JSON.parse(probeText);
          summary = parsed.error?.message || summary;
        } catch {}
        modelProbes[model] = {
          status: probeRes.status,
          message: summary,
        };
      } catch (e: unknown) {
        modelProbes[model] = {
          status: 0,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    }
  }

  try {
    const models = await orchestrator.listAvailableModels();
    return ok(c, {
      provider: orchestrator.getProviderName(),
      edgeLocation: colo,
      configuredModel: c.env.AI_MODEL || (c.env.AI ? '@cf/meta/llama-3.3-70b-instruct-fp8-fast' : 'gemini-3.8-flash'),
      availableModels: models,
      hasAIBinding: Boolean(c.env.AI),
      hasGeminiKey: Boolean(apiKey),
      modelProbes,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return ok(c, {
      provider: orchestrator.getProviderName(),
      edgeLocation: colo,
      configuredModel: c.env.AI_MODEL || (c.env.AI ? '@cf/meta/llama-3.3-70b-instruct-fp8-fast' : 'gemini-3.8-flash'),
      availableModels: [],
      hasAIBinding: Boolean(c.env.AI),
      hasGeminiKey: Boolean(apiKey),
      status: 'UPSTREAM_RESTRICTED',
      upstreamMessage: msg,
      modelProbes,
    });
  }
});

