export class AdminRepository {
  constructor(private db: D1Database) {}

  async getDashboardStats(): Promise<{
    totalRevenue: number;
    totalOrders: number;
    totalProducts: number;
    totalCustomers: number;
    lowStockCount: number;
    totalStores: number;
    pendingSellerRequests: number;
  }> {
    const revenueRes = await this.db
      .prepare("SELECT SUM(total_amount) as total FROM orders WHERE payment_status = 'PAID' OR shipping_status = 'DELIVERED'")
      .first<{ total: number | null }>();

    const ordersRes = await this.db
      .prepare('SELECT COUNT(*) as count FROM orders')
      .first<{ count: number }>();

    const productsRes = await this.db
      .prepare('SELECT COUNT(*) as count FROM products WHERE is_active = 1')
      .first<{ count: number }>();

    const customersRes = await this.db
      .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'CUSTOMER'")
      .first<{ count: number }>();

    const lowStockRes = await this.db
      .prepare('SELECT COUNT(*) as count FROM product_variants WHERE is_active = 1 AND stock_quantity <= 5')
      .first<{ count: number }>();

    const storesRes = await this.db
      .prepare("SELECT COUNT(*) as count FROM stores WHERE status = 'ACTIVE'")
      .first<{ count: number }>();

    const pendingReqRes = await this.db
      .prepare("SELECT COUNT(*) as count FROM seller_requests WHERE status = 'PENDING'")
      .first<{ count: number }>();

    return {
      totalRevenue: revenueRes?.total || 0,
      totalOrders: ordersRes?.count || 0,
      totalProducts: productsRes?.count || 0,
      totalCustomers: customersRes?.count || 0,
      lowStockCount: lowStockRes?.count || 0,
      totalStores: storesRes?.count || 0,
      pendingSellerRequests: pendingReqRes?.count || 0,
    };
  }
}
