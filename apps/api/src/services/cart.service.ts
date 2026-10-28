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
      storeId: i.store_id,
      storeName: i.store_name,
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
    const variant = await this.productRepo.findVariantWithOwnership(variantId);
    if (
      !variant ||
      variant.is_active !== 1 ||
      variant.product_is_active !== 1 ||
      (variant.product_store_id !== null && variant.store_status !== 'ACTIVE')
    ) {
      throw new Error('Sản phẩm không tồn tại hoặc đã ngừng kinh doanh');
    }

    const dbCart = await this.cartRepo.getOrCreateCart(userId, sessionId);
    const existingItems = await this.cartRepo.getCartItems(dbCart.id);
    const existingItem = existingItems.find((i) => i.variant_id === variantId);
    const cumulativeQty = (existingItem ? existingItem.quantity : 0) + quantity;

    if (cumulativeQty > variant.stock_quantity) {
      throw new Error(`Kho chỉ còn ${variant.stock_quantity} sản phẩm`);
    }

    await this.cartRepo.addItem(dbCart.id, variantId, quantity, variant.price);

    return await this.getCart(userId, sessionId);
  }

  async updateQuantity(userId: string | null, sessionId: string | null, itemId: string, quantity: number): Promise<Cart> {
    const dbCart = await this.cartRepo.getOrCreateCart(userId, sessionId);
    const existingItems = await this.cartRepo.getCartItems(dbCart.id);
    const targetItem = existingItems.find((i) => i.id === itemId);

    if (!targetItem) {
      throw new Error('Sản phẩm không tồn tại trong giỏ hàng');
    }

    if (quantity > 0) {
      if (
        targetItem.product_is_active !== 1 ||
        (targetItem.store_id !== null && targetItem.store_status !== 'ACTIVE')
      ) {
        throw new Error('Sản phẩm không tồn tại hoặc đã ngừng kinh doanh');
      }
      if (quantity > targetItem.current_stock) {
        throw new Error(`Kho chỉ còn ${targetItem.current_stock} sản phẩm`);
      }
    }

    await this.cartRepo.updateItemQuantity(itemId, quantity, dbCart.id);
    return await this.getCart(userId, sessionId);
  }

  async removeItem(userId: string | null, sessionId: string | null, itemId: string): Promise<Cart> {
    const dbCart = await this.cartRepo.getOrCreateCart(userId, sessionId);
    await this.cartRepo.removeItem(itemId, dbCart.id);
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
