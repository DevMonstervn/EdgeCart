export interface DbAddress {
  id: string;
  user_id: string;
  recipient_name: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  street_address: string;
  is_default: number;
  label?: string | null;
  created_at: string;
  updated_at: string;
}

export class AddressRepository {
  constructor(private db: D1Database) {}

  async listByUserId(userId: string): Promise<DbAddress[]> {
    const query = `
      SELECT * FROM addresses
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at DESC
    `;
    const { results } = await this.db.prepare(query).bind(userId).all<DbAddress>();
    return results || [];
  }

  async findById(id: string): Promise<DbAddress | null> {
    const query = 'SELECT * FROM addresses WHERE id = ? LIMIT 1';
    return await this.db.prepare(query).bind(id).first<DbAddress>();
  }

  async findByIdAndUserId(id: string, userId: string): Promise<DbAddress | null> {
    const query = 'SELECT * FROM addresses WHERE id = ? AND user_id = ? LIMIT 1';
    return await this.db.prepare(query).bind(id, userId).first<DbAddress>();
  }

  async countByUserId(userId: string): Promise<number> {
    const query = 'SELECT COUNT(*) as count FROM addresses WHERE user_id = ?';
    const row = await this.db.prepare(query).bind(userId).first<{ count: number }>();
    return Number(row?.count || 0);
  }

  async create(data: {
    id: string;
    userId: string;
    recipientName: string;
    phone: string;
    province: string;
    district?: string | null;
    ward: string;
    streetAddress: string;
    isDefault: number;
    label?: string | null;
  }): Promise<DbAddress> {
    const existingCount = await this.countByUserId(data.userId);
    // Auto make default if first address or requested
    const shouldBeDefault = existingCount === 0 || data.isDefault === 1 ? 1 : 0;

    if (shouldBeDefault === 1) {
      await this.db
        .prepare('UPDATE addresses SET is_default = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .bind(data.userId)
        .run();
    }

    const queryWithLabel = `
      INSERT INTO addresses (
        id, user_id, recipient_name, phone, province, district, ward, street_address, is_default, label, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;

    const queryWithoutLabel = `
      INSERT INTO addresses (
        id, user_id, recipient_name, phone, province, district, ward, street_address, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;

    let created: DbAddress | null = null;
    try {
      created = await this.db
        .prepare(queryWithLabel)
        .bind(
          data.id,
          data.userId,
          data.recipientName,
          data.phone,
          data.province,
          data.district || '',
          data.ward,
          data.streetAddress,
          shouldBeDefault,
          data.label || 'HOME'
        )
        .first<DbAddress>();
    } catch (err: unknown) {
      if (err instanceof Error && (err.message.includes('no such column: label') || err.message.includes('has no column named label'))) {
        created = await this.db
          .prepare(queryWithoutLabel)
          .bind(
            data.id,
            data.userId,
            data.recipientName,
            data.phone,
            data.province,
            data.district || '',
            data.ward,
            data.streetAddress,
            shouldBeDefault
          )
          .first<DbAddress>();
      } else {
        throw err;
      }
    }

    if (!created) {
      throw new Error('Không thể thêm địa chỉ');
    }

    return created;
  }

  async update(
    id: string,
    userId: string,
    data: {
      recipientName: string;
      phone: string;
      province: string;
      district?: string | null;
      ward: string;
      streetAddress: string;
      isDefault?: number;
      label?: string | null;
    }
  ): Promise<DbAddress | null> {
    const current = await this.findByIdAndUserId(id, userId);
    if (!current) return null;

    if (data.isDefault === 1) {
      await this.db
        .prepare('UPDATE addresses SET is_default = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .bind(userId)
        .run();
    }

    // Keep current default status if not explicitly updated
    const isDefaultVal = data.isDefault !== undefined ? data.isDefault : current.is_default;

    const queryWithLabel = `
      UPDATE addresses
      SET
        recipient_name = ?,
        phone = ?,
        province = ?,
        district = ?,
        ward = ?,
        street_address = ?,
        is_default = ?,
        label = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
      RETURNING *;
    `;

    const queryWithoutLabel = `
      UPDATE addresses
      SET
        recipient_name = ?,
        phone = ?,
        province = ?,
        district = ?,
        ward = ?,
        street_address = ?,
        is_default = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
      RETURNING *;
    `;

    try {
      return await this.db
        .prepare(queryWithLabel)
        .bind(
          data.recipientName,
          data.phone,
          data.province,
          data.district !== undefined ? data.district || '' : current.district,
          data.ward,
          data.streetAddress,
          isDefaultVal,
          data.label !== undefined ? data.label : current.label || 'HOME',
          id,
          userId
        )
        .first<DbAddress>();
    } catch (err: unknown) {
      if (err instanceof Error && (err.message.includes('no such column: label') || err.message.includes('has no column named label'))) {
        return await this.db
          .prepare(queryWithoutLabel)
          .bind(
            data.recipientName,
            data.phone,
            data.province,
            data.district !== undefined ? data.district || '' : current.district,
            data.ward,
            data.streetAddress,
            isDefaultVal,
            id,
            userId
          )
          .first<DbAddress>();
      }
      throw err;
    }
  }

  async setDefault(id: string, userId: string): Promise<DbAddress | null> {
    const address = await this.findByIdAndUserId(id, userId);
    if (!address) return null;

    await this.db.batch([
      this.db
        .prepare('UPDATE addresses SET is_default = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .bind(userId),
      this.db
        .prepare('UPDATE addresses SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
        .bind(id, userId),
    ]);

    return await this.findByIdAndUserId(id, userId);
  }

  async delete(id: string, userId: string): Promise<{ success: boolean; newDefaultId?: string }> {
    const address = await this.findByIdAndUserId(id, userId);
    if (!address) return { success: false };

    const wasDefault = address.is_default === 1;

    await this.db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').bind(id, userId).run();

    let newDefaultId: string | undefined;

    // If deleted address was default, auto-promote the most recent remaining address
    if (wasDefault) {
      const remaining = await this.db
        .prepare('SELECT id FROM addresses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
        .bind(userId)
        .first<{ id: string }>();

      if (remaining) {
        newDefaultId = remaining.id;
        await this.db
          .prepare('UPDATE addresses SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(remaining.id)
          .run();
      }
    }

    return { success: true, newDefaultId };
  }
}
