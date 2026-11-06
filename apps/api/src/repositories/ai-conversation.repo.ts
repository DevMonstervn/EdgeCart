import type { D1Database } from '@cloudflare/workers-types';
import type { AIConversation, AIMessage, AIMessageRole } from '@edgecart/shared';

export class AIConversationRepository {
  constructor(private db: D1Database) {}

  async createConversation(data: {
    id: string;
    userId?: string | null;
    sessionId?: string | null;
    title: string;
  }): Promise<AIConversation> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO ai_conversations (id, user_id, session_id, title, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`
      )
      .bind(data.id, data.userId || null, data.sessionId || null, data.title, now, now)
      .run();

    return {
      id: data.id,
      userId: data.userId || null,
      sessionId: data.sessionId || null,
      title: data.title,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
  }

  async getConversationById(
    id: string,
    userId?: string | null,
    sessionId?: string | null
  ): Promise<AIConversation | null> {
    // Fail-closed: Must provide either authenticated userId or guest sessionId
    if (!userId && !sessionId) {
      return null;
    }

    let query = `SELECT * FROM ai_conversations WHERE id = ?`;
    const params: unknown[] = [id];

    if (userId) {
      query += ` AND user_id = ?`;
      params.push(userId);
    } else if (sessionId) {
      query += ` AND session_id = ? AND user_id IS NULL`;
      params.push(sessionId);
    }

    const row = await this.db.prepare(query).bind(...params).first<any>();
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listConversations(
    userId?: string | null,
    sessionId?: string | null,
    limit: number = 20
  ): Promise<AIConversation[]> {
    let query = `SELECT * FROM ai_conversations WHERE status = 'ACTIVE'`;
    const params: unknown[] = [];

    if (userId) {
      query += ` AND user_id = ?`;
      params.push(userId);
    } else if (sessionId) {
      query += ` AND session_id = ? AND user_id IS NULL`;
      params.push(sessionId);
    } else {
      return [];
    }

    query += ` ORDER BY updated_at DESC LIMIT ?`;
    params.push(limit);

    const result = await this.db.prepare(query).bind(...params).all<any>();
    return (result.results || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async updateConversationTitle(id: string, title: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(`UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?`)
      .bind(title, now, id)
      .run();
  }

  async touchConversation(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(`UPDATE ai_conversations SET updated_at = ? WHERE id = ?`)
      .bind(now, id)
      .run();
  }

  async deleteConversation(
    id: string,
    userId?: string | null,
    sessionId?: string | null
  ): Promise<boolean> {
    // Fail-closed: Must provide either authenticated userId or guest sessionId
    if (!userId && !sessionId) {
      return false;
    }

    // Verify ownership before deletion
    const conv = await this.getConversationById(id, userId, sessionId);
    if (!conv) {
      return false;
    }

    // Atomic explicit deletion of messages and conversation via D1 batch
    // Guarantees zero orphan messages regardless of PRAGMA foreign_keys status
    const batchResults = await this.db.batch([
      this.db.prepare(`DELETE FROM ai_messages WHERE conversation_id = ?`).bind(id),
      this.db.prepare(`DELETE FROM ai_conversations WHERE id = ?`).bind(id),
    ]);

    const convDeleteRes = batchResults[1];
    return (convDeleteRes?.meta?.changes ?? 0) > 0;
  }

  async createMessage(data: {
    id: string;
    conversationId: string;
    role: AIMessageRole;
    content: string;
    metadataJson?: string | null;
  }): Promise<AIMessage> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO ai_messages (id, conversation_id, role, content, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(data.id, data.conversationId, data.role, data.content, data.metadataJson || null, now)
      .run();

    let parsedMetadata = null;
    if (data.metadataJson) {
      try {
        parsedMetadata = JSON.parse(data.metadataJson);
      } catch {}
    }

    return {
      id: data.id,
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      metadata: parsedMetadata,
      createdAt: now,
    };
  }

  async getMessages(conversationId: string, limit: number = 50): Promise<AIMessage[]> {
    const query = `
      SELECT * FROM ai_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `;
    const result = await this.db.prepare(query).bind(conversationId, limit).all<any>();

    return (result.results || []).map((row) => {
      let parsedMetadata = null;
      if (row.metadata_json) {
        try {
          parsedMetadata = JSON.parse(row.metadata_json);
        } catch {}
      }
      return {
        id: row.id,
        conversationId: row.conversation_id,
        role: row.role as AIMessageRole,
        content: row.content,
        metadata: parsedMetadata,
        createdAt: row.created_at,
      };
    });
  }
}
