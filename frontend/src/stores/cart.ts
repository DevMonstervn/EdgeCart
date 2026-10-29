import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { CartItem } from '@edgecart/shared';
import { cartService } from '../services/cart.service.js';
import { useAuthStore } from './auth.js';
import { useToastStore } from './toast.js';
import { extractErrorMessage, AUTH_CLEARED_EVENT } from '../services/api.js';
import { safeStorage } from '../utils/storage.js';

function getInitialCartItems(): CartItem[] {
  try {
    const raw = safeStorage.getItem('ec_cart_items');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>(getInitialCartItems());
  const isLoading = ref<boolean>(false);
  const isSyncing = ref<boolean>(false);

  if (typeof window !== 'undefined') {
    window.addEventListener(AUTH_CLEARED_EVENT, () => {
      items.value = [];
    });
  }

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
    safeStorage.setItem('ec_cart_items', JSON.stringify(items.value));
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

    const snapshot = items.value.map((i) => ({ ...i }));

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

    // Sync to backend if authenticated and replace temp IDs with authoritative D1 IDs
    if (auth.isAuthenticated) {
      try {
        const remoteCart = await cartService.addItem({
          variantId: payload.variantId,
          quantity: payload.quantity,
        });
        if (remoteCart && remoteCart.items) {
          items.value = remoteCart.items;
          saveToLocal();
        }
        toast.success(`Đã thêm "${payload.productName}" vào giỏ hàng`);
        return true;
      } catch (err) {
        items.value = snapshot;
        saveToLocal();
        toast.error(extractErrorMessage(err));
        return false;
      }
    }

    toast.success(`Đã thêm "${payload.productName}" vào giỏ hàng`);
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

    const previousQty = item.quantity;
    const previousTotal = item.totalPrice;
    const currentItemId = item.id;

    item.quantity = quantity;
    item.totalPrice = quantity * item.unitPrice;
    saveToLocal();

    if (auth.isAuthenticated) {
      try {
        let targetItemId = currentItemId;
        if (targetItemId.startsWith('temp_')) {
          const latestCart = await cartService.getCart();
          const matched = latestCart.items.find((i) => i.variantId === variantId);
          if (!matched) {
            throw new Error('Sản phẩm không tồn tại trong giỏ hàng');
          }
          targetItemId = matched.id;
        }
        const remoteCart = await cartService.updateItemQuantity(targetItemId, quantity);
        if (remoteCart && remoteCart.items) {
          items.value = remoteCart.items;
          saveToLocal();
        }
      } catch (err) {
        const current = items.value.find((i) => i.variantId === variantId);
        if (current) {
          current.quantity = previousQty;
          current.totalPrice = previousTotal;
          saveToLocal();
        }
        toast.error(extractErrorMessage(err));
      }
    }
  }

  async function removeItem(variantId: string) {
    const auth = useAuthStore();
    const toast = useToastStore();
    const item = items.value.find((i) => i.variantId === variantId);
    if (!item) return;

    const snapshot = items.value.map((i) => ({ ...i }));
    const currentItemId = item.id;

    items.value = items.value.filter((i) => i.variantId !== variantId);
    saveToLocal();
    toast.info('Đã xóa sản phẩm khỏi giỏ hàng');

    if (auth.isAuthenticated) {
      try {
        let targetItemId: string | undefined = currentItemId;
        if (targetItemId.startsWith('temp_')) {
          const latestCart = await cartService.getCart();
          targetItemId = latestCart.items.find((i) => i.variantId === variantId)?.id;
        }
        if (targetItemId) {
          const remoteCart = await cartService.removeItem(targetItemId);
          if (remoteCart && remoteCart.items) {
            items.value = remoteCart.items;
            saveToLocal();
          }
        }
      } catch (err) {
        items.value = snapshot;
        saveToLocal();
        toast.error(extractErrorMessage(err));
      }
    }
  }

  async function mergeGuestCart() {
    const auth = useAuthStore();
    if (!auth.isAuthenticated) return;

    const guestItems = items.value
      .filter((i) => i.cartId === 'local_cart' || i.id.startsWith('temp_'))
      .map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
      }));

    if (guestItems.length === 0) {
      await fetchBackendCart();
      return;
    }

    try {
      isSyncing.value = true;
      const remoteCart = await cartService.mergeCart(guestItems);
      if (remoteCart && remoteCart.items) {
        items.value = remoteCart.items;
        saveToLocal();
      }
    } catch (err) {
      console.warn('Failed to merge cart on login:', err);
      await fetchBackendCart();
    } finally {
      isSyncing.value = false;
    }
  }

  function clearCart() {
    items.value = [];
    safeStorage.removeItem('ec_cart_items');
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
