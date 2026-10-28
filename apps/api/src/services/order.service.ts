import { OrderRepository } from '../repositories/order.repo.js';
import type { Env } from '../types/env.js';
import type { Order } from '@edgecart/shared';

export class OrderService {
  private orderRepo: OrderRepository;

  constructor(private env: Env) {
    this.orderRepo = new OrderRepository(env.DB);
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    const dbOrders = await this.orderRepo.findUserOrders(userId);
    const orders: Order[] = [];

    for (const o of dbOrders) {
      const items = await this.orderRepo.getOrderItems(o.id);
      orders.push({
        id: o.id,
        orderNumber: o.order_number,
        userId: o.user_id,
        customerEmail: o.customer_email,
        customerPhone: o.customer_phone,
        shippingName: o.shipping_name,
        shippingAddress: o.shipping_address,
        shippingProvince: o.shipping_province,
        shippingDistrict: o.shipping_district,
        shippingWard: o.shipping_ward,
        paymentMethod: o.payment_method as any,
        paymentStatus: o.payment_status as any,
        shippingStatus: o.shipping_status as any,
        subtotal: o.subtotal,
        discountAmount: o.discount_amount,
        shippingFee: o.shipping_fee,
        totalAmount: o.total_amount,
        notes: o.notes,
        items: items.map((i) => ({
          id: i.id,
          orderId: i.order_id,
          productId: i.product_id,
          variantId: i.variant_id,
          storeId: i.store_id,
          productName: i.product_name,
          variantTitle: i.variant_title,
          sku: i.sku,
          unitPrice: i.unit_price,
          quantity: i.quantity,
          totalPrice: i.total_price,
          fulfillmentStatus: i.fulfillment_status as any,
        })),
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      });
    }

    return orders;
  }

  async getOrderById(orderId: string, userId?: string): Promise<Order> {
    const o = await this.orderRepo.findOrderById(orderId);
    if (!o) {
      throw new Error('Không tìm thấy đơn hàng');
    }

    if (userId && o.user_id && o.user_id !== userId) {
      throw new Error('Bạn không có quyền truy cập đơn hàng này');
    }

    const items = await this.orderRepo.getOrderItems(o.id);
    return {
      id: o.id,
      orderNumber: o.order_number,
      userId: o.user_id,
      customerEmail: o.customer_email,
      customerPhone: o.customer_phone,
      shippingName: o.shipping_name,
      shippingAddress: o.shipping_address,
      shippingProvince: o.shipping_province,
      shippingDistrict: o.shipping_district,
      shippingWard: o.shipping_ward,
      paymentMethod: o.payment_method as any,
      paymentStatus: o.payment_status as any,
      shippingStatus: o.shipping_status as any,
      subtotal: o.subtotal,
      discountAmount: o.discount_amount,
      shippingFee: o.shipping_fee,
      totalAmount: o.total_amount,
      notes: o.notes,
      items: items.map((i) => ({
        id: i.id,
        orderId: i.order_id,
        productId: i.product_id,
        variantId: i.variant_id,
        storeId: i.store_id,
        productName: i.product_name,
        variantTitle: i.variant_title,
        sku: i.sku,
        unitPrice: i.unit_price,
        quantity: i.quantity,
        totalPrice: i.total_price,
        fulfillmentStatus: i.fulfillment_status as any,
      })),
      createdAt: o.created_at,
      updatedAt: o.updated_at,
    };
  }

  async cancelOrder(orderId: string, userId: string, reason?: string): Promise<void> {
    const o = await this.orderRepo.findOrderById(orderId);
    if (!o) throw new Error('Không tìm thấy đơn hàng');
    if (o.user_id !== userId) throw new Error('Bạn không có quyền thao tác đơn hàng này');

    await this.orderRepo.cancelOrderAndRestock(orderId, reason, userId);

    if (this.env.KV) {
      const { results } = await this.env.DB.prepare(
        `SELECT DISTINCT p.slug FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
      )
        .bind(orderId)
        .all<{ slug: string }>();
      if (results && results.length > 0) {
        await Promise.all(results.map((r) => this.env.KV.delete(`cache:product:${r.slug}`)));
      }
    }
  }
}
