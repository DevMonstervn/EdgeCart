export interface DbProduct {
  id: string;
  category_id: string;
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
    q?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: string;
    page: number;
    limit: number;
  }): Promise<{ products: DbProduct[]; total: number }> {
    const conditions: string[] = ['p.is_active = 1'];
    const bindings: any[] = [];

    if (params.categorySlug) {
      conditions.push('c.slug = ?');
      bindings.push(params.categorySlug);
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

  async findBySlug(slug: string): Promise<DbProduct | null> {
    const query = 'SELECT * FROM products WHERE slug = ? AND is_active = 1 LIMIT 1';
    return await this.db.prepare(query).bind(slug).first<DbProduct>();
  }

  async findById(id: string): Promise<DbProduct | null> {
    const query = 'SELECT * FROM products WHERE id = ? LIMIT 1';
    return await this.db.prepare(query).bind(id).first<DbProduct>();
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

  async createProductWithVariants(
    product: {
      id: string;
      categoryId: string;
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
    }>
  ): Promise<DbProduct> {
    const statements: D1PreparedStatement[] = [];

    // 1. Insert Product
    statements.push(
      this.db
        .prepare(`
          INSERT INTO products (id, category_id, name, slug, description, content_markdown, base_price, sale_price, is_featured, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `)
        .bind(
          product.id,
          product.categoryId,
          product.name,
          product.slug,
          product.description || null,
          product.contentMarkdown || null,
          product.basePrice,
          product.salePrice || null,
          product.isFeatured ? 1 : 0
        )
    );

    // 2. Insert Variants
    for (const v of variants) {
      statements.push(
        this.db
          .prepare(`
            INSERT INTO product_variants (id, product_id, sku, title, price, compare_at_price, stock_quantity, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `)
          .bind(v.id, product.id, v.sku, v.title, v.price, v.compareAtPrice || null, v.stockQuantity)
      );
    }

    await this.db.batch(statements);
    const created = await this.findById(product.id);
    if (!created) throw new Error('Không thể tạo sản phẩm');
    return created;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.db.prepare('UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
  }
}
