export interface DbInventoryItem {
  id: string;
  sku: string;
  title: string;
  product_id: string;
  product_name: string;
  store_id: string | null;
  stock_quantity: number;
  price: number;
}

export class InventoryRepository {
  constructor(private db: D1Database) {}

  async getInventoryList(params?: {
    q?: string;
    lowStockOnly?: boolean;
    storeId?: string | null;
  }): Promise<DbInventoryItem[]> {
    const conditions: string[] = ['pv.is_active = 1'];
    const bindings: any[] = [];

    if (params?.storeId === null) {
      conditions.push('p.store_id IS NULL');
    } else if (typeof params?.storeId === 'string') {
      conditions.push('p.store_id = ?');
      bindings.push(params.storeId);
    }

    if (params?.q) {
      conditions.push('(pv.sku LIKE ? OR p.name LIKE ?)');
      bindings.push(`%${params.q}%`, `%${params.q}%`);
    }

    if (params?.lowStockOnly) {
      conditions.push('pv.stock_quantity <= 5');
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        pv.id,
        pv.sku,
        pv.title,
        p.id as product_id,
        p.name as product_name,
        p.store_id,
        pv.stock_quantity,
        pv.price
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      ${where}
      ORDER BY pv.stock_quantity ASC, pv.sku ASC
    `;

    const { results } = await this.db.prepare(query).bind(...bindings).all<DbInventoryItem>();
    return results || [];
  }

  async adjustStock(params: {
    variantId: string;
    changeQuantity: number;
    type: string;
    notes: string;
    createdBy?: string;
  }): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          'UPDATE product_variants SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (stock_quantity + ?) >= 0'
        )
        .bind(params.changeQuantity, params.variantId, params.changeQuantity),
      this.db
        .prepare(`
          INSERT INTO inventory_logs (id, variant_id, change_quantity, type, notes, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
        `)
        .bind(
          crypto.randomUUID(),
          params.variantId,
          params.changeQuantity,
          params.type,
          params.notes,
          params.createdBy || null
        ),
    ];

    const results = await this.db.batch(statements);
    if (!results[0]?.meta || results[0].meta.changes === 0) {
      throw new Error('Không thể điều chỉnh tồn kho (sản phẩm không tồn tại hoặc số lượng tồn sau điều chỉnh bị âm)');
    }
  }
}
