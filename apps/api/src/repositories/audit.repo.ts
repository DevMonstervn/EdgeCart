export interface DbAuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: string | null;
  ip_address: string | null;
  created_at: string;
}

export class AuditRepository {
  constructor(private db: D1Database) {}

  prepareAuditStatement(params: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    payload?: unknown;
    ipAddress?: string | null;
  }): D1PreparedStatement {
    return this.db
      .prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity, entity_id, payload, ip_address, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
      `)
      .bind(
        crypto.randomUUID(),
        params.userId || null,
        params.action,
        params.entity,
        params.entityId || null,
        params.payload !== undefined ? JSON.stringify(params.payload) : null,
        params.ipAddress || null
      );
  }

  async log(params: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    payload?: unknown;
    ipAddress?: string | null;
  }): Promise<void> {
    await this.prepareAuditStatement(params).run();
  }

  async findAll(params: {
    entity?: string;
    action?: string;
    userId?: string;
    limit: number;
    offset: number;
  }): Promise<{ logs: DbAuditLog[]; total: number }> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.entity) {
      conditions.push('entity = ?');
      bindings.push(params.entity);
    }
    if (params.action) {
      conditions.push('action = ?');
      bindings.push(params.action);
    }
    if (params.userId) {
      conditions.push('user_id = ?');
      bindings.push(params.userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db
      .prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`)
      .bind(...bindings)
      .first<{ count: number }>();
    const total = countRes?.count || 0;

    const { results } = await this.db
      .prepare(`SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, params.limit, params.offset)
      .all<DbAuditLog>();

    return { logs: results || [], total };
  }
}
