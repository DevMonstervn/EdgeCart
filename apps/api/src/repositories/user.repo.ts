export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  phone: string | null;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export class UserRepository {
  constructor(private db: D1Database) {}

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
      INSERT INTO users (id, email, password_hash, full_name, phone, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const res = await this.db
      .prepare(query)
      .bind(
        user.id,
        user.email.trim().toLowerCase(),
        user.passwordHash,
        user.fullName,
        user.phone || null,
        user.role || 'CUSTOMER'
      )
      .first<DbUser>();

    if (!res) throw new Error('Không thể tạo người dùng');
    return res;
  }
}
