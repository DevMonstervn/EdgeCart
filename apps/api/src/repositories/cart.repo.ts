export interface DbCart {
  id: string;
  user_id: string | null;
  session_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DbCartItemDetail {
  id: string;
  cart_id: string;
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_title: string;
  sku: string;
  unit_price: number;
  quantity: number;
  current_stock: number;
  image_url: string | null;
}

export class CartRepository {
  constructor(private db: D1Database) {}

  async getOrCreateCart(userId: string | null, sessionId: string | null): Promise<DbCart> {
    let cart: DbCart | null = null;

    if (userId) {
      cart = await this.db
        .prepare('SELECT * FROM carts WHERE user_id = ? AND status = ? LIMIT 1')
        .bind(userId, 'ACTIVE')
        .first<DbCart>();
    } else if (sessionId) {
      cart = await this.db
        .prepare('SELECT * FROM carts WHERE session_id = ? AND status = ? LIMIT 1')
        .bind(sessionId, 'ACTIVE')
        .first<DbCart>();
    }

    if (!cart) {
      const newId = crypto.randomUUID();
      const insertQuery = `
        INSERT INTO carts (id, user_id, session_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *;
      `;
      cart = await this.db.prepare(insertQuery).bind(newId, userId, sessionId).first<DbCart>();
    }

    if (!cart) throw new Error('Không thể khởi tạo giỏ hàng');
    return cart;
  }

  async getCartItems(cartId: string): Promise<DbCartItemDetail[]> {
    const query = `
      SELECT 
        ci.id,
        ci.cart_id,
        ci.variant_id,
        ci.quantity,
        ci.price_at_addition as unit_price,
        pv.product_id,
        p.name as product_name,
        pv.title as variant_title,
        pv.sku,
        pv.stock_quantity as current_stock,
        pi.image_url
      FROM cart_items ci
      JOIN product_variants pv ON ci.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at ASC
    `;

    const { results } = await this.db.prepare(query).bind(cartId).all<DbCartItemDetail>();
    return results || [];
  }

  async addItem(cartId: string, variantId: string, quantity: number, unitPrice: number): Promise<void> {
    const existing = await this.db
      .prepare('SELECT * FROM cart_items WHERE cart_id = ? AND variant_id = ? LIMIT 1')
      .bind(cartId, variantId)
      .first<{ id: string; quantity: number }>();

    if (existing) {
      await this.db
        .prepare('UPDATE cart_items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(quantity, existing.id)
        .run();
    } else {
      const id = crypto.randomUUID();
      await this.db
        .prepare('INSERT INTO cart_items (id, cart_id, variant_id, quantity, price_at_addition, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
        .bind(id, cartId, variantId, quantity, unitPrice)
        .run();
    }
  }

  async updateItemQuantity(itemId: string, quantity: number): Promise<void> {
    if (quantity <= 0) {
      await this.removeItem(itemId);
    } else {
      await this.db
        .prepare('UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(quantity, itemId)
        .run();
    }
  }

  async removeItem(itemId: string): Promise<void> {
    await this.db.prepare('DELETE FROM cart_items WHERE id = ?').bind(itemId).run();
  }

  async clearCart(cartId: string): Promise<void> {
    await this.db.prepare('DELETE FROM cart_items WHERE cart_id = ?').bind(cartId).run();
  }
}
