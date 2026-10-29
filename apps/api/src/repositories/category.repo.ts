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

  async findAll(includeInactive: boolean = false): Promise<DbCategory[]> {
    const query = includeInactive
      ? 'SELECT * FROM categories ORDER BY sort_order ASC, created_at DESC'
      : 'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC';
    const { results } = await this.db.prepare(query).all<DbCategory>();
    return results || [];
  }

  async countProductsByCategoryId(categoryId: string): Promise<number> {
    const query = 'SELECT COUNT(*) as count FROM products WHERE category_id = ?';
    const res = await this.db.prepare(query).bind(categoryId).first<{ count: number }>();
    return res?.count ?? 0;
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

  async update(
    id: string,
    data: {
      name?: string;
      slug?: string;
      parentId?: string | null;
      description?: string | null;
      imageUrl?: string | null;
      sortOrder?: number;
      isActive?: number;
    }
  ): Promise<DbCategory> {
    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const bindings: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      bindings.push(data.name.trim());
    }
    if (data.slug !== undefined) {
      updates.push('slug = ?');
      bindings.push(data.slug.trim().toLowerCase());
    }
    if (data.parentId !== undefined) {
      updates.push('parent_id = ?');
      bindings.push(data.parentId || null);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      bindings.push(data.description || null);
    }
    if (data.imageUrl !== undefined) {
      updates.push('image_url = ?');
      bindings.push(data.imageUrl || null);
    }
    if (data.sortOrder !== undefined) {
      updates.push('sort_order = ?');
      bindings.push(data.sortOrder);
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      bindings.push(data.isActive);
    }

    bindings.push(id);
    const query = `
      UPDATE categories
      SET ${updates.join(', ')}
      WHERE id = ?
      RETURNING *;
    `;
    const res = await this.db.prepare(query).bind(...bindings).first<DbCategory>();
    if (!res) throw new Error('Không tìm thấy danh mục để cập nhật');
    return res;
  }

  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM categories WHERE id = ?';
    await this.db.prepare(query).bind(id).run();
  }
}
