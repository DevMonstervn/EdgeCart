import {
  ERROR_CODES,
  ORDER_STATUS,
  type OrderStatus,
  type Product,
  type SellerInventoryAdjustInput,
  type SellerProductCreateInput,
  type SellerProductUpdateInput,
  type Store,
  type UpdateStoreInput,
} from '@edgecart/shared';
import { StoreRepository } from '../repositories/store.repo.js';
import { ProductRepository, type DbProduct } from '../repositories/product.repo.js';
import { CategoryRepository } from '../repositories/category.repo.js';
import { InventoryRepository } from '../repositories/inventory.repo.js';
import { OrderRepository } from '../repositories/order.repo.js';
import { CatalogService } from './catalog.service.js';
import { mapDbStore } from './store.service.js';
import { AppError } from '../utils/response.js';
import { assertProductImagesOwnership } from '../utils/r2-upload.js';
import type { Env } from '../types/env.js';

const ALLOWED_SELLER_ORDER_STATUSES = new Set<OrderStatus>([
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.SHIPPING,
  ORDER_STATUS.DELIVERED,
]);

export class SellerService {
  private storeRepo: StoreRepository;
  private productRepo: ProductRepository;
  private categoryRepo: CategoryRepository;
  private inventoryRepo: InventoryRepository;
  private orderRepo: OrderRepository;
  private catalogService: CatalogService;

  constructor(private env: Env) {
    this.storeRepo = new StoreRepository(env.DB);
    this.productRepo = new ProductRepository(env.DB);
    this.categoryRepo = new CategoryRepository(env.DB);
    this.inventoryRepo = new InventoryRepository(env.DB);
    this.orderRepo = new OrderRepository(env.DB);
    this.catalogService = new CatalogService(env);
  }

  private async mapProductDetail(p: DbProduct): Promise<Product> {
    const [variants, images] = await Promise.all([
      this.productRepo.getVariantsByProductId(p.id),
      this.productRepo.getImagesByProductId(p.id),
    ]);

    return {
      id: p.id,
      categoryId: p.category_id,
      storeId: p.store_id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      contentMarkdown: p.content_markdown,
      basePrice: p.base_price,
      salePrice: p.sale_price,
      isFeatured: p.is_featured === 1,
      isActive: p.is_active === 1,
      variants: variants.map((v) => ({
        id: v.id,
        productId: v.product_id,
        sku: v.sku,
        barcode: v.barcode,
        title: v.title,
        option1Name: v.option1_name,
        option1Value: v.option1_value,
        option2Name: v.option2_name,
        option2Value: v.option2_value,
        price: v.price,
        compareAtPrice: v.compare_at_price,
        stockQuantity: v.stock_quantity,
        weightGrams: v.weight_grams,
        isActive: v.is_active === 1,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
      })),
      images: images.map((img) => ({
        id: img.id,
        productId: img.product_id,
        variantId: img.variant_id,
        imageUrl: img.image_url,
        r2Key: img.r2_key,
        altText: img.alt_text,
        sortOrder: img.sort_order,
        createdAt: img.created_at,
      })),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  }

  async getStoreProfile(storeId: string): Promise<Store> {
    const dbStore = await this.storeRepo.findById(storeId);
    if (!dbStore) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy cửa hàng');
    }
    return mapDbStore(dbStore);
  }

  async updateStoreProfile(storeId: string, input: UpdateStoreInput): Promise<Store> {
    const updated = await this.storeRepo.updateProfile(storeId, input);
    const slugs = await this.storeRepo.getProductSlugsByStoreId(storeId);
    await this.catalogService.invalidateProductSlugs(slugs);
    return mapDbStore(updated);
  }

  async getDashboardStats(storeId: string) {
    const [activeProductsRes, hiddenProductsRes, lowStockItems, orderMetrics, recentOrdersRes] = await Promise.all([
      this.env.DB.prepare('SELECT COUNT(*) as count FROM products WHERE store_id = ? AND is_active = 1')
        .bind(storeId)
        .first<{ count: number }>(),
      this.env.DB.prepare('SELECT COUNT(*) as count FROM products WHERE store_id = ? AND is_active = 0')
        .bind(storeId)
        .first<{ count: number }>(),
      this.inventoryRepo.getInventoryList({ storeId, lowStockOnly: true }),
      this.orderRepo.getSellerDashboardMetrics(storeId),
      this.orderRepo.findSellerOrders(storeId, { limit: 5, offset: 0 }),
    ]);

    const recentOrders = [];
    for (const o of recentOrdersRes.orders) {
      const storeItems = await this.orderRepo.getSellerOrderItems(o.id, storeId);
      const storeSubtotal = storeItems.reduce((sum, item) => sum + item.total_price, 0);
      recentOrders.push({
        id: o.id,
        orderNumber: o.order_number,
        shippingName: o.shipping_name,
        shippingStatus: o.shipping_status,
        fulfillmentStatus: storeItems[0]?.fulfillment_status || o.shipping_status,
        storeSubtotal,
        itemCount: storeItems.reduce((sum, item) => sum + item.quantity, 0),
        createdAt: o.created_at,
      });
    }

    return {
      totalProducts: activeProductsRes?.count || 0,
      hiddenProducts: hiddenProductsRes?.count || 0,
      lowStockVariants: lowStockItems.length,
      totalOrders: orderMetrics.totalOrders,
      totalRevenue: orderMetrics.totalRevenue,
      recentOrders,
    };
  }

  async getProducts(storeId: string, params?: { q?: string; page?: number; limit?: number }) {
    const page = params?.page || 1;
    const limit = Math.min(params?.limit || 20, 50);

    const { products: dbProducts, total } = await this.productRepo.findSellerProducts(storeId, {
      q: params?.q,
      includeInactive: true,
      page,
      limit,
    });

    const products: Product[] = [];
    for (const p of dbProducts) {
      products.push(await this.mapProductDetail(p));
    }

    return {
      products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async createProduct(storeId: string, input: SellerProductCreateInput): Promise<Product> {
    const category = await this.categoryRepo.findById(input.categoryId);
    if (!category || category.is_active !== 1) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, 'Danh mục sản phẩm không tồn tại hoặc không hoạt động');
    }

    const existingSlug = await this.productRepo.findAnyBySlug(input.slug);
    if (existingSlug) {
      throw new AppError(409, ERROR_CODES.CONFLICT_RESOURCE_EXISTS, 'Slug sản phẩm đã tồn tại trên hệ thống');
    }

    const seenSkus = new Set<string>();
    for (const v of input.variants) {
      const normalizedSku = v.sku.trim().toUpperCase();
      if (seenSkus.has(normalizedSku)) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Mã SKU "${v.sku}" bị trùng lặp trong cùng sản phẩm`);
      }
      seenSkus.add(normalizedSku);

      const existingSku = await this.productRepo.findVariantBySku(v.sku);
      if (existingSku) {
        throw new AppError(409, ERROR_CODES.CONFLICT_RESOURCE_EXISTS, `Mã SKU "${v.sku}" đã tồn tại trên hệ thống`);
      }
    }

    assertProductImagesOwnership(input.images, [`stores/${storeId}/`]);

    const productId = crypto.randomUUID();
    const created = await this.productRepo.createProductWithVariants(
      {
        id: productId,
        categoryId: input.categoryId,
        storeId, // Always bound from verified D1 store
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        contentMarkdown: input.contentMarkdown ?? null,
        basePrice: input.basePrice,
        salePrice: input.salePrice ?? null,
        isFeatured: false,
      },
      input.variants.map((v) => ({
        id: crypto.randomUUID(),
        sku: v.sku.trim(),
        title: v.title.trim(),
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        stockQuantity: v.stockQuantity,
        option1Name: v.option1Name ?? null,
        option1Value: v.option1Value ?? null,
        option2Name: v.option2Name ?? null,
        option2Value: v.option2Value ?? null,
        weightGrams: v.weightGrams ?? 0,
      })),
      input.images
    );

    await this.catalogService.invalidateCatalogCache(created.slug);
    return await this.mapProductDetail(created);
  }

  async updateProduct(storeId: string, productId: string, input: SellerProductUpdateInput): Promise<Product> {
    const owned = await this.productRepo.findByIdAndStoreId(productId, storeId);
    if (!owned) {
      const anyProduct = await this.productRepo.findById(productId);
      if (anyProduct) {
        throw new AppError(
          403,
          ERROR_CODES.FORBIDDEN_ACCESS,
          'Bạn không có quyền chỉnh sửa sản phẩm của cửa hàng khác hoặc sản phẩm hệ thống'
        );
      }
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy sản phẩm');
    }

    if (input.categoryId !== undefined) {
      const category = await this.categoryRepo.findById(input.categoryId);
      if (!category || category.is_active !== 1) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, 'Danh mục sản phẩm không tồn tại hoặc không hoạt động');
      }
    }

    assertProductImagesOwnership(input.images, [`stores/${storeId}/`]);

    const updated = await this.productRepo.updateProduct(productId, input);
    await this.catalogService.invalidateCatalogCache(updated.slug);
    return await this.mapProductDetail(updated);
  }

  async deleteProduct(storeId: string, productId: string): Promise<void> {
    const owned = await this.productRepo.findByIdAndStoreId(productId, storeId);
    if (!owned) {
      const anyProduct = await this.productRepo.findById(productId);
      if (anyProduct) {
        throw new AppError(
          403,
          ERROR_CODES.FORBIDDEN_ACCESS,
          'Bạn không có quyền xóa sản phẩm của cửa hàng khác hoặc sản phẩm hệ thống'
        );
      }
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy sản phẩm');
    }

    await this.productRepo.deleteProduct(productId);
    await this.catalogService.invalidateCatalogCache(owned.slug);
  }

  async getInventory(storeId: string, params?: { q?: string; lowStockOnly?: boolean }) {
    const items = await this.inventoryRepo.getInventoryList({
      q: params?.q,
      lowStockOnly: params?.lowStockOnly,
      storeId,
    });

    return items.map((i) => ({
      id: i.id,
      sku: i.sku,
      title: i.title,
      productId: i.product_id,
      productName: i.product_name,
      storeId: i.store_id,
      stockQuantity: i.stock_quantity,
      price: i.price,
    }));
  }

  async adjustInventory(storeId: string, input: SellerInventoryAdjustInput, sellerUserId: string): Promise<void> {
    const variant = await this.productRepo.findVariantWithOwnership(input.variantId);
    if (!variant) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy biến thể sản phẩm');
    }

    if (variant.product_store_id !== storeId) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN_ACCESS,
        'Bạn không có quyền điều chỉnh tồn kho sản phẩm không thuộc cửa hàng của mình'
      );
    }

    try {
      await this.inventoryRepo.adjustStock({
        variantId: input.variantId,
        changeQuantity: input.changeQuantity,
        type: input.type,
        notes: input.notes || 'Người bán điều chỉnh tồn kho',
        createdBy: sellerUserId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể điều chỉnh tồn kho';
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, msg);
    }

    await this.catalogService.invalidateCatalogCache(variant.product_slug);
  }

  async getOrders(storeId: string, params?: { status?: string; page?: number; limit?: number }) {
    const page = params?.page || 1;
    const limit = Math.min(params?.limit || 20, 50);
    const offset = (page - 1) * limit;

    const { orders: dbOrders, total } = await this.orderRepo.findSellerOrders(storeId, {
      status: params?.status,
      limit,
      offset,
    });

    const orders = [];
    for (const o of dbOrders) {
      const storeItems = await this.orderRepo.getSellerOrderItems(o.id, storeId);
      const storeSubtotal = storeItems.reduce((sum, item) => sum + item.total_price, 0);

      orders.push({
        id: o.id,
        orderNumber: o.order_number,
        customerEmail: o.customer_email,
        customerPhone: o.customer_phone,
        shippingName: o.shipping_name,
        shippingAddress: o.shipping_address,
        shippingProvince: o.shipping_province,
        shippingDistrict: o.shipping_district,
        shippingWard: o.shipping_ward,
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        shippingStatus: o.shipping_status,
        fulfillmentStatus: storeItems[0]?.fulfillment_status || o.shipping_status,
        storeSubtotal,
        items: storeItems.map((i) => ({
          id: i.id,
          orderId: i.order_id,
          productId: i.product_id,
          variantId: i.variant_id,
          storeId: i.store_id,
          productName: i.product_name,
          variantTitle: i.variant_title,
          sku: i.sku,
          unitPrice: i.unit_price,
          quantity: i.quantity,
          totalPrice: i.total_price,
          fulfillmentStatus: i.fulfillment_status,
        })),
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      });
    }

    return {
      orders,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getOrderById(storeId: string, orderId: string) {
    const o = await this.orderRepo.findOrderById(orderId);
    if (!o) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy đơn hàng');
    }

    const storeItems = await this.orderRepo.getSellerOrderItems(orderId, storeId);
    if (storeItems.length === 0) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN_ACCESS,
        'Đơn hàng này không chứa sản phẩm thuộc cửa hàng của bạn'
      );
    }

    const storeSubtotal = storeItems.reduce((sum, item) => sum + item.total_price, 0);

    return {
      id: o.id,
      orderNumber: o.order_number,
      customerEmail: o.customer_email,
      customerPhone: o.customer_phone,
      shippingName: o.shipping_name,
      shippingAddress: o.shipping_address,
      shippingProvince: o.shipping_province,
      shippingDistrict: o.shipping_district,
      shippingWard: o.shipping_ward,
      paymentMethod: o.payment_method,
      paymentStatus: o.payment_status,
      shippingStatus: o.shipping_status,
      fulfillmentStatus: storeItems[0]?.fulfillment_status || o.shipping_status,
      storeSubtotal,
      notes: o.notes,
      items: storeItems.map((i) => ({
        id: i.id,
        orderId: i.order_id,
        productId: i.product_id,
        variantId: i.variant_id,
        storeId: i.store_id,
        productName: i.product_name,
        variantTitle: i.variant_title,
        sku: i.sku,
        unitPrice: i.unit_price,
        quantity: i.quantity,
        totalPrice: i.total_price,
        fulfillmentStatus: i.fulfillment_status,
      })),
      createdAt: o.created_at,
      updatedAt: o.updated_at,
    };
  }

  async updateOrderStatus(
    storeId: string,
    orderId: string,
    status: OrderStatus,
    note?: string,
    sellerUserId?: string
  ): Promise<void> {
    if (!ALLOWED_SELLER_ORDER_STATUSES.has(status)) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        'Người bán chỉ được cập nhật trạng thái xử lý/giao hàng (CONFIRMED, PROCESSING, SHIPPING, DELIVERED)'
      );
    }

    const o = await this.orderRepo.findOrderById(orderId);
    if (!o) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy đơn hàng');
    }

    const storeItems = await this.orderRepo.getSellerOrderItems(orderId, storeId);
    if (storeItems.length === 0) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN_ACCESS,
        'Bạn không có quyền cập nhật trạng thái đơn hàng không thuộc cửa hàng của mình'
      );
    }

    try {
      await this.orderRepo.updateSellerOrderFulfillment({
        orderId,
        storeId,
        status,
        note,
        sellerUserId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể cập nhật trạng thái đơn hàng';
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, msg);
    }
  }
}
