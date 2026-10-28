import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { CartItem } from '@edgecart/shared';

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>(JSON.parse(localStorage.getItem('ec_cart_items') || '[]'));

  const totalItems = computed(() => {
    return items.value.reduce((sum, item) => sum + item.quantity, 0);
  });

  const subtotal = computed(() => {
    return items.value.reduce((sum, item) => sum + item.totalPrice, 0);
  });

  function saveToLocal() {
    localStorage.setItem('ec_cart_items', JSON.stringify(items.value));
  }

  function addItem(item: Omit<CartItem, 'id' | 'cartId' | 'totalPrice'>) {
    const existing = items.value.find((i) => i.variantId === item.variantId);
    if (existing) {
      existing.quantity += item.quantity;
      existing.totalPrice = existing.quantity * existing.unitPrice;
    } else {
      items.value.push({
        id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        cartId: 'local_cart',
        ...item,
        totalPrice: item.quantity * item.unitPrice,
      });
    }
    saveToLocal();
  }

  function updateQuantity(variantId: string, quantity: number) {
    const existing = items.value.find((i) => i.variantId === variantId);
    if (existing) {
      if (quantity <= 0) {
        removeItem(variantId);
      } else {
        existing.quantity = quantity;
        existing.totalPrice = existing.quantity * existing.unitPrice;
        saveToLocal();
      }
    }
  }

  function removeItem(variantId: string) {
    items.value = items.value.filter((i) => i.variantId !== variantId);
    saveToLocal();
  }

  function clearCart() {
    items.value = [];
    localStorage.removeItem('ec_cart_items');
  }

  return {
    items,
    totalItems,
    subtotal,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  };
});
