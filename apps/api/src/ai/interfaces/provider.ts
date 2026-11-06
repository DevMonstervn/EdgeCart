import type { AIMessageRole, AIToolDefinition, AIToolCall, AIStreamChunk } from '@edgecart/shared';

export interface ProviderChatMessage {
  role: AIMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: AIToolCall[];
}

export interface ProviderResponse {
  message: {
    role: 'assistant';
    content: string;
    toolCalls?: AIToolCall[];
  };
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  providerUsed?: 'workers-ai' | 'gemini' | 'mock-fallback';
  modelUsed?: string;
  fallbackReason?: string;
}

export interface AIProvider {
  readonly providerName: string;
  generateResponse(
    messages: ProviderChatMessage[],
    tools?: AIToolDefinition[],
    options?: {
      temperature?: number;
      maxOutputTokens?: number;
      systemInstruction?: string;
    }
  ): Promise<ProviderResponse>;

  streamResponse(
    messages: ProviderChatMessage[],
    tools?: AIToolDefinition[],
    options?: {
      temperature?: number;
      maxOutputTokens?: number;
      systemInstruction?: string;
    }
  ): AsyncIterable<AIStreamChunk>;
}
