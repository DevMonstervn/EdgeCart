import { AuditRepository } from './audit.repo.js';

export interface DbSellerRequest {
  id: string;
  user_id: string;
  store_name: string;
  store_slug: string;
  store_description: string | null;
  phone: string | null;
  business_email: string | null;
  status: string;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbSellerRequestAdminRow extends DbSellerRequest {
  user_email: string;
  user_full_name: string;
  user_status: string;
}

export class SellerRequestRepository {
  private auditRepo: AuditRepository;

  constructor(private db: D1Database) {
    this.auditRepo = new AuditRepository(db);
  }

  async findById(id: string): Promise<DbSellerRequest | null> {
    return await this.db
      .prepare('SELECT * FROM seller_requests WHERE id = ? LIMIT 1')
      .bind(id)
      .first<DbSellerRequest>();
  }

  async findByUserId(userId: string): Promise<DbSellerRequest[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM seller_requests WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all<DbSellerRequest>();
    return results || [];
  }

  async findPendingByUserId(userId: string): Promise<DbSellerRequest | null> {
    return await this.db
      .prepare("SELECT * FROM seller_requests WHERE user_id = ? AND status = 'PENDING' LIMIT 1")
      .bind(userId)
      .first<DbSellerRequest>();
  }

  async findPendingBySlug(slug: string): Promise<DbSellerRequest | null> {
    return await this.db
      .prepare("SELECT * FROM seller_requests WHERE store_slug = ? COLLATE NOCASE AND status = 'PENDING' LIMIT 1")
      .bind(slug.trim().toLowerCase())
      .first<DbSellerRequest>();
  }

  async create(params: {
    id: string;
    userId: string;
    storeName: string;
    storeSlug: string;
    storeDescription?: string | null;
    phone?: string | null;
    businessEmail?: string | null;
  }): Promise<DbSellerRequest> {
    const res = await this.db
      .prepare(`
        INSERT INTO seller_requests (
          id, user_id, store_name, store_slug, store_description, phone, business_email,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *;
      `)
      .bind(
        params.id,
        params.userId,
        params.storeName.trim(),
        params.storeSlug.trim().toLowerCase(),
        params.storeDescription ? params.storeDescription.trim() : null,
        params.phone || null,
        params.businessEmail ? params.businessEmail.trim().toLowerCase() : null
      )
      .first<DbSellerRequest>();

    if (!res) throw new Error('Không thể tạo yêu cầu mở cửa hàng');
    return res;
  }

  async findAllRequests(params: {
    status?: string;
    limit: number;
    offset: number;
  }): Promise<{ requests: DbSellerRequestAdminRow[]; total: number }> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.status) {
      conditions.push('sr.status = ?');
      bindings.push(params.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM seller_requests sr
        JOIN users u ON sr.user_id = u.id
        ${whereClause}
      `)
      .bind(...bindings)
      .first<{ count: number }>();
    const total = countRes?.count || 0;

    const { results } = await this.db
      .prepare(`
        SELECT
          sr.*,
          u.email as user_email,
          u.full_name as user_full_name,
          u.status as user_status
        FROM seller_requests sr
        JOIN users u ON sr.user_id = u.id
        ${whereClause}
        ORDER BY sr.created_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(...bindings, params.limit, params.offset)
      .all<DbSellerRequestAdminRow>();

    return { requests: results || [], total };
  }

  async approveRequestAtomic(params: {
    requestId: string;
    userId: string;
    storeId: string;
    storeName: string;
    storeSlug: string;
    storeDescription: string | null;
    phone: string | null;
    businessEmail: string | null;
    reviewerId: string;
    ipAddress?: string | null;
  }): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(`
          UPDATE seller_requests
          SET status = 'APPROVED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'PENDING'
        `)
        .bind(params.reviewerId, params.requestId),
      this.db
        .prepare('UPDATE users SET is_seller = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(params.userId),
      this.db
        .prepare(`
          INSERT INTO stores (
            id, owner_user_id, name, slug, description, phone, email, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `)
        .bind(
          params.storeId,
          params.userId,
          params.storeName,
          params.storeSlug,
          params.storeDescription,
          params.phone,
          params.businessEmail
        ),
      this.auditRepo.prepareAuditStatement({
        userId: params.reviewerId,
        action: 'APPROVE_SELLER_REQUEST',
        entity: 'seller_requests',
        entityId: params.requestId,
        payload: {
          applicantUserId: params.userId,
          storeId: params.storeId,
          storeSlug: params.storeSlug,
        },
        ipAddress: params.ipAddress,
      }),
    ];

    const results = await this.db.batch(statements);
    if (!results[0]?.meta || results[0].meta.changes === 0) {
      throw new Error('Yêu cầu mở cửa hàng không ở trạng thái chờ duyệt hoặc đã được xử lý');
    }
  }

  async rejectRequestAtomic(params: {
    requestId: string;
    applicantUserId: string;
    rejectionReason: string;
    reviewerId: string;
    ipAddress?: string | null;
  }): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(`
          UPDATE seller_requests
          SET status = 'REJECTED', rejection_reason = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'PENDING'
        `)
        .bind(params.rejectionReason, params.reviewerId, params.requestId),
      this.auditRepo.prepareAuditStatement({
        userId: params.reviewerId,
        action: 'REJECT_SELLER_REQUEST',
        entity: 'seller_requests',
        entityId: params.requestId,
        payload: {
          applicantUserId: params.applicantUserId,
          rejectionReason: params.rejectionReason,
        },
        ipAddress: params.ipAddress,
      }),
    ];

    const results = await this.db.batch(statements);
    if (!results[0]?.meta || results[0].meta.changes === 0) {
      throw new Error('Yêu cầu mở cửa hàng không ở trạng thái chờ duyệt hoặc đã được xử lý');
    }
  }
}
