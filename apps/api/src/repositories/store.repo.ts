import type { UpdateStoreInput, StoreStatus } from '@edgecart/shared';
import { AuditRepository } from './audit.repo.js';

export interface DbStore {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DbStoreAdminRow extends DbStore {
  owner_email: string;
  owner_full_name: string;
  product_count: number;
}

export class StoreRepository {
  private auditRepo: AuditRepository;

  constructor(private db: D1Database) {
    this.auditRepo = new AuditRepository(db);
  }

  async findById(id: string): Promise<DbStore | null> {
    return await this.db.prepare('SELECT * FROM stores WHERE id = ? LIMIT 1').bind(id).first<DbStore>();
  }

  async findByOwnerUserId(ownerUserId: string): Promise<DbStore | null> {
    return await this.db
      .prepare('SELECT * FROM stores WHERE owner_user_id = ? LIMIT 1')
      .bind(ownerUserId)
      .first<DbStore>();
  }

  async findBySlug(slug: string): Promise<DbStore | null> {
    return await this.db
      .prepare('SELECT * FROM stores WHERE slug = ? COLLATE NOCASE LIMIT 1')
      .bind(slug.trim().toLowerCase())
      .first<DbStore>();
  }

  async findActiveBySlug(slug: string): Promise<DbStore | null> {
    return await this.db
      .prepare("SELECT * FROM stores WHERE slug = ? COLLATE NOCASE AND status = 'ACTIVE' LIMIT 1")
      .bind(slug.trim().toLowerCase())
      .first<DbStore>();
  }

  async findByIds(ids: string[]): Promise<Map<string, DbStore>> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    const map = new Map<string, DbStore>();
    if (uniqueIds.length === 0) return map;

    const placeholders = uniqueIds.map(() => '?').join(', ');
    const { results } = await this.db
      .prepare(`SELECT * FROM stores WHERE id IN (${placeholders})`)
      .bind(...uniqueIds)
      .all<DbStore>();

    for (const row of results || []) {
      map.set(row.id, row);
    }
    return map;
  }

  async findAllStores(params: {
    status?: string;
    q?: string;
    limit: number;
    offset: number;
  }): Promise<{ stores: DbStoreAdminRow[]; total: number }> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.status) {
      conditions.push('s.status = ?');
      bindings.push(params.status);
    }
    if (params.q) {
      conditions.push('(s.name LIKE ? OR s.slug LIKE ? OR u.email LIKE ?)');
      bindings.push(`%${params.q}%`, `%${params.q}%`, `%${params.q}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM stores s
        JOIN users u ON s.owner_user_id = u.id
        ${whereClause}
      `)
      .bind(...bindings)
      .first<{ count: number }>();
    const total = countRes?.count || 0;

    const { results } = await this.db
      .prepare(`
        SELECT
          s.*,
          u.email as owner_email,
          u.full_name as owner_full_name,
          (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id AND p.is_active = 1) as product_count
        FROM stores s
        JOIN users u ON s.owner_user_id = u.id
        ${whereClause}
        ORDER BY s.created_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(...bindings, params.limit, params.offset)
      .all<DbStoreAdminRow>();

    return { stores: results || [], total };
  }

  async updateProfile(storeId: string, data: UpdateStoreInput): Promise<DbStore> {
    const sets: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const bindings: unknown[] = [];

    if (data.name !== undefined) {
      sets.push('name = ?');
      bindings.push(data.name.trim());
    }
    if (data.description !== undefined) {
      sets.push('description = ?');
      bindings.push(data.description ? data.description.trim() : null);
    }
    if (data.logoUrl !== undefined) {
      sets.push('logo_url = ?');
      bindings.push(data.logoUrl || null);
    }
    if (data.bannerUrl !== undefined) {
      sets.push('banner_url = ?');
      bindings.push(data.bannerUrl || null);
    }
    if (data.phone !== undefined) {
      sets.push('phone = ?');
      bindings.push(data.phone || null);
    }
    if (data.email !== undefined) {
      sets.push('email = ?');
      bindings.push(data.email || null);
    }

    await this.db
      .prepare(`UPDATE stores SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...bindings, storeId)
      .run();

    const updated = await this.findById(storeId);
    if (!updated) throw new Error('Không tìm thấy cửa hàng');
    return updated;
  }

  async updateStatusWithAudit(params: {
    storeId: string;
    fromStatus: string;
    toStatus: StoreStatus;
    adminUserId: string;
    reason?: string;
    ipAddress?: string | null;
  }): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare('UPDATE stores SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(params.toStatus, params.storeId),
      this.auditRepo.prepareAuditStatement({
        userId: params.adminUserId,
        action: 'UPDATE_STORE_STATUS',
        entity: 'stores',
        entityId: params.storeId,
        payload: {
          fromStatus: params.fromStatus,
          toStatus: params.toStatus,
          reason: params.reason || null,
        },
        ipAddress: params.ipAddress,
      }),
    ];

    await this.db.batch(statements);
  }

  async getProductSlugsByStoreId(storeId: string): Promise<string[]> {
    const { results } = await this.db
      .prepare('SELECT slug FROM products WHERE store_id = ?')
      .bind(storeId)
      .all<{ slug: string }>();
    return (results || []).map((r) => r.slug);
  }
}
