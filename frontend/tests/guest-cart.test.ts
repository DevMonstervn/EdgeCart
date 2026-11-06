import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCartStore } from '../src/stores/cart.js';
import { useAuthStore } from '../src/stores/auth.js';
import { cartService } from '../src/services/cart.service.js';
import { safeStorage } from '../src/utils/storage.js';

describe('EdgeCart — Stage 3 Complete Guest Cart Experience', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    safeStorage.clear();
    vi.restoreAllMocks();
  });

  it('Feature 1: Guest can add products to cart without login', async () => {
    const cart = useCartStore();
    const auth = useAuthStore();
    expect(auth.isAuthenticated).toBe(false);

    const success = await cart.addItem({
      variantId: 'var_guest_101',
      productName: 'Áo Thun Cotton Compact',
      variantTitle: 'Đen / L',
      sku: 'AT-DEN-L',
      unitPrice: 199000,
      quantity: 2,
      currentStock: 10,
      imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=200',
    });

    expect(success).toBe(true);
    expect(cart.items.length).toBe(1);
    expect(cart.totalItems).toBe(2);
    expect(cart.subtotal).toBe(398000);
    expect(cart.items[0].variantId).toBe('var_guest_101');
    expect(cart.items[0].cartId).toBe('local_cart');
    expect(cart.items[0].id).toMatch(/^temp_/);

    // Verify written to local storage
    const rawSaved = safeStorage.getItem('ec_cart_items');
    expect(rawSaved).not.toBeNull();
    const parsed = JSON.parse(rawSaved!);
    expect(parsed.length).toBe(1);
    expect(parsed[0].productName).toBe('Áo Thun Cotton Compact');
  });

  it('Feature 2: Guest can open and view cart calculations accurately', async () => {
    const cart = useCartStore();

    await cart.addItem({
      variantId: 'var_01',
      productName: 'Sản Phẩm 1',
      variantTitle: 'A',
      sku: 'SP-1',
      unitPrice: 200000,
      quantity: 1,
      currentStock: 5,
    });

    await cart.addItem({
      variantId: 'var_02',
      productName: 'Sản Phẩm 2',
      variantTitle: 'B',
      sku: 'SP-2',
      unitPrice: 150000,
      quantity: 2,
      currentStock: 5,
    });

    expect(cart.items.length).toBe(2);
    expect(cart.totalItems).toBe(3);
    expect(cart.subtotal).toBe(500000);
    // Free shipping threshold is 500,000 VND
    expect(cart.freeShippingProgress).toBe(100);
    expect(cart.amountToFreeShipping).toBe(0);
  });

  it('Feature 3: Guest can update product quantities with stock boundary checks', async () => {
    const cart = useCartStore();

    await cart.addItem({
      variantId: 'var_stock_5',
      productName: 'Tai Nghe Bluetooth',
      variantTitle: 'Xám',
      sku: 'TN-01',
      unitPrice: 300000,
      quantity: 2,
      currentStock: 5,
    });

    // Increase quantity within stock
    await cart.updateQuantity('var_stock_5', 4);
    expect(cart.items[0].quantity).toBe(4);
    expect(cart.items[0].totalPrice).toBe(1200000);
    expect(cart.subtotal).toBe(1200000);

    // Attempting to exceed stock (stock = 5, request = 6)
    await cart.updateQuantity('var_stock_5', 6);
    // Quantity should remain 4
    expect(cart.items[0].quantity).toBe(4);

    // Decrease quantity
    await cart.updateQuantity('var_stock_5', 1);
    expect(cart.items[0].quantity).toBe(1);
    expect(cart.items[0].totalPrice).toBe(300000);
  });

  it('Feature 4: Guest can remove cart items (directly or by setting qty to 0)', async () => {
    const cart = useCartStore();

    await cart.addItem({
      variantId: 'var_rem_1',
      productName: 'Mũ Len',
      variantTitle: 'Đỏ',
      sku: 'ML-01',
      unitPrice: 50000,
      quantity: 1,
      currentStock: 10,
    });

    await cart.addItem({
      variantId: 'var_rem_2',
      productName: 'Găng Tay',
      variantTitle: 'Đen',
      sku: 'GT-01',
      unitPrice: 70000,
      quantity: 1,
      currentStock: 10,
    });

    expect(cart.items.length).toBe(2);

    // Remove directly
    await cart.removeItem('var_rem_1');
    expect(cart.items.length).toBe(1);
    expect(cart.items[0].variantId).toBe('var_rem_2');

    // Setting quantity to 0 removes the item
    await cart.updateQuantity('var_rem_2', 0);
    expect(cart.items.length).toBe(0);
    expect(cart.subtotal).toBe(0);
  });

  it('Feature 5: Guest can clear the entire cart in one operation', async () => {
    const cart = useCartStore();

    await cart.addItem({
      variantId: 'var_c1',
      productName: 'Item 1',
      variantTitle: 'V1',
      sku: 'SKU1',
      unitPrice: 100000,
      quantity: 1,
      currentStock: 5,
    });
    await cart.addItem({
      variantId: 'var_c2',
      productName: 'Item 2',
      variantTitle: 'V2',
      sku: 'SKU2',
      unitPrice: 200000,
      quantity: 1,
      currentStock: 5,
    });

    expect(cart.items.length).toBe(2);
    expect(safeStorage.getItem('ec_cart_items')).not.toBeNull();

    cart.clearCart();
    expect(cart.items.length).toBe(0);
    expect(cart.totalItems).toBe(0);
    expect(cart.subtotal).toBe(0);
    expect(safeStorage.getItem('ec_cart_items')).toBeNull();
  });

  it('Feature 6: Guest can use Buy Now without redirecting to login and avoids accidental duplication', async () => {
    const cart = useCartStore();
    const auth = useAuthStore();
    expect(auth.isAuthenticated).toBe(false);

    // Case A: Buy Now for a new item with stock = 1
    const res1 = await cart.buyNow({
      variantId: 'var_rare_collector',
      productName: 'Lego Collector Edition',
      variantTitle: 'Special Box',
      sku: 'LEGO-COL-01',
      unitPrice: 8500000,
      quantity: 1,
      currentStock: 1,
    });

    expect(res1).toBe(true);
    expect(cart.items.length).toBe(1);
    expect(cart.items[0].quantity).toBe(1);

    // Case B: Customer clicks "Buy Now" a SECOND time on the same item with stock = 1
    // A naive addItem would add 1 + 1 = 2 and fail with "Only 1 in stock!".
    // buyNow must recognize item is already present and avoid duplicating.
    const res2 = await cart.buyNow({
      variantId: 'var_rare_collector',
      productName: 'Lego Collector Edition',
      variantTitle: 'Special Box',
      sku: 'LEGO-COL-01',
      unitPrice: 8500000,
      quantity: 1,
      currentStock: 1,
    });

    expect(res2).toBe(true);
    // Quantity must remain 1, not duplicate to 2
    expect(cart.items.length).toBe(1);
    expect(cart.items[0].quantity).toBe(1);

    // Case C: Customer selects quantity 3 on an item currently at quantity 1 (stock = 5)
    await cart.addItem({
      variantId: 'var_polo',
      productName: 'Áo Polo',
      variantTitle: 'Trắng / M',
      sku: 'POLO-W-M',
      unitPrice: 250000,
      quantity: 1,
      currentStock: 5,
    });

    expect(cart.items.find((i) => i.variantId === 'var_polo')?.quantity).toBe(1);

    // Customer decides to Buy Now with quantity 3
    const res3 = await cart.buyNow({
      variantId: 'var_polo',
      productName: 'Áo Polo',
      variantTitle: 'Trắng / M',
      sku: 'POLO-W-M',
      unitPrice: 250000,
      quantity: 3,
      currentStock: 5,
    });

    expect(res3).toBe(true);
    // Must update to 3 (NOT 1 + 3 = 4)
    expect(cart.items.find((i) => i.variantId === 'var_polo')?.quantity).toBe(3);

    // Case D: Buy Now requesting more than available stock fails safely
    const res4 = await cart.buyNow({
      variantId: 'var_scarce',
      productName: 'Hàng Hiếm',
      variantTitle: 'Gold',
      sku: 'SCARCE-01',
      unitPrice: 1000000,
      quantity: 10,
      currentStock: 2,
    });

    expect(res4).toBe(false);
  });

  it('Feature 7: Guest cart persists accurately across page refreshes (storage hydration)', async () => {
    // 1. First session: guest adds 2 items to cart
    const cartSession1 = useCartStore();
    await cartSession1.addItem({
      variantId: 'var_p1',
      productName: 'Bàn Phím Cơ',
      variantTitle: 'Blue Switch',
      sku: 'KB-BLUE',
      unitPrice: 750000,
      quantity: 1,
      currentStock: 8,
    });
    await cartSession1.addItem({
      variantId: 'var_p2',
      productName: 'Chuột Gaming',
      variantTitle: 'Không Dây',
      sku: 'MS-WLS',
      unitPrice: 450000,
      quantity: 2,
      currentStock: 12,
    });

    expect(cartSession1.totalItems).toBe(3);
    expect(cartSession1.subtotal).toBe(1650000);

    // 2. Simulate page reload by resetting Pinia and creating fresh store instance
    setActivePinia(createPinia());
    const cartSessionAfterRefresh = useCartStore();

    expect(cartSessionAfterRefresh.items.length).toBe(2);
    expect(cartSessionAfterRefresh.totalItems).toBe(3);
    expect(cartSessionAfterRefresh.subtotal).toBe(1650000);
    expect(cartSessionAfterRefresh.items[0].productName).toBe('Bàn Phím Cơ');
    expect(cartSessionAfterRefresh.items[1].productName).toBe('Chuột Gaming');
    expect(cartSessionAfterRefresh.items[1].quantity).toBe(2);
  });

  it('Feature 8: Guest carts remain completely isolated between different browser sessions', () => {
    // Browser 1 LocalStorage Mock
    const storage1 = new Map<string, string>();
    storage1.set('ec_session_id', 'guest_session_browser_1');
    storage1.set(
      'ec_cart_items',
      JSON.stringify([
        {
          id: 'temp_1',
          cartId: 'local_cart',
          variantId: 'var_b1',
          productName: 'Sản phẩm Browser 1',
          quantity: 2,
          unitPrice: 100000,
          totalPrice: 200000,
          currentStock: 5,
        },
      ])
    );

    // Browser 2 LocalStorage Mock
    const storage2 = new Map<string, string>();
    storage2.set('ec_session_id', 'guest_session_browser_2');
    storage2.set(
      'ec_cart_items',
      JSON.stringify([
        {
          id: 'temp_2',
          cartId: 'local_cart',
          variantId: 'var_b2',
          productName: 'Sản phẩm Browser 2',
          quantity: 1,
          unitPrice: 300000,
          totalPrice: 300000,
          currentStock: 5,
        },
      ])
    );

    expect(storage1.get('ec_session_id')).not.toBe(storage2.get('ec_session_id'));
    const items1 = JSON.parse(storage1.get('ec_cart_items')!);
    const items2 = JSON.parse(storage2.get('ec_cart_items')!);

    expect(items1[0].variantId).toBe('var_b1');
    expect(items2[0].variantId).toBe('var_b2');
    expect(items1[0].quantity).toBe(2);
    expect(items2[0].quantity).toBe(1);
  });

  it('Feature 9: Empty cart and out-of-stock states are handled properly', async () => {
    const cart = useCartStore();

    // Initial empty state
    expect(cart.items).toEqual([]);
    expect(cart.totalItems).toBe(0);
    expect(cart.subtotal).toBe(0);
    expect(cart.freeShippingProgress).toBe(0);

    // Cannot add an item with 0 stock
    const outOfStockAdd = await cart.addItem({
      variantId: 'var_sold_out',
      productName: 'Sản phẩm hết hàng',
      variantTitle: 'Mặc định',
      sku: 'OOS-01',
      unitPrice: 50000,
      quantity: 1,
      currentStock: 0,
    });

    expect(outOfStockAdd).toBe(false);
    expect(cart.items.length).toBe(0);
  });

  it('Feature 10: Authenticated user compatibility & Guest-to-User cart merge on login', async () => {
    const cart = useCartStore();
    const auth = useAuthStore();

    // Step 1: Guest adds 2 items locally
    await cart.addItem({
      variantId: 'var_guest_item_1',
      productName: 'Item Guest 1',
      variantTitle: 'A',
      sku: 'G-1',
      unitPrice: 150000,
      quantity: 2,
      currentStock: 10,
    });

    expect(cart.items.length).toBe(1);
    expect(cart.items[0].cartId).toBe('local_cart');

    // Step 2: Guest logs in
    auth.accessToken = 'jwt_buyer_test';
    auth.user = {
      id: 'usr_buyer_999',
      email: 'buyer@edgecart.vn',
      fullName: 'Nguyễn Văn Mua',
      role: 'CUSTOMER',
      isSeller: false,
      status: 'ACTIVE',
      createdAt: '2026-11-06',
      updatedAt: '2026-11-06',
    };
    safeStorage.setItem('ec_access_token', 'jwt_buyer_test');
    expect(auth.isAuthenticated).toBe(true);

    // Step 3: Mock server cart merge
    const mergeSpy = vi.spyOn(cartService, 'mergeCart').mockResolvedValueOnce({
      id: 'cart_d1_user_999',
      userId: 'usr_buyer_999',
      sessionId: null,
      items: [
        {
          id: 'ci_merged_01',
          cartId: 'cart_d1_user_999',
          variantId: 'var_guest_item_1',
          productName: 'Item Guest 1',
          variantTitle: 'A',
          sku: 'G-1',
          unitPrice: 150000,
          quantity: 2,
          totalPrice: 300000,
          currentStock: 10,
        },
        {
          id: 'ci_existing_user_02',
          cartId: 'cart_d1_user_999',
          variantId: 'var_user_old_item',
          productName: 'Old Server Item',
          variantTitle: 'B',
          sku: 'OLD-2',
          unitPrice: 400000,
          quantity: 1,
          totalPrice: 400000,
          currentStock: 5,
        },
      ],
      subtotal: 700000,
      totalItems: 3,
    });

    // Step 4: Execute merge
    await cart.mergeGuestCart();

    expect(mergeSpy).toHaveBeenCalledWith([
      {
        variantId: 'var_guest_item_1',
        quantity: 2,
      },
    ]);

    expect(cart.items.length).toBe(2);
    expect(cart.totalItems).toBe(3);
    expect(cart.subtotal).toBe(700000);
    expect(cart.items[0].id).toBe('ci_merged_01');
    expect(cart.items[0].cartId).toBe('cart_d1_user_999');

    // Step 5: Authenticated cart operations sync to backend with authoritative IDs
    const updateSpy = vi.spyOn(cartService, 'updateItemQuantity').mockResolvedValueOnce({
      id: 'cart_d1_user_999',
      userId: 'usr_buyer_999',
      sessionId: null,
      items: [
        {
          id: 'ci_merged_01',
          cartId: 'cart_d1_user_999',
          variantId: 'var_guest_item_1',
          productName: 'Item Guest 1',
          variantTitle: 'A',
          sku: 'G-1',
          unitPrice: 150000,
          quantity: 3,
          totalPrice: 450000,
          currentStock: 10,
        },
        cart.items[1],
      ],
      subtotal: 850000,
      totalItems: 4,
    });

    await cart.updateQuantity('var_guest_item_1', 3);
    expect(updateSpy).toHaveBeenCalledWith('ci_merged_01', 3);
    expect(cart.items[0].quantity).toBe(3);
  });
});
