import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { mount, flushPromises } from '@vue/test-utils';
import { createAppRouter } from '../src/router/index.js';
import { orderService } from '../src/services/order.service.js';
import OrderTrackingPage from '../src/pages/OrderTrackingPage.vue';
import type { Order } from '@edgecart/shared';

const mockGuestOrder: Order = {
  id: 'ord_guest_101',
  orderNumber: 'EC-999888-777',
  userId: null,
  customerEmail: 'guest.shopper@gmail.com',
  customerPhone: '0912345678',
  shippingName: 'Lê Văn Khách',
  shippingAddress: '123 Nguyễn Huệ',
  shippingProvince: 'TP. Hồ Chí Minh',
  shippingDistrict: 'Quận 1',
  shippingWard: 'Phường Bến Nghé',
  paymentMethod: 'COD',
  paymentStatus: 'UNPAID',
  shippingStatus: 'PENDING',
  subtotal: 300000,
  discountAmount: 0,
  shippingFee: 30000,
  totalAmount: 330000,
  notes: 'Giao giờ hành chính',
  items: [
    {
      id: 'item_01',
      orderId: 'ord_guest_101',
      productId: 'prd_01',
      variantId: 'var_01',
      storeId: null,
      productName: 'Áo Thun Cao Cấp',
      variantTitle: 'Trắng / XL',
      sku: 'AT-TRG-XL',
      unitPrice: 300000,
      quantity: 1,
      totalPrice: 300000,
      fulfillmentStatus: 'PENDING',
    },
  ],
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
};

describe('OrderTrackingPage Component Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('1. Renders tracking form with order number and security token inputs', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/order-tracking');

    const wrapper = mount(OrderTrackingPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Tra Cứu Đơn Hàng Khách Vãng Lai');
    expect(wrapper.find('#track-order-number').exists()).toBe(true);
    expect(wrapper.find('#track-order-token').exists()).toBe(true);
  });

  it('2. Submits valid order number and token, displaying full order snapshot', async () => {
    const router = createAppRouter(createMemoryHistory());
    vi.spyOn(orderService, 'getGuestOrder').mockResolvedValue(mockGuestOrder);

    await router.push('/order-tracking');
    const wrapper = mount(OrderTrackingPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const numInput = wrapper.find('#track-order-number');
    const tokInput = wrapper.find('#track-order-token');
    await numInput.setValue('EC-999888-777');
    await tokInput.setValue('550e8400-e29b-41d4-a716-446655440000');

    await wrapper.find('#tracking-form').trigger('submit.prevent');
    await flushPromises();

    expect(orderService.getGuestOrder).toHaveBeenCalledWith(
      'EC-999888-777',
      '550e8400-e29b-41d4-a716-446655440000'
    );
    expect(wrapper.text()).toContain('EC-999888-777');
    expect(wrapper.text()).toContain('Lê Văn Khách');
    expect(wrapper.text()).toContain('123 Nguyễn Huệ');
    expect(wrapper.text()).toContain('Áo Thun Cao Cấp');
    expect(wrapper.text()).toContain('Chờ xác nhận');
    expect(wrapper.text()).toContain('Chưa thanh toán');
  });

  it('3. Displays error message when tracking lookup fails with invalid token', async () => {
    const router = createAppRouter(createMemoryHistory());
    vi.spyOn(orderService, 'getGuestOrder').mockRejectedValue(
      new Error('Mã truy cập đơn hàng không chính xác hoặc đã hết hạn')
    );

    await router.push('/order-tracking');
    const wrapper = mount(OrderTrackingPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find('#track-order-number').setValue('EC-999888-777');
    await wrapper.find('#track-order-token').setValue('wrong-token');
    await wrapper.find('#tracking-form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('Không thể tra cứu đơn hàng');
    expect(wrapper.text()).toContain('Mã truy cập đơn hàng không chính xác hoặc đã hết hạn');
  });
});
