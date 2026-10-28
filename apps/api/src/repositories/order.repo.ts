export interface DbOrder {
  id: string;
  order_number: string;
  user_id: string | null;
  customer_email: string;
  customer_phone: string;
  shipping_name: string;
  shipping_address: string;
  shipping_province: string;
  shipping_district: string;
  shipping_ward: string;
  payment_method: string;
  payment_status: string;
  shipping_status: string;
  subtotal: number;
  discount_amount: number;
  shipping_fee: number;
  total_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_title: string;
  sku: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  created_at: string;
}

export class OrderRepository {
  constructor(private db: D1Database) {}

  async createAtomicOrder(params: {
    orderId: string;
    orderNumber: string;
    userId: string | null;
    customerEmail: string;
    customerPhone: string;
    shippingName: string;
    shippingAddress: string;
    shippingProvince: string;
    shippingDistrict: string;
    shippingWard: string;
    paymentMethod: string;
    subtotal: number;
    discountAmount: number;
    shippingFee: number;
    totalAmount: number;
    notes?: string | null;
    items: Array<{
      productId: string;
      variantId: string;
      productName: string;
      variantTitle: string;
      sku: string;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
    }>;
  }): Promise<DbOrder> {
    const statements: D1PreparedStatement[] = [];

    // 1. INSERT ORDER RECORD FIRST (So order_id exists for foreign keys)
    statements.push(
      this.db
        .prepare(`
          INSERT INTO orders (
            id, order_number, user_id, customer_email, customer_phone,
            shipping_name, shipping_address, shipping_province, shipping_district, shipping_ward,
            payment_method, payment_status, shipping_status,
            subtotal, discount_amount, shipping_fee, total_amount, notes,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNPAID', 'PENDING', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        `)
        .bind(
          params.orderId,
          params.orderNumber,
          params.userId,
          params.customerEmail,
          params.customerPhone,
          params.shippingName,
          params.shippingAddress,
          params.shippingProvince,
          params.shippingDistrict,
          params.shippingWard,
          params.paymentMethod,
          params.subtotal,
          params.discountAmount,
          params.shippingFee,
          params.totalAmount,
          params.notes || null
        )
    );

    // 2. ATOMIC CONDITIONAL UPDATE FOR STOCK DEDUCTION & INVENTORY LEDGER
    for (const item of params.items) {
      statements.push(
        this.db
          .prepare(`
            UPDATE product_variants
            SET stock_quantity = stock_quantity - ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND stock_quantity >= ?;
          `)
          .bind(item.quantity, item.variantId, item.quantity)
      );

      // Record immutable inventory ledger
      statements.push(
        this.db
          .prepare(`
            INSERT INTO inventory_logs (id, variant_id, order_id, change_quantity, type, notes, created_at)
            VALUES (?, ?, ?, ?, 'ORDER_DEDUCT', 'Khách đặt hàng', CURRENT_TIMESTAMP);
          `)
          .bind(crypto.randomUUID(), item.variantId, params.orderId, -item.quantity)
      );
    }

    // 3. INSERT ORDER ITEMS
    for (const item of params.items) {
      statements.push(
        this.db
          .prepare(`
            INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, variant_title, sku, unit_price, quantity, total_price, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
          `)
          .bind(
            crypto.randomUUID(),
            params.orderId,
            item.productId,
            item.variantId,
            item.productName,
            item.variantTitle,
            item.sku,
            item.unitPrice,
            item.quantity,
            item.totalPrice
          )
      );
    }

    // 4. INSERT INITIAL ORDER STATUS HISTORY
    statements.push(
      this.db
        .prepare(`
          INSERT INTO order_status_history (id, order_id, from_status, to_status, note, created_at)
          VALUES (?, ?, NULL, 'PENDING', 'Khách hàng đặt đơn mới', CURRENT_TIMESTAMP);
        `)
        .bind(crypto.randomUUID(), params.orderId)
    );

    // EXECUTE ATOMIC TRANSACTION BATCH IN D1
    const results = await this.db.batch(statements);

    // Verify stock deduction changes
    // Statement 0 is INSERT order; statement 1 + i*2 is the UPDATE statement!
    for (let i = 0; i < params.items.length; i++) {
      const updateResult = results[1 + i * 2];
      if (!updateResult.meta || updateResult.meta.changes === 0) {
        throw new Error(`Sản phẩm "${params.items[i].productName}" không đủ tồn kho để đáp ứng đơn hàng!`);
      }
    }

    const created = await this.findOrderById(params.orderId);
    if (!created) throw new Error('Không thể tạo đơn hàng');
    return created;
  }

  async findUserOrders(userId: string): Promise<DbOrder[]> {
    const query = 'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC';
    const { results } = await this.db.prepare(query).bind(userId).all<DbOrder>();
    return results || [];
  }

  async findOrderById(orderId: string): Promise<DbOrder | null> {
    const query = 'SELECT * FROM orders WHERE id = ? LIMIT 1';
    return await this.db.prepare(query).bind(orderId).first<DbOrder>();
  }

  async getOrderItems(orderId: string): Promise<DbOrderItem[]> {
    const query = 'SELECT * FROM order_items WHERE order_id = ?';
    const { results } = await this.db.prepare(query).bind(orderId).all<DbOrderItem>();
    return results || [];
  }

  async updateOrderStatus(orderId: string, status: string, note?: string, createdBy?: string): Promise<void> {
    const current = await this.findOrderById(orderId);
    if (!current) throw new Error('Không tìm thấy đơn hàng');

    const statements: D1PreparedStatement[] = [
      this.db
        .prepare('UPDATE orders SET shipping_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(status, orderId),
      this.db
        .prepare('INSERT INTO order_status_history (id, order_id, from_status, to_status, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
        .bind(crypto.randomUUID(), orderId, current.shipping_status, status, note || null, createdBy || null),
    ];

    await this.db.batch(statements);
  }

  async cancelOrderAndRestock(orderId: string, reason?: string, createdBy?: string): Promise<void> {
    const order = await this.findOrderById(orderId);
    if (!order) throw new Error('Không tìm thấy đơn hàng');
    if (order.shipping_status !== 'PENDING' && order.shipping_status !== 'CONFIRMED') {
      throw new Error('Chỉ có thể hủy đơn hàng ở trạng thái Chờ xử lý hoặc Đã xác nhận');
    }

    const items = await this.getOrderItems(orderId);
    const statements: D1PreparedStatement[] = [];

    // 1. Restock variants & log
    for (const item of items) {
      statements.push(
        this.db
          .prepare('UPDATE product_variants SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(item.quantity, item.variant_id)
      );
      statements.push(
        this.db
          .prepare(`
            INSERT INTO inventory_logs (id, variant_id, order_id, change_quantity, type, notes, created_at)
            VALUES (?, ?, ?, ?, 'ORDER_CANCEL_RESTOCK', ?, CURRENT_TIMESTAMP);
          `)
          .bind(crypto.randomUUID(), item.variant_id, orderId, item.quantity, reason || 'Hoàn tồn do hủy đơn')
      );
    }

    // 2. Update order status
    statements.push(
      this.db
        .prepare("UPDATE orders SET shipping_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(orderId)
    );

    // 3. Status history
    statements.push(
      this.db
        .prepare("INSERT INTO order_status_history (id, order_id, from_status, to_status, note, created_by, created_at) VALUES (?, ?, ?, 'CANCELLED', ?, ?, CURRENT_TIMESTAMP)")
        .bind(crypto.randomUUID(), orderId, order.shipping_status, reason || 'Hủy đơn hàng', createdBy || null)
    );

    await this.db.batch(statements);
  }

  async findAllOrders(params?: { status?: string; limit?: number; offset?: number }): Promise<{ orders: DbOrder[]; total: number }> {
    let whereClause = '';
    const bindings: any[] = [];
    if (params?.status) {
      whereClause = 'WHERE shipping_status = ?';
      bindings.push(params.status);
    }

    const countRes = await this.db.prepare(`SELECT COUNT(*) as count FROM orders ${whereClause}`).bind(...bindings).first<{ count: number }>();
    const total = countRes?.count || 0;

    const limit = params?.limit || 20;
    const offset = params?.offset || 0;
    const { results } = await this.db
      .prepare(`SELECT * FROM orders ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, offset)
      .all<DbOrder>();

    return { orders: results || [], total };
  }
}
