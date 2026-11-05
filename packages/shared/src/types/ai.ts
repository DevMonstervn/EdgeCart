export type AIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AIProductCardData {
  id: string;
  name: string;
  slug: string;
  basePrice: number;
  salePrice?: number | null;
  imageUrl?: string | null;
  stockQuantity: number;
  storeName?: string | null;
  categoryName?: string | null;
  isFeatured?: boolean;
}

export interface AIProductComparisonData {
  products: AIProductCardData[];
  attributes: {
    name: string;
    label: string;
    values: Record<string, string | number>;
  }[];
}

export interface AIOrderSummaryData {
  id: string;
  orderNumber: string;
  createdAt: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  shippingStatus: string;
  itemsCount: number;
  items: {
    productName: string;
    variantTitle: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[];
}

export interface AIStorePolicyData {
  topic: 'shipping' | 'payment' | 'return_refund' | 'warranty' | 'general';
  title: string;
  summary: string;
  details: string[];
}

export interface AIMessageMetadata {
  products?: AIProductCardData[];
  comparison?: AIProductComparisonData;
  orders?: AIOrderSummaryData[];
  policy?: AIStorePolicyData;
  suggestedQuestions?: string[];
  toolCalls?: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  }[];
  provider?: 'gemini' | 'mock-fallback';
  model?: string;
  fallbackReason?: string;
}

export interface AIMessage {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  content: string;
  metadata?: AIMessageMetadata | null;
  createdAt: string;
}

export interface AIConversation {
  id: string;
  userId?: string | null;
  sessionId?: string | null;
  title: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  lastMessage?: AIMessage | null;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIStreamChunk {
  type: 'text_delta' | 'metadata' | 'tool_call' | 'product_cards' | 'error' | 'done';
  conversationId?: string;
  title?: string;
  delta?: string;
  products?: AIProductCardData[];
  metadata?: AIMessageMetadata;
  error?: string;
}
