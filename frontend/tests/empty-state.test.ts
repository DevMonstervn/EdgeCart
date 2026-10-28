import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EmptyState from '../src/components/EmptyState.vue';

describe('EmptyState Component', () => {
  it('should render custom title and description', () => {
    const wrapper = mount(EmptyState, {
      props: {
        title: 'Giỏ hàng rỗng',
        description: 'Vui lòng thêm sản phẩm vào giỏ hàng',
      },
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Giỏ hàng rỗng');
    expect(wrapper.text()).toContain('Vui lòng thêm sản phẩm vào giỏ hàng');
  });

  it('should emit action event when button is clicked', async () => {
    const wrapper = mount(EmptyState, {
      props: {
        title: 'Không có dữ liệu',
        actionText: 'Tải lại',
      },
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    });

    const button = wrapper.find('button');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    expect(wrapper.emitted('action')).toHaveLength(1);
  });
});
