import { z } from 'zod';

export const AIChatRequestSchema = z
  .object({
    conversationId: z.string().uuid().optional().nullable(),
    message: z.string().trim().min(1, 'Tin nhắn không được để trống').max(2000, 'Tin nhắn tối đa 2.000 ký tự'),
    stream: z.boolean().optional().default(true),
  })
  .strict();

export type AIChatRequest = z.infer<typeof AIChatRequestSchema>;

export const AISearchProductsInputSchema = z
  .object({
    query: z.string().trim().min(1).max(200).optional(),
    categorySlug: z.string().trim().optional(),
    minPrice: z.number().int().nonnegative().optional(),
    maxPrice: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(10).optional().default(5),
  })
  .strict();

export type AISearchProductsInput = z.infer<typeof AISearchProductsInputSchema>;

export const AIGetProductDetailsInputSchema = z
  .object({
    slugOrId: z.string().trim().min(1).max(200),
  })
  .strict();

export type AIGetProductDetailsInput = z.infer<typeof AIGetProductDetailsInputSchema>;

export const AICompareProductsInputSchema = z
  .object({
    productSlugsOrIds: z.array(z.string().trim().min(1)).min(2).max(4),
  })
  .strict();

export type AICompareProductsInput = z.infer<typeof AICompareProductsInputSchema>;

export const AIGetStorePolicyInputSchema = z
  .object({
    topic: z.enum(['shipping', 'payment', 'return_refund', 'warranty', 'general']),
  })
  .strict();

export type AIGetStorePolicyInput = z.infer<typeof AIGetStorePolicyInputSchema>;

export const AIGetMyOrdersInputSchema = z
  .object({
    limit: z.number().int().min(1).max(10).optional().default(5),
    status: z.string().trim().optional(),
  })
  .strict();

export type AIGetMyOrdersInput = z.infer<typeof AIGetMyOrdersInputSchema>;

export const AIGetMyOrderDetailsInputSchema = z
  .object({
    orderNumberOrId: z.string().trim().min(1).max(100),
  })
  .strict();

export type AIGetMyOrderDetailsInput = z.infer<typeof AIGetMyOrderDetailsInputSchema>;
