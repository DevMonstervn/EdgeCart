import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ProductCard from '../src/components/ProductCard.vue';
import type { Product } from '@edgecart/shared';

describe('ProductCard Component', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const mockProduct: Product = {
    id: 'prd_01',
    categoryId: 'cat_01',
    name: 'Áo Polo Thể Thao',
    slug: 'ao-polo-the-thao',
    basePrice: 300000,
    salePrice: 240000,
    isFeatured: true,
    isActive: true,
    category: {
      id: 'cat_01',
      name: 'Thời Trang',
      slug: 'thoi-trang',
      sortOrder: 1,
      isActive: true,
      createdAt: '2026-10-28',
      updatedAt: '2026-10-28',
    },
    variants: [
      {
        id: 'var_01',
        productId: 'prd_01',
        sku: 'POLO-01',
        title: 'Xanh Navy / L',
        price: 240000,
        compareAtPrice: 300000,
        stockQuantity: 15,
        isActive: true,
        createdAt: '2026-10-28',
        updatedAt: '2026-10-28',
      },
    ],
    createdAt: '2026-10-28',
    updatedAt: '2026-10-28',
  };

  it('should render product name, category and discount percentage', () => {
    const wrapper = mount(ProductCard, {
      props: {
        product: mockProduct,
      },
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.text()).toContain('Áo Polo Thể Thao');
    expect(wrapper.text()).toContain('Thời Trang');
    // Discount percentage (300k - 240k) / 300k = 20%
    expect(wrapper.text()).toContain('-20%');
  });

  it('should format currency correctly in VNĐ', () => {
    const wrapper = mount(ProductCard, {
      props: {
        product: mockProduct,
      },
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    });

    // 240.000 ₫
    expect(wrapper.text()).toMatch(/240\.000/);
  });
});
