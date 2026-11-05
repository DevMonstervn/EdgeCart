-- EdgeCart Migration 0005: AI Assistant Conversations & Messages Schema
-- Purely additive and safe for Cloudflare D1.

-- 1. AI Conversations
CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    session_id TEXT,
    title TEXT NOT NULL DEFAULT 'Cuộc trò chuyện mới',
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated
    ON ai_conversations(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_session_updated
    ON ai_conversations(session_id, updated_at DESC);

-- 2. AI Messages
CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv_created
    ON ai_messages(conversation_id, created_at ASC);
