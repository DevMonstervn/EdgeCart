import type { ProductImageInput, SellerProductUpdateInput } from '@edgecart/shared';

export interface DbProduct {
  id: string;
  category_id: string;
  store_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  content_markdown: string | null;
  base_price: number;
  sale_price: number | null;
  is_featured: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface DbVariantWithOwnership extends DbVariant {
  product_store_id: string | null;
  product_is_active: number;
  product_slug: string;
  store_status: string | null;
}

export interface DbVariant {
  id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  title: string;
  option1_name: string | null;
  option1_value: string | null;
  option2_name: string | null;
  option2_value: string | null;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number;
  weight_grams: number | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface DbProductImage {
  id: string;
  product_id: string;
  variant_id: string | null;
  image_url: string;
  r2_key: string;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
}

export class ProductRepository {
  constructor(private db: D1Database) {}

  async findProducts(params: {
    categorySlug?: string;
    storeSlug?: string;
    storeId?: string;
    q?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: string;
    page: number;
    limit: number;
  }): Promise<{ products: DbProduct[]; total: number }> {
    const conditions: string[] = [
      'p.is_active = 1',
      "(p.store_id IS NULL OR s.status = 'ACTIVE')",
    ];
    const bindings: any[] = [];

    if (params.categorySlug) {
      conditions.push('c.slug = ?');
      bindings.push(params.categorySlug);
    }

    if (params.storeSlug) {
      conditions.push('s.slug = ? COLLATE NOCASE');
      bindings.push(params.storeSlug.trim().toLowerCase());
    }

    if (params.storeId) {
      conditions.push('p.store_id = ?');
      bindings.push(params.storeId);
    }

    if (params.q) {
      conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
      bindings.push(`%${params.q}%`, `%${params.q}%`);
    }

    if (params.minPrice !== undefined) {
      conditions.push('COALESCE(p.sale_price, p.base_price) >= ?');
      bindings.push(params.minPrice);
    }

    if (params.maxPrice !== undefined) {
      conditions.push('COALESCE(p.sale_price, p.base_price) <= ?');
      bindings.push(params.maxPrice);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'p.created_at DESC';
    if (params.sort === 'price_asc') {
      orderBy = 'COALESCE(p.sale_price, p.base_price) ASC';
    } else if (params.sort === 'price_desc') {
      orderBy = 'COALESCE(p.sale_price, p.base_price) DESC';
    } else if (params.sort === 'popular') {
      orderBy = 'p.is_featured DESC, p.created_at DESC';
    }

    // Count Total
    const countQuery = `
      SELECT COUNT(*) as count 
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN stores s ON p.store_id = s.id
      ${whereClause}
    `;
    const countRes = await this.db.prepare(countQuery).bind(...bindings).first<{ count: number }>();
    const total = countRes?.count || 0;

    // Fetch Page
    const offset = (params.page - 1) * params.limit;
    const fetchQuery = `
      SELECT p.*
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN stores s ON p.store_id = s.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const { results } = await this.db
      .prepare(fetchQuery)
      .bind(...bindings, params.limit, offset)
      .all<DbProduct>();

    return { products: results || [], total };
  }

  async findSellerProducts(
    storeId: string,
    params: { q?: string; includeInactive?: boolean; page: number; limit: number }
  ): Promise<{ products: DbProduct[]; total: number }> {
    const conditions: string[] = ['p.store_id = ?'];
    const bindings: unknown[] = [storeId];

    if (!params.includeInactive) {
      // By default Seller sees both active and hidden products unless filtered
    }

    if (params.q) {
      conditions.push('(p.name LIKE ? OR p.slug LIKE ?)');
      bindings.push(`%${params.q}%`, `%${params.q}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const countRes = await this.db
      .prepare(`SELECT COUNT(*) as count FROM products p ${whereClause}`)
      .bind(...bindings)
      .first<{ count: number }>();
    const total = countRes?.count || 0;

    const offset = (params.page - 1) * params.limit;
    const { results } = await this.db
      .prepare(`SELECT p.* FROM products p ${whereClause} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, params.limit, offset)
      .all<DbProduct>();

    return { products: results || [], total };
  }

  async findAdminProducts(params: {
    q?: string;
    scope?: 'system' | 'all';
    storeId?: string;
    includeInactive?: boolean;
    page: number;
    limit: number;
  }): Promise<{ products: DbProduct[]; total: number }> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (!params.includeInactive) {
      conditions.push('p.is_active = 1');
    }

    if (params.scope === 'system') {
      conditions.push('p.store_id IS NULL');
    } else if (params.storeId) {
      conditions.push('p.store_id = ?');
      bindings.push(params.storeId);
    }

    if (params.q) {
      conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
      bindings.push(`%${params.q}%`, `%${params.q}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await this.db
      .prepare(`SELECT COUNT(*) as count FROM products p ${whereClause}`)
      .bind(...bindings)
      .first<{ count: number }>();
    const total = countRes?.count || 0;

    const offset = (params.page - 1) * params.limit;
    const { results } = await this.db
      .prepare(`SELECT p.* FROM products p ${whereClause} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, params.limit, offset)
      .all<DbProduct>();

    return { products: results || [], total };
  }

  async findBySlug(slug: string): Promise<DbProduct | null> {
    const query = `
      SELECT p.*
      FROM products p
      LEFT JOIN stores s ON p.store_id = s.id
      WHERE p.slug = ? COLLATE NOCASE
        AND p.is_active = 1
        AND (p.store_id IS NULL OR s.status = 'ACTIVE')
      LIMIT 1
    `;
    return await this.db.prepare(query).bind(slug).first<DbProduct>();
  }

  async findAnyBySlug(slug: string): Promise<DbProduct | null> {
    const query = 'SELECT * FROM products WHERE slug = ? COLLATE NOCASE LIMIT 1';
    return await this.db.prepare(query).bind(slug).first<DbProduct>();
  }

  async findById(id: string): Promise<DbProduct | null> {
    const query = 'SELECT * FROM products WHERE id = ? LIMIT 1';
    return await this.db.prepare(query).bind(id).first<DbProduct>();
  }

  async findByIdAndStoreId(id: string, storeId: string): Promise<DbProduct | null> {
    const query = 'SELECT * FROM products WHERE id = ? AND store_id = ? LIMIT 1';
    return await this.db.prepare(query).bind(id, storeId).first<DbProduct>();
  }

  async getVariantsByProductId(productId: string): Promise<DbVariant[]> {
    const query = 'SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY price ASC';
    const { results } = await this.db.prepare(query).bind(productId).all<DbVariant>();
    return results || [];
  }

  async getImagesByProductId(productId: string): Promise<DbProductImage[]> {
    const query = 'SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC';
    const { results } = await this.db.prepare(query).bind(productId).all<DbProductImage>();
    return results || [];
  }

  async findVariantById(variantId: string): Promise<DbVariant | null> {
    const query = 'SELECT * FROM product_variants WHERE id = ? LIMIT 1';
    return await this.db.prepare(query).bind(variantId).first<DbVariant>();
  }

  async findVariantBySku(sku: string): Promise<DbVariant | null> {
    const query = 'SELECT * FROM product_variants WHERE sku = ? COLLATE NOCASE LIMIT 1';
    return await this.db.prepare(query).bind(sku.trim()).first<DbVariant>();
  }

  async findVariantWithOwnership(variantId: string): Promise<DbVariantWithOwnership | null> {
    const query = `
      SELECT
        pv.*,
        p.store_id as product_store_id,
        p.is_active as product_is_active,
        p.slug as product_slug,
        s.status as store_status
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN stores s ON p.store_id = s.id
      WHERE pv.id = ?
      LIMIT 1
    `;
    return await this.db.prepare(query).bind(variantId).first<DbVariantWithOwnership>();
  }

  async createProductWithVariants(
    product: {
      id: string;
      categoryId: string;
      storeId?: string | null;
      name: string;
      slug: string;
      description?: string | null;
      contentMarkdown?: string | null;
      basePrice: number;
      salePrice?: number | null;
      isFeatured?: boolean;
    },
    variants: Array<{
      id: string;
      sku: string;
      title: string;
      price: number;
      compareAtPrice?: number | null;
      stockQuantity: number;
      option1Name?: string | null;
      option1Value?: string | null;
      option2Name?: string | null;
      option2Value?: string | null;
      weightGrams?: number | null;
    }>,
    images?: ProductImageInput[]
  ): Promise<DbProduct> {
    const statements: D1PreparedStatement[] = [];

    // 1. Insert Product (store_id = NULL for Official Admin products; storeId = store.id for Seller products)
    statements.push(
      this.db
        .prepare(`
          INSERT INTO products (id, category_id, store_id, name, slug, description, content_markdown, base_price, sale_price, is_featured, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `)
        .bind(
          product.id,
          product.categoryId,
          product.storeId ?? null,
          product.name,
          product.slug,
          product.description || null,
          product.contentMarkdown || null,
          product.basePrice,
          product.salePrice ?? null,
          product.isFeatured ? 1 : 0
        )
    );

    // 2. Insert Variants
    for (const v of variants) {
      statements.push(
        this.db
          .prepare(`
            INSERT INTO product_variants (
              id, product_id, sku, title, option1_name, option1_value, option2_name, option2_value,
              price, compare_at_price, stock_quantity, weight_grams, is_active, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `)
          .bind(
            v.id,
            product.id,
            v.sku,
            v.title,
            v.option1Name ?? null,
            v.option1Value ?? null,
            v.option2Name ?? null,
            v.option2Value ?? null,
            v.price,
            v.compareAtPrice ?? null,
            v.stockQuantity,
            v.weightGrams ?? 0
          )
      );
    }

    // 3. Insert Product Images (if provided)
    if (images && images.length > 0) {
      images.forEach((img, idx) => {
        statements.push(
          this.db
            .prepare(`
              INSERT INTO product_images (id, product_id, variant_id, image_url, r2_key, alt_text, sort_order, created_at)
              VALUES (?, ?, NULL, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `)
            .bind(
              crypto.randomUUID(),
              product.id,
              img.imageUrl.trim(),
              img.r2Key.trim(),
              img.altText?.trim() || null,
              img.sortOrder ?? idx
            )
        );
      });
    }

    await this.db.batch(statements);
    const created = await this.findById(product.id);
    if (!created) throw new Error('Không thể tạo sản phẩm');
    return created;
  }

  async updateProduct(id: string, data: SellerProductUpdateInput): Promise<DbProduct> {
    const sets: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const bindings: unknown[] = [];

    if (data.categoryId !== undefined) {
      sets.push('category_id = ?');
      bindings.push(data.categoryId);
    }
    if (data.name !== undefined) {
      sets.push('name = ?');
      bindings.push(data.name.trim());
    }
    if (data.description !== undefined) {
      sets.push('description = ?');
      bindings.push(data.description);
    }
    if (data.contentMarkdown !== undefined) {
      sets.push('content_markdown = ?');
      bindings.push(data.contentMarkdown);
    }
    if (data.basePrice !== undefined) {
      sets.push('base_price = ?');
      bindings.push(data.basePrice);
    }
    if (data.salePrice !== undefined) {
      sets.push('sale_price = ?');
      bindings.push(data.salePrice);
    }
    if (data.isActive !== undefined) {
      sets.push('is_active = ?');
      bindings.push(data.isActive ? 1 : 0);
    }

    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...bindings, id),
    ];

    if (data.images !== undefined) {
      statements.push(this.db.prepare('DELETE FROM product_images WHERE product_id = ?').bind(id));
      data.images.forEach((img, idx) => {
        statements.push(
          this.db
            .prepare(`
              INSERT INTO product_images (id, product_id, variant_id, image_url, r2_key, alt_text, sort_order, created_at)
              VALUES (?, ?, NULL, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `)
            .bind(
              crypto.randomUUID(),
              id,
              img.imageUrl.trim(),
              img.r2Key.trim(),
              img.altText?.trim() || null,
              img.sortOrder ?? idx
            )
        );
      });
    }

    await this.db.batch(statements);

    const updated = await this.findById(id);
    if (!updated) throw new Error('Không tìm thấy sản phẩm');
    return updated;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.db.prepare('UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
  }
}
