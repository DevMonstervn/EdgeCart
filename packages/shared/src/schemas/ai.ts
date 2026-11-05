import { z } from 'zod';

export const AIChatRequestSchema = z
  .object({
    conversationId: z.string().uuid().optional().nullable(),
    message: z.string().trim().min(1, 'Tin nhắn không được để trống').max(2000, 'Tin nhắn tối đa 2.000 ký tự'),
    stream: z.boolean().optional().default(true),
  })
  .strict();

export type AIChatRequest = z.infer<typeof AIChatRequestSchema>;

export const CANONICAL_CATEGORY_SLUGS = [
  'dien-tu-cong-nghe',
  'phu-kien-may-tinh',
  'gia-dung-tien-ich',
  'thoi-trang-phu-kien',
] as const;

export type CanonicalCategorySlug = (typeof CANONICAL_CATEGORY_SLUGS)[number];

export function removeVietnameseTones(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

export function normalizeCategoryText(text: string): string {
  return removeVietnameseTones(text)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CATEGORY_EXACT_ALIASES: Record<CanonicalCategorySlug, string[]> = {
  'dien-tu-cong-nghe': [
    'dien-tu-cong-nghe',
    'dien tu cong nghe',
    'thiet bi dien tu phu kien cong nghe',
    'do cong nghe',
    'cong nghe',
    'dien tu',
    'thiet bi dien tu',
    'thiet bi cong nghe',
    'do dien tu',
    'dien thoai',
    'am thanh',
    'dien-tu',
    'cong-nghe',
  ],
  'phu-kien-may-tinh': [
    'phu-kien-may-tinh',
    'phu kien may tinh ban lam viec',
    'phu kien may tinh',
    'may tinh',
    'ban lam viec',
    'phu kien laptop',
    'laptop',
    'do may tinh',
    'ban-lam-viec',
    'van phong pham',
  ],
  'gia-dung-tien-ich': [
    'gia-dung-tien-ich',
    'do gia dung tien ich ca nhan',
    'do gia dung tien ich',
    'do gia dung',
    'gia dung',
    'tien ich',
    'tien ich ca nhan',
    'gia-dung',
    'tien-ich',
    'doi song',
  ],
  'thoi-trang-phu-kien': [
    'thoi-trang-phu-kien',
    'balo tui phong cach song',
    'thoi trang phu kien',
    'thoi trang',
    'thoi trang nam',
    'thoi trang nu',
    'phu kien thoi trang',
    'quan ao',
    'balo',
    'tui',
    'tui xach',
    'phong cach song',
    'thoi-trang',
    'balo-tui',
  ],
};

const CATEGORY_REGEX_PATTERNS: Array<{ slug: CanonicalCategorySlug; pattern: RegExp }> = [
  { slug: 'dien-tu-cong-nghe', pattern: /\b(cong nghe|dien tu|thiet bi dien tu|thiet bi cong nghe)\b/ },
  { slug: 'phu-kien-may-tinh', pattern: /\b(phu kien may tinh|may tinh|ban lam viec|phu kien laptop|laptop)\b/ },
  { slug: 'gia-dung-tien-ich', pattern: /\b(do gia dung|gia dung|tien ich|tien ich ca nhan)\b/ },
  { slug: 'thoi-trang-phu-kien', pattern: /\b(thoi trang|balo|tui xach|quan ao|phong cach song)\b/ },
];

export function resolveCategorySlug(raw?: string | null): CanonicalCategorySlug | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if ((CANONICAL_CATEGORY_SLUGS as readonly string[]).includes(lower)) {
    return lower as CanonicalCategorySlug;
  }

  const normalized = normalizeCategoryText(trimmed);
  if (!normalized) return undefined;

  for (const [slug, aliases] of Object.entries(CATEGORY_EXACT_ALIASES)) {
    if (aliases.includes(normalized)) {
      return slug as CanonicalCategorySlug;
    }
  }

  for (const { slug, pattern } of CATEGORY_REGEX_PATTERNS) {
    if (pattern.test(normalized)) {
      return slug;
    }
  }

  return undefined;
}

export const AISearchProductsInputSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    q: z.string().trim().max(200).optional(),
    keyword: z.string().trim().max(200).optional(),
    categorySlug: z.string().trim().max(100).optional(),
    category: z.string().trim().max(100).optional(),
    gender: z.string().trim().max(50).optional(),
    minPrice: z.coerce.number().int().nonnegative().optional(),
    maxPrice: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(10).optional().default(5),
  })
  .transform((val) => {
    const rawQuery = val.query || val.q || val.keyword;
    const rawCategory = val.categorySlug || val.category;
    const resolvedCategory = resolveCategorySlug(rawCategory);
    return {
      query: rawQuery && rawQuery.trim().length > 0 ? rawQuery.trim() : undefined,
      categorySlug: resolvedCategory,
      gender: val.gender && val.gender.trim().length > 0 ? val.gender.trim() : undefined,
      minPrice: val.minPrice,
      maxPrice: val.maxPrice,
      limit: val.limit ?? 5,
    };
  });

export type AISearchProductsInput = z.output<typeof AISearchProductsInputSchema>;

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
