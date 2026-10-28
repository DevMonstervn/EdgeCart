import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { CartItem } from '@edgecart/shared';
import { cartService } from '../services/cart.service.js';
import { useAuthStore } from './auth.js';
import { useToastStore } from './toast.js';
import { extractErrorMessage } from '../services/api.js';

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>(JSON.parse(localStorage.getItem('ec_cart_items') || '[]'));
  const isLoading = ref<boolean>(false);
  const isSyncing = ref<boolean>(false);

  const totalItems = computed(() => {
    return items.value.reduce((sum, item) => sum + item.quantity, 0);
  });

  const subtotal = computed(() => {
    return items.value.reduce((sum, item) => sum + item.totalPrice, 0);
  });

  // Free shipping threshold at 500,000 VND
  const freeShippingThreshold = 500000;
  const freeShippingProgress = computed(() => {
    return Math.min(100, Math.round((subtotal.value / freeShippingThreshold) * 100));
  });
  const amountToFreeShipping = computed(() => {
    return Math.max(0, freeShippingThreshold - subtotal.value);
  });

  function saveToLocal() {
    localStorage.setItem('ec_cart_items', JSON.stringify(items.value));
  }

  async function fetchBackendCart() {
    const auth = useAuthStore();
    if (!auth.isAuthenticated) return;

    try {
      isSyncing.value = true;
      const remoteCart = await cartService.getCart();
      if (remoteCart && remoteCart.items) {
        items.value = remoteCart.items;
        saveToLocal();
      }
    } catch {
      // Keep local cart if backend fails
    } finally {
      isSyncing.value = false;
    }
  }

  async function addItem(payload: {
    variantId: string;
    productName: string;
    variantTitle: string;
    sku: string;
    unitPrice: number;
    quantity: number;
    currentStock: number;
    imageUrl?: string | null;
  }) {
    const toast = useToastStore();
    const auth = useAuthStore();

    // Check stock limit
    const existing = items.value.find((i) => i.variantId === payload.variantId);
    const newQty = (existing ? existing.quantity : 0) + payload.quantity;
    if (newQty > payload.currentStock) {
      toast.error(`Chỉ còn ${payload.currentStock} sản phẩm trong kho!`);
      return false;
    }

    // Optimistic Local Update
    if (existing) {
      existing.quantity = newQty;
      existing.totalPrice = existing.quantity * existing.unitPrice;
    } else {
      items.value.push({
        id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        cartId: 'local_cart',
        ...payload,
        totalPrice: payload.quantity * payload.unitPrice,
      });
    }
    saveToLocal();
    toast.success(`Đã thêm "${payload.productName}" vào giỏ hàng`);

    // Sync to backend if authenticated
    if (auth.isAuthenticated) {
      try {
        await cartService.addItem({
          variantId: payload.variantId,
          quantity: payload.quantity,
        });
      } catch (err) {
        console.warn('Failed to sync item to backend:', extractErrorMessage(err));
      }
    }

    return true;
  }

  async function updateQuantity(variantId: string, quantity: number) {
    const auth = useAuthStore();
    const toast = useToastStore();
    const item = items.value.find((i) => i.variantId === variantId);
    if (!item) return;

    if (quantity <= 0) {
      await removeItem(variantId);
      return;
    }

    if (quantity > item.currentStock) {
      toast.error(`Kho chỉ còn ${item.currentStock} sản phẩm`);
      return;
    }

    item.quantity = quantity;
    item.totalPrice = quantity * item.unitPrice;
    saveToLocal();

    if (auth.isAuthenticated) {
      try {
        await cartService.updateItemQuantity(item.id, quantity);
      } catch (err) {
        toast.error(extractErrorMessage(err));
      }
    }
  }

  async function removeItem(variantId: string) {
    const auth = useAuthStore();
    const toast = useToastStore();
    const item = items.value.find((i) => i.variantId === variantId);
    if (!item) return;

    items.value = items.value.filter((i) => i.variantId !== variantId);
    saveToLocal();
    toast.info('Đã xóa sản phẩm khỏi giỏ hàng');

    if (auth.isAuthenticated && !item.id.startsWith('temp_')) {
      try {
        await cartService.removeItem(item.id);
      } catch {
        // Handled silently
      }
    }
  }

  async function mergeGuestCart() {
    const auth = useAuthStore();
    if (!auth.isAuthenticated || items.value.length === 0) return;

    try {
      isSyncing.value = true;
      const guestItems = items.value.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
      }));
      const remoteCart = await cartService.mergeCart(guestItems);
      if (remoteCart && remoteCart.items) {
        items.value = remoteCart.items;
        saveToLocal();
      }
    } catch (err) {
      console.warn('Failed to merge cart on login:', err);
    } finally {
      isSyncing.value = false;
    }
  }

  function clearCart() {
    items.value = [];
    localStorage.removeItem('ec_cart_items');
  }

  return {
    items,
    isLoading,
    isSyncing,
    totalItems,
    subtotal,
    freeShippingThreshold,
    freeShippingProgress,
    amountToFreeShipping,
    fetchBackendCart,
    addItem,
    updateQuantity,
    removeItem,
    mergeGuestCart,
    clearCart,
  };
});
