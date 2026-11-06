import { OrderRepository } from '../repositories/order.repo.js';
import { CartRepository } from '../repositories/cart.repo.js';
import type { Env } from '../types/env.js';
import type { CheckoutInput } from '@edgecart/shared';

export interface CheckoutOutput {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  paymentMethod: string;
  paymentUrl?: string;
  orderAccessToken?: string;
}

export class CheckoutService {
  private orderRepo: OrderRepository;
  private cartRepo: CartRepository;

  constructor(private env: Env) {
    this.orderRepo = new OrderRepository(env.DB);
    this.cartRepo = new CartRepository(env.DB);
  }

  async processCheckout(
    userId: string | null,
    userEmail: string,
    input: CheckoutInput,
    idempotencyKey?: string | null,
    sessionId?: string | null
  ): Promise<CheckoutOutput> {
    // 1. Check Idempotency Key via Cloudflare KV
    if (this.env.KV && idempotencyKey) {
      const existing = await this.env.KV.get(`idempotency:${idempotencyKey}`, 'text');
      if (existing) {
        // Return existing cached result without deducting stock twice!
        return JSON.parse(existing);
      }
    }

    // 2. Fetch User's or Guest's Cart
    const cart = await this.cartRepo.getOrCreateCart(userId, userId ? null : sessionId || null);
    const cartItems = await this.cartRepo.getCartItems(cart.id);

    if (cartItems.length === 0) {
      throw new Error('Giỏ hàng của bạn đang trống');
    }

    // Validate product & store active status before deducting inventory
    for (const ci of cartItems) {
      if (ci.product_is_active !== 1) {
        throw new Error(`Sản phẩm "${ci.product_name}" hiện đã ngừng kinh doanh`);
      }
      if (ci.store_id !== null && ci.store_status !== 'ACTIVE') {
        throw new Error(`Cửa hàng cung cấp sản phẩm "${ci.product_name}" hiện đang tạm ngưng hoạt động`);
      }
    }

    // 3. Compute Totals
    const subtotal = cartItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const shippingFee = subtotal >= 500000 ? 0 : 30000;
    const totalAmount = subtotal + shippingFee;

    const orderId = crypto.randomUUID();
    const orderNumber = `EC-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const orderAccessToken = crypto.randomUUID();

    // 4. ATOMIC ORDER CREATION & STOCK DEDUCTION
    await this.orderRepo.createAtomicOrder({
      orderId,
      orderNumber,
      userId,
      customerEmail: userEmail,
      customerPhone: input.shippingAddress.phone,
      shippingName: input.shippingAddress.recipientName,
      shippingAddress: input.shippingAddress.streetAddress,
      shippingProvince: input.shippingAddress.province,
      shippingDistrict: input.shippingAddress.district,
      shippingWard: input.shippingAddress.ward,
      paymentMethod: input.paymentMethod,
      subtotal,
      discountAmount: 0,
      shippingFee,
      totalAmount,
      notes: input.notes,
      items: cartItems.map((ci) => ({
        productId: ci.product_id,
        variantId: ci.variant_id,
        storeId: ci.store_id ?? null,
        productName: ci.product_name,
        variantTitle: ci.variant_title,
        sku: ci.sku,
        unitPrice: ci.unit_price,
        quantity: ci.quantity,
        totalPrice: ci.unit_price * ci.quantity,
      })),
    });

    // 5. Clear Cart & Invalidate Product Detail KV Cache (stock changed)
    await this.cartRepo.clearCart(cart.id);
    if (this.env.KV) {
      const uniqueSlugs = Array.from(new Set(cartItems.map((ci) => ci.product_slug).filter(Boolean)));
      await Promise.all(uniqueSlugs.map((slug) => this.env.KV.delete(`cache:product:${slug}`)));
    }

    // 6. Online Payment URL generation if selected
    let paymentUrl: string | undefined;
    if (input.paymentMethod === 'VNPAY') {
      paymentUrl = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?orderId=${orderId}&amount=${totalAmount}`;
    }

    // 7. Store Guest Order Access Token in KV (30 days TTL) if guest checkout
    if (!userId && this.env.KV) {
      await this.env.KV.put(`order_token:${orderAccessToken}`, orderId, { expirationTtl: 86400 * 30 });
      await this.env.KV.put(`order_token_rev:${orderId}`, orderAccessToken, { expirationTtl: 86400 * 30 });
    }

    const output: CheckoutOutput = {
      orderId,
      orderNumber,
      totalAmount,
      paymentMethod: input.paymentMethod,
      paymentUrl,
      orderAccessToken: !userId ? orderAccessToken : undefined,
    };

    // 8. Store Idempotency Result in KV (24 hours TTL)
    if (this.env.KV && idempotencyKey) {
      await this.env.KV.put(`idempotency:${idempotencyKey}`, JSON.stringify(output), {
        expirationTtl: 86400,
      });
    }

    return output;
  }
}
