import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCartStore } from '../src/stores/cart.js';

describe('useCartStore Pinia Unit Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('should initialize with empty cart', () => {
    const cart = useCartStore();
    expect(cart.items).toEqual([]);
    expect(cart.totalItems).toBe(0);
    expect(cart.subtotal).toBe(0);
  });

  it('should add item and calculate subtotal accurately', () => {
    const cart = useCartStore();
    cart.addItem({
      variantId: 'var_01',
      productName: 'Áo Thun Basic',
      variantTitle: 'Đen / M',
      sku: 'AT-DEN-M',
      unitPrice: 200000,
      quantity: 2,
      currentStock: 10,
    });

    expect(cart.items.length).toBe(1);
    expect(cart.totalItems).toBe(2);
    expect(cart.subtotal).toBe(400000);
  });

  it('should calculate free shipping progress correctly', () => {
    const cart = useCartStore();
    // Threshold is 500,000 VND
    expect(cart.freeShippingProgress).toBe(0);
    expect(cart.amountToFreeShipping).toBe(500000);

    cart.addItem({
      variantId: 'var_02',
      productName: 'Giày Thể Thao',
      variantTitle: 'Trắng / 42',
      sku: 'GTT-42',
      unitPrice: 250000,
      quantity: 1,
      currentStock: 5,
    });

    expect(cart.freeShippingProgress).toBe(50);
    expect(cart.amountToFreeShipping).toBe(250000);
  });

  it('should remove item when quantity is reduced to 0', () => {
    const cart = useCartStore();
    cart.addItem({
      variantId: 'var_03',
      productName: 'Mũ Lưỡi Trai',
      variantTitle: 'Xanh',
      sku: 'MLT-01',
      unitPrice: 100000,
      quantity: 1,
      currentStock: 5,
    });

    expect(cart.items.length).toBe(1);
    cart.updateQuantity('var_03', 0);
    expect(cart.items.length).toBe(0);
    expect(cart.subtotal).toBe(0);
  });
});
