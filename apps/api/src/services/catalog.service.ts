import { CategoryRepository } from '../repositories/category.repo.js';
import { ProductRepository } from '../repositories/product.repo.js';
import { StoreRepository, type DbStore } from '../repositories/store.repo.js';
import type { Env } from '../types/env.js';
import type {
  Category,
  Product,
  ProductVariant,
  ProductImage,
  ProductFilterQuery,
  StoreSummary,
  StoreStatus,
} from '@edgecart/shared';

function toStoreSummary(s: DbStore | null | undefined): StoreSummary | null {
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    logoUrl: s.logo_url,
    status: s.status as StoreStatus,
  };
}

export class CatalogService {
  private categoryRepo: CategoryRepository;
  private productRepo: ProductRepository;
  private storeRepo: StoreRepository;

  constructor(private env: Env) {
    this.categoryRepo = new CategoryRepository(env.DB);
    this.productRepo = new ProductRepository(env.DB);
    this.storeRepo = new StoreRepository(env.DB);
  }

  async getCategories(): Promise<Category[]> {
    const cacheKey = 'cache:categories:tree';

    // 1. Try KV Cache
    if (this.env.KV) {
      const cached = await this.env.KV.get(cacheKey, 'text');
      if (cached) {
        return JSON.parse(cached);
      }
    }

    // 2. Query D1
    const dbCategories = await this.categoryRepo.findAllActive();
    const categories: Category[] = dbCategories.map((c) => ({
      id: c.id,
      parentId: c.parent_id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.image_url,
      sortOrder: c.sort_order,
      isActive: c.is_active === 1,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    // Build hierarchy
    const map = new Map<string, Category>();
    const roots: Category[] = [];

    categories.forEach((cat) => {
      map.set(cat.id, { ...cat, children: [] });
    });

    categories.forEach((cat) => {
      const node = map.get(cat.id)!;
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    // 3. Cache to KV (TTL: 1 hour = 3600s)
    if (this.env.KV) {
      await this.env.KV.put(cacheKey, JSON.stringify(roots), { expirationTtl: 3600 });
    }

    return roots;
  }

  async getProducts(params: Partial<ProductFilterQuery>): Promise<{ products: Product[]; meta: any }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 50);

    const { products: dbProducts, total } = await this.productRepo.findProducts({
      categorySlug: params.category,
      storeSlug: params.store,
      q: params.q,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      sort: params.sort,
      page,
      limit,
    });

    const storeIds = dbProducts.map((p) => p.store_id).filter((id): id is string => Boolean(id));
    const storeMap = await this.storeRepo.findByIds(storeIds);

    const products: Product[] = [];
    for (const p of dbProducts) {
      const [variants, images] = await Promise.all([
        this.productRepo.getVariantsByProductId(p.id),
        this.productRepo.getImagesByProductId(p.id),
      ]);

      products.push({
        id: p.id,
        categoryId: p.category_id,
        storeId: p.store_id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        contentMarkdown: p.content_markdown,
        basePrice: p.base_price,
        salePrice: p.sale_price,
        isFeatured: p.is_featured === 1,
        isActive: p.is_active === 1,
        store: p.store_id ? toStoreSummary(storeMap.get(p.store_id)) : null,
        variants: variants.map((v) => ({
          id: v.id,
          productId: v.product_id,
          sku: v.sku,
          barcode: v.barcode,
          title: v.title,
          price: v.price,
          compareAtPrice: v.compare_at_price,
          stockQuantity: v.stock_quantity,
          isActive: v.is_active === 1,
          createdAt: v.created_at,
          updatedAt: v.updated_at,
        })),
        images: images.map((img) => ({
          id: img.id,
          productId: img.product_id,
          variantId: img.variant_id,
          imageUrl: img.image_url,
          r2Key: img.r2_key,
          altText: img.alt_text,
          sortOrder: img.sort_order,
          createdAt: img.created_at,
        })),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      });
    }

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      products,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getProductBySlug(slug: string): Promise<Product> {
    const cacheKey = `cache:product:${slug}`;

    if (this.env.KV) {
      const cached = await this.env.KV.get(cacheKey, 'text');
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const p = await this.productRepo.findBySlug(slug);
    if (!p) {
      throw new Error('Không tìm thấy sản phẩm');
    }

    const [variants, images, category, dbStore] = await Promise.all([
      this.productRepo.getVariantsByProductId(p.id),
      this.productRepo.getImagesByProductId(p.id),
      this.categoryRepo.findById(p.category_id),
      p.store_id ? this.storeRepo.findById(p.store_id) : Promise.resolve(null),
    ]);

    const product: Product = {
      id: p.id,
      categoryId: p.category_id,
      storeId: p.store_id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      contentMarkdown: p.content_markdown,
      basePrice: p.base_price,
      salePrice: p.sale_price,
      isFeatured: p.is_featured === 1,
      isActive: p.is_active === 1,
      store: toStoreSummary(dbStore),
      category: category
        ? {
            id: category.id,
            name: category.name,
            slug: category.slug,
            sortOrder: category.sort_order,
            isActive: category.is_active === 1,
            createdAt: category.created_at,
            updatedAt: category.updated_at,
          }
        : undefined,
      variants: variants.map((v) => ({
        id: v.id,
        productId: v.product_id,
        sku: v.sku,
        barcode: v.barcode,
        title: v.title,
        price: v.price,
        compareAtPrice: v.compare_at_price,
        stockQuantity: v.stock_quantity,
        isActive: v.is_active === 1,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
      })),
      images: images.map((img) => ({
        id: img.id,
        productId: img.product_id,
        variantId: img.variant_id,
        imageUrl: img.image_url,
        r2Key: img.r2_key,
        altText: img.alt_text,
        sortOrder: img.sort_order,
        createdAt: img.created_at,
      })),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };

    if (this.env.KV) {
      await this.env.KV.put(cacheKey, JSON.stringify(product), { expirationTtl: 1800 });
    }

    return product;
  }

  async invalidateCatalogCache(slug?: string): Promise<void> {
    if (!this.env.KV) return;
    await this.env.KV.delete('cache:categories:tree');
    if (slug) {
      await this.env.KV.delete(`cache:product:${slug}`);
    }
  }

  async invalidateProductSlugs(slugs: string[]): Promise<void> {
    if (!this.env.KV || slugs.length === 0) return;
    await Promise.all(slugs.map((slug) => this.env.KV.delete(`cache:product:${slug}`)));
  }
}
