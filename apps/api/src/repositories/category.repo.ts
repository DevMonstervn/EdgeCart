export interface DbCategory {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export class CategoryRepository {
  constructor(private db: D1Database) {}

  async findAllActive(): Promise<DbCategory[]> {
    const query = 'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC';
    const { results } = await this.db.prepare(query).all<DbCategory>();
    return results || [];
  }

  async findBySlug(slug: string): Promise<DbCategory | null> {
    const query = 'SELECT * FROM categories WHERE slug = ? LIMIT 1';
    return await this.db.prepare(query).bind(slug).first<DbCategory>();
  }

  async findById(id: string): Promise<DbCategory | null> {
    const query = 'SELECT * FROM categories WHERE id = ? LIMIT 1';
    return await this.db.prepare(query).bind(id).first<DbCategory>();
  }

  async create(data: {
    id: string;
    parentId?: string | null;
    name: string;
    slug: string;
    description?: string | null;
    imageUrl?: string | null;
    sortOrder?: number;
  }): Promise<DbCategory> {
    const query = `
      INSERT INTO categories (id, parent_id, name, slug, description, image_url, sort_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const res = await this.db
      .prepare(query)
      .bind(
        data.id,
        data.parentId || null,
        data.name,
        data.slug,
        data.description || null,
        data.imageUrl || null,
        data.sortOrder ?? 0
      )
      .first<DbCategory>();

    if (!res) throw new Error('Không thể tạo danh mục');
    return res;
  }
}
