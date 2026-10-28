import { CartRepository } from '../repositories/cart.repo.js';
import { ProductRepository } from '../repositories/product.repo.js';
import type { Env } from '../types/env.js';
import type { Cart, CartItem } from '@edgecart/shared';

export class CartService {
  private cartRepo: CartRepository;
  private productRepo: ProductRepository;

  constructor(env: Env) {
    this.cartRepo = new CartRepository(env.DB);
    this.productRepo = new ProductRepository(env.DB);
  }

  async getCart(userId: string | null, sessionId: string | null): Promise<Cart> {
    const dbCart = await this.cartRepo.getOrCreateCart(userId, sessionId);
    const dbItems = await this.cartRepo.getCartItems(dbCart.id);

    const items: CartItem[] = dbItems.map((i) => ({
      id: i.id,
      cartId: i.cart_id,
      variantId: i.variant_id,
      productName: i.product_name,
      variantTitle: i.variant_title,
      sku: i.sku,
      unitPrice: i.unit_price,
      quantity: i.quantity,
      totalPrice: i.quantity * i.unit_price,
      currentStock: i.current_stock,
      imageUrl: i.image_url,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    return {
      id: dbCart.id,
      userId: dbCart.user_id,
      sessionId: dbCart.session_id,
      items,
      subtotal,
      totalItems,
    };
  }

  async addItem(
    userId: string | null,
    sessionId: string | null,
    variantId: string,
    quantity: number
  ): Promise<Cart> {
    const variant = await this.productRepo.findVariantById(variantId);
    if (!variant || variant.is_active !== 1) {
      throw new Error('Sản phẩm không tồn tại hoặc đã ngừng kinh doanh');
    }

    if (quantity > variant.stock_quantity) {
      throw new Error(`Kho chỉ còn ${variant.stock_quantity} sản phẩm`);
    }

    const dbCart = await this.cartRepo.getOrCreateCart(userId, sessionId);
    await this.cartRepo.addItem(dbCart.id, variantId, quantity, variant.price);

    return await this.getCart(userId, sessionId);
  }

  async updateQuantity(userId: string | null, sessionId: string | null, itemId: string, quantity: number): Promise<Cart> {
    await this.cartRepo.updateItemQuantity(itemId, quantity);
    return await this.getCart(userId, sessionId);
  }

  async removeItem(userId: string | null, sessionId: string | null, itemId: string): Promise<Cart> {
    await this.cartRepo.removeItem(itemId);
    return await this.getCart(userId, sessionId);
  }

  async mergeCart(userId: string, guestItems: Array<{ variantId: string; quantity: number }>): Promise<Cart> {
    for (const g of guestItems) {
      try {
        await this.addItem(userId, null, g.variantId, g.quantity);
      } catch {
        // Skip unavailable items during merge
      }
    }
    return await this.getCart(userId, null);
  }
}
