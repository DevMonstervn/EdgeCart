import { AdminRepository } from '../repositories/admin.repo.js';
import { ProductRepository } from '../repositories/product.repo.js';
import { OrderRepository } from '../repositories/order.repo.js';
import { InventoryRepository } from '../repositories/inventory.repo.js';
import { CatalogService } from './catalog.service.js';
import type { Env } from '../types/env.js';
import type { Product, Order, OrderStatus } from '@edgecart/shared';

export class AdminService {
  private adminRepo: AdminRepository;
  private productRepo: ProductRepository;
  private orderRepo: OrderRepository;
  private inventoryRepo: InventoryRepository;
  private catalogService: CatalogService;

  constructor(private env: Env) {
    this.adminRepo = new AdminRepository(env.DB);
    this.productRepo = new ProductRepository(env.DB);
    this.orderRepo = new OrderRepository(env.DB);
    this.inventoryRepo = new InventoryRepository(env.DB);
    this.catalogService = new CatalogService(env);
  }

  async getDashboardStats() {
    const stats = await this.adminRepo.getDashboardStats();
    const { orders } = await this.orderRepo.findAllOrders({ limit: 5 });

    return {
      ...stats,
      recentOrders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        shippingName: o.shipping_name,
        shippingStatus: o.shipping_status,
        totalAmount: o.total_amount,
        createdAt: o.created_at,
      })),
    };
  }

  async createProduct(data: {
    name: string;
    slug: string;
    categoryId: string;
    basePrice: number;
    salePrice?: number | null;
    description?: string;
    variants: Array<{
      sku: string;
      title: string;
      price: number;
      compareAtPrice?: number | null;
      stockQuantity: number;
    }>;
  }): Promise<Product> {
    const productId = crypto.randomUUID();
    const created = await this.productRepo.createProductWithVariants(
      {
        id: productId,
        name: data.name,
        slug: data.slug,
        categoryId: data.categoryId,
        basePrice: data.basePrice,
        salePrice: data.salePrice,
        description: data.description,
      },
      data.variants.map((v) => ({
        id: crypto.randomUUID(),
        sku: v.sku,
        title: v.title,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        stockQuantity: v.stockQuantity,
      }))
    );

    // Invalidate KV cache
    await this.catalogService.invalidateCatalogCache(data.slug);
    return await this.catalogService.getProductBySlug(data.slug);
  }

  async deleteProduct(id: string): Promise<void> {
    const p = await this.productRepo.findById(id);
    await this.productRepo.deleteProduct(id);
    if (p) {
      await this.catalogService.invalidateCatalogCache(p.slug);
    }
  }

  async getOrders(params?: { status?: string; page?: number; limit?: number }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const offset = (page - 1) * limit;

    const { orders, total } = await this.orderRepo.findAllOrders({
      status: params?.status,
      limit,
      offset,
    });

    return {
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        customerEmail: o.customer_email,
        customerPhone: o.customer_phone,
        shippingName: o.shipping_name,
        shippingAddress: o.shipping_address,
        paymentMethod: o.payment_method as any,
        paymentStatus: o.payment_status as any,
        shippingStatus: o.shipping_status as any,
        totalAmount: o.total_amount,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async updateOrderStatus(orderId: string, status: OrderStatus, note?: string, createdBy?: string) {
    await this.orderRepo.updateOrderStatus(orderId, status, note, createdBy);
  }

  async getInventory(params?: { q?: string; lowStockOnly?: boolean }) {
    const list = await this.inventoryRepo.getInventoryList(params);
    return list.map((i) => ({
      id: i.id,
      sku: i.sku,
      title: i.title,
      productName: i.product_name,
      stockQuantity: i.stock_quantity,
      price: i.price,
    }));
  }

  async adjustInventory(variantId: string, changeQuantity: number, type: string, notes: string, createdBy?: string) {
    await this.inventoryRepo.adjustStock({
      variantId,
      changeQuantity,
      type,
      notes,
      createdBy,
    });
  }
}
