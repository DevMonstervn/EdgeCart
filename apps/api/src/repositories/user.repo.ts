import type { UserStatus, UserRole } from '@edgecart/shared';
import { AuditRepository } from './audit.repo.js';

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  phone: string | null;
  avatar_url?: string | null;
  role: string;
  is_seller: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export class UserRepository {
  private auditRepo: AuditRepository;

  constructor(private db: D1Database) {
    this.auditRepo = new AuditRepository(db);
  }

  async findByEmail(email: string): Promise<DbUser | null> {
    const query = 'SELECT * FROM users WHERE email = ? COLLATE NOCASE LIMIT 1';
    return await this.db.prepare(query).bind(email.trim().toLowerCase()).first<DbUser>();
  }

  async findById(id: string): Promise<DbUser | null> {
    const query = 'SELECT * FROM users WHERE id = ? LIMIT 1';
    return await this.db.prepare(query).bind(id).first<DbUser>();
  }

  async create(user: {
    id: string;
    email: string;
    passwordHash: string;
    fullName: string;
    phone?: string | null;
    role?: string;
  }): Promise<DbUser> {
    const query = `
      INSERT INTO users (id, email, password_hash, full_name, phone, role, is_seller, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'CUSTOMER', 0, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const res = await this.db
      .prepare(query)
      .bind(
        user.id,
        user.email.trim().toLowerCase(),
        user.passwordHash,
        user.fullName,
        user.phone || null
      )
      .first<DbUser>();

    if (!res) throw new Error('Không thể tạo người dùng');
    return res;
  }

  async findAllUsers(params: {
    role?: string;
    status?: string;
    isSeller?: boolean;
    q?: string;
    limit: number;
    offset: number;
  }): Promise<{ users: DbUser[]; total: number }> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.role) {
      conditions.push('role = ?');
      bindings.push(params.role);
    }
    if (params.status) {
      conditions.push('status = ?');
      bindings.push(params.status);
    }
    if (params.isSeller !== undefined) {
      conditions.push('is_seller = ?');
      bindings.push(params.isSeller ? 1 : 0);
    }
    if (params.q) {
      conditions.push('(email LIKE ? OR full_name LIKE ?)');
      bindings.push(`%${params.q}%`, `%${params.q}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db
      .prepare(`SELECT COUNT(*) as count FROM users ${whereClause}`)
      .bind(...bindings)
      .first<{ count: number }>();
    const total = countRes?.count || 0;

    const { results } = await this.db
      .prepare(`SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, params.limit, params.offset)
      .all<DbUser>();

    return { users: results || [], total };
  }

  async countActiveSuperAdmins(): Promise<number> {
    const res = await this.db
      .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'")
      .first<{ count: number }>();
    return res?.count || 0;
  }

  async updateStatusWithAudit(params: {
    targetUserId: string;
    fromStatus: string;
    toStatus: UserStatus;
    adminUserId: string;
    reason?: string;
    ipAddress?: string | null;
  }): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(params.toStatus, params.targetUserId),
      this.auditRepo.prepareAuditStatement({
        userId: params.adminUserId,
        action: 'UPDATE_USER_STATUS',
        entity: 'users',
        entityId: params.targetUserId,
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

  async updateRoleWithAudit(params: {
    targetUserId: string;
    fromRole: string;
    toRole: UserRole;
    adminUserId: string;
    reason?: string;
    ipAddress?: string | null;
  }): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(params.toRole, params.targetUserId),
      this.auditRepo.prepareAuditStatement({
        userId: params.adminUserId,
        action: 'UPDATE_USER_ROLE',
        entity: 'users',
        entityId: params.targetUserId,
        payload: {
          fromRole: params.fromRole,
          toRole: params.toRole,
          reason: params.reason || null,
        },
        ipAddress: params.ipAddress,
      }),
    ];

    await this.db.batch(statements);
  }

  async updateProfile(userId: string, data: { fullName?: string; phone?: string | null; avatarUrl?: string | null }): Promise<DbUser> {
    const fields: string[] = [];
    const bindings: unknown[] = [];

    if (data.fullName !== undefined) {
      fields.push('full_name = ?');
      bindings.push(data.fullName.trim());
    }
    if (data.phone !== undefined) {
      fields.push('phone = ?');
      bindings.push(data.phone && data.phone.trim() ? data.phone.trim() : null);
    }
    if (data.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      bindings.push(data.avatarUrl && data.avatarUrl.trim() ? data.avatarUrl.trim() : null);
    }

    if (fields.length === 0) {
      const user = await this.findById(userId);
      if (!user) throw new Error('Không tìm thấy người dùng');
      return user;
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    bindings.push(userId);

    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ? RETURNING *;`;
    const res = await this.db.prepare(query).bind(...bindings).first<DbUser>();
    if (!res) throw new Error('Cập nhật thông tin thất bại');
    return res;
  }
}
