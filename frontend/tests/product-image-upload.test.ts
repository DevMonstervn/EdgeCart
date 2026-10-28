import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { setActivePinia, createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { mount, flushPromises } from '@vue/test-utils';
import { MAX_IMAGE_UPLOAD_BYTES, type ProductImageInput, type User } from '@edgecart/shared';
import { apiClient } from '../src/services/api.js';
import { validateImageFileClient } from '../src/services/upload.service.js';
import { useAuthStore } from '../src/stores/auth.js';
import { createAppRouter } from '../src/router/index.js';
import ProductImageUploader from '../src/components/ProductImageUploader.vue';
import SellerProductsPage from '../src/pages/SellerProductsPage.vue';

const defaultAdapter = apiClient.defaults.adapter;

function makeSellerUser(): User {
  return {
    id: 'usr_seller_01',
    email: 'seller@edgecart.vn',
    fullName: 'Trần Minh Quân',
    role: 'CUSTOMER',
    isSeller: true,
    status: 'ACTIVE',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
  };
}

describe('Product Image Upload Service & UI Integration (R2 + product_images)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    apiClient.defaults.adapter = defaultAdapter;
  });

  afterEach(() => {
    apiClient.defaults.adapter = defaultAdapter;
    vi.unstubAllGlobals();
  });

  it('validates file extension, MIME type, empty files, and 5 MB size limit on client before network calls', () => {
    expect(validateImageFileClient({ name: 'cover.webp', type: 'image/webp', size: 120_000 })).toBeNull();
    expect(validateImageFileClient({ name: 'photo.jpg', type: 'image/jpeg', size: 500_000 })).toBeNull();

    // Empty file
    expect(validateImageFileClient({ name: 'empty.png', type: 'image/png', size: 0 })).toContain('rỗng');

    // > 5 MB
    expect(
      validateImageFileClient({ name: 'too-big.png', type: 'image/png', size: MAX_IMAGE_UPLOAD_BYTES + 10 })
    ).toContain('5 MB');

    // Unsupported extension / MIME
    expect(validateImageFileClient({ name: 'vector.svg', type: 'image/svg+xml', size: 1024 })).toContain(
      'không được hỗ trợ'
    );
    expect(validateImageFileClient({ name: 'spoof.png', type: 'image/jpeg', size: 1024 })).toContain('không khớp');
  });

  it('rejects invalid files in ProductImageUploader with role="alert" and makes zero API calls', async () => {
    const adapterSpy = vi.fn();
    apiClient.defaults.adapter = adapterSpy;

    const wrapper = mount(ProductImageUploader, {
      props: {
        modelValue: [],
      },
    });

    const inputEl = wrapper.find('input[type="file"]');
    const oversizedFile = new File([new Uint8Array(16)], 'huge-banner.png', { type: 'image/png' });
    Object.defineProperty(oversizedFile, 'size', { value: MAX_IMAGE_UPLOAD_BYTES + 1024 });

    Object.defineProperty(inputEl.element, 'files', {
      value: [oversizedFile],
      configurable: true,
    });
    await inputEl.trigger('change');
    await flushPromises();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('5 MB');
    expect(adapterSpy).not.toHaveBeenCalled();
  });

  it('surfaces 403 forbidden and 500 R2 upload errors cleanly in ProductImageUploader', async () => {
    // 1. 403 Forbidden on presigned-url
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError(
        'Forbidden',
        'ERR_BAD_REQUEST',
        config,
        {},
        {
          data: {
            success: false,
            error: { code: 'STORE_SUSPENDED', message: 'Cửa hàng của bạn đang bị tạm đình chỉ hoạt động' },
          },
          status: 403,
          statusText: 'Forbidden',
          headers: {},
          config,
        }
      );
    };

    const wrapper = mount(ProductImageUploader, {
      props: { modelValue: [] },
    });

    const inputEl = wrapper.find('input[type="file"]');
    const validFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'product.png', { type: 'image/png' });
    Object.defineProperty(inputEl.element, 'files', {
      value: [validFile],
      configurable: true,
    });

    await inputEl.trigger('change');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toContain('tạm đình chỉ');

    // 2. 200 on presigned-url, but 500 on binary PUT to R2
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => ({
      data: {
        success: true,
        data: {
          uploadUrl: 'http://localhost:8787/api/v1/uploads/direct/stores/sto_1/1_abc.png?token=sig',
          publicUrl: 'http://localhost:8787/api/v1/uploads/files/stores/sto_1/1_abc.png',
          r2Key: 'stores/sto_1/1_abc.png',
          contentType: 'image/png',
          maxSizeBytes: MAX_IMAGE_UPLOAD_BYTES,
          expiresIn: 300,
        },
      },
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      config,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Không thể lưu tệp ảnh lên Cloudflare R2. Vui lòng thử lại',
            },
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    await inputEl.trigger('change');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toContain('Cloudflare R2');
  });

  it('uploads product image to R2 and submits images[] payload when Seller creates a product', async () => {
    const auth = useAuthStore();
    auth.user = makeSellerUser();
    auth.accessToken = 'valid-seller-jwt';

    let capturedCreateBody: Record<string, unknown> | null = null;

    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const url = config.url || '';
      if (url.includes('/categories')) {
        return {
          data: {
            success: true,
            data: [
              {
                id: 'cat_audio',
                name: 'Âm thanh',
                slug: 'am-thanh',
                sortOrder: 1,
                isActive: true,
                createdAt: '',
                updatedAt: '',
              },
            ],
          },
          status: 200,
          statusText: 'OK',
          headers: new AxiosHeaders(),
          config,
        };
      }
      if (url.includes('/seller/products') && config.method === 'get') {
        return {
          data: { success: true, data: [], meta: { page: 1, limit: 15, total: 0, totalPages: 1 } },
          status: 200,
          statusText: 'OK',
          headers: new AxiosHeaders(),
          config,
        };
      }
      if (url.includes('/uploads/presigned-url') && config.method === 'post') {
        return {
          data: {
            success: true,
            data: {
              uploadUrl: 'http://localhost:8787/api/v1/uploads/direct/stores/sto_01/999_headphone.webp?token=real_hmac',
              publicUrl: 'http://localhost:8787/api/v1/uploads/files/stores/sto_01/999_headphone.webp',
              r2Key: 'stores/sto_01/999_headphone.webp',
              contentType: 'image/webp',
              maxSizeBytes: MAX_IMAGE_UPLOAD_BYTES,
              expiresIn: 300,
            },
          },
          status: 200,
          statusText: 'OK',
          headers: new AxiosHeaders(),
          config,
        };
      }
      if (url.includes('/seller/products') && config.method === 'post') {
        capturedCreateBody = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        return {
          data: {
            success: true,
            data: {
              id: 'prd_new_01',
              categoryId: 'cat_audio',
              storeId: 'sto_01',
              name: 'Tai Nghe ANC Edge',
              slug: 'tai-nghe-anc-edge',
              basePrice: 1290000,
              isFeatured: false,
              isActive: true,
              images: (capturedCreateBody?.images as ProductImageInput[]) || [],
              variants: [],
              createdAt: '',
              updatedAt: '',
            },
          },
          status: 201,
          statusText: 'Created',
          headers: new AxiosHeaders(),
          config,
        };
      }
      throw new Error(`Unhandled mock URL: ${config.method} ${url}`);
    };

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            r2Key: 'stores/sto_01/999_headphone.webp',
            imageUrl: 'http://localhost:8787/api/v1/uploads/files/stores/sto_01/999_headphone.webp',
            contentType: 'image/webp',
            size: 128,
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    const router = createAppRouter(createMemoryHistory());
    await router.push('/seller/products');
    await router.isReady();

    const wrapper = mount(SellerProductsPage, {
      global: {
        plugins: [router],
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    // Open Create Product modal
    const createBtn = wrapper.findAll('button').find((b) => b.text().includes('Đăng sản phẩm mới'));
    expect(createBtn).toBeTruthy();
    await createBtn!.trigger('click');
    await flushPromises();

    // Select an image file in ProductImageUploader inside the modal
    const fileInput = wrapper.find('input[type="file"]');
    expect(fileInput.exists()).toBe(true);
    const webpFile = new File([new Uint8Array(128)], 'tai-nghe-anc.webp', { type: 'image/webp' });
    Object.defineProperty(fileInput.element, 'files', {
      value: [webpFile],
      configurable: true,
    });
    await fileInput.trigger('change');
    await flushPromises();

    // Verify binary PUT fetch was called with signed URL
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain('/api/v1/uploads/direct/stores/sto_01/999_headphone.webp?token=');
    expect(wrapper.text()).toContain('Ảnh đại diện');

    // Fill name & submit form
    const nameInput = wrapper.find('input[placeholder*="Bàn phím cơ"]');
    await nameInput.setValue('Tai Nghe ANC Edge');
    await nameInput.trigger('input');

    const form = wrapper.find('form');
    await form.trigger('submit');
    await flushPromises();

    expect(capturedCreateBody).not.toBeNull();
    expect(capturedCreateBody!.images).toEqual([
      {
        imageUrl: 'http://localhost:8787/api/v1/uploads/files/stores/sto_01/999_headphone.webp',
        r2Key: 'stores/sto_01/999_headphone.webp',
        altText: 'tai nghe anc',
        sortOrder: 0,
      },
    ]);
  });
});
