import { apiClient, extractErrorMessage, getOrCreateGuestSessionId } from './api.js';
import type {
  AIConversation,
  AIMessage,
  AIStreamChunk,
  ApiResponse,
} from '@edgecart/shared';

export interface SendMessageOptions {
  conversationId?: string | null;
  message: string;
  signal?: AbortSignal;
  onChunk?: (chunk: AIStreamChunk) => void;
  onComplete?: () => void;
  onError?: (err: Error) => void;
}

export const aiService = {
  async listConversations(): Promise<AIConversation[]> {
    try {
      const res = await apiClient.get<ApiResponse<AIConversation[]>>('/ai/conversations', {
        headers: {
          'X-Session-Id': getOrCreateGuestSessionId(),
        },
      });
      return res.data.data || [];
    } catch {
      return [];
    }
  },

  async getConversation(id: string): Promise<{ conversation: AIConversation; messages: AIMessage[] } | null> {
    try {
      const res = await apiClient.get<ApiResponse<{ conversation: AIConversation; messages: AIMessage[] }>>(
        `/ai/conversations/${id}`,
        {
          headers: {
            'X-Session-Id': getOrCreateGuestSessionId(),
          },
        }
      );
      return res.data.data || null;
    } catch {
      return null;
    }
  },

  async deleteConversation(id: string): Promise<boolean> {
    try {
      const res = await apiClient.delete<ApiResponse<{ message: string }>>(`/ai/conversations/${id}`, {
        headers: {
          'X-Session-Id': getOrCreateGuestSessionId(),
        },
      });
      return res.data.success;
    } catch {
      return false;
    }
  },

  async sendMessageNonStreaming(params: {
    conversationId?: string | null;
    message: string;
  }): Promise<{ conversation: AIConversation; userMessage: AIMessage; assistantMessage: AIMessage }> {
    try {
      const res = await apiClient.post<
        ApiResponse<{ conversation: AIConversation; userMessage: AIMessage; assistantMessage: AIMessage }>
      >(
        '/ai/chat',
        {
          conversationId: params.conversationId,
          message: params.message,
          stream: false,
        },
        {
          headers: {
            'X-Session-Id': getOrCreateGuestSessionId(),
          },
        }
      );

      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Lỗi gửi tin nhắn đến AI');
      }

      return res.data.data;
    } catch (err: unknown) {
      throw new Error(extractErrorMessage(err));
    }
  },

  async streamMessage(options: SendMessageOptions): Promise<void> {
    const { conversationId, message, signal, onChunk, onComplete, onError } = options;

    const token = typeof window !== 'undefined' ? localStorage.getItem('ec_access_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Session-Id': getOrCreateGuestSessionId(),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const baseURL = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1';
    const url = `${baseURL}/ai/chat`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          conversationId,
          message,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Lỗi kết nối AI (${res.status}): ${errorText}`);
      }

      if (!res.body) {
        throw new Error('Máy chủ không phản hồi dữ liệu stream');
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
          try {
            const chunk: AIStreamChunk = JSON.parse(jsonStr);
            if (onChunk) onChunk(chunk);
          } catch {}
        }
      }

      if (onComplete) onComplete();
    } catch (err: unknown) {
      if ((err as any)?.name === 'AbortError') {
        // Stream was cleanly aborted by client
        if (onComplete) onComplete();
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      if (onError) onError(error);
      else throw error;
    }
  },
};
