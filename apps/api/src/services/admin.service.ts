import {
  ERROR_CODES,
  ProductImageInputSchema,
  SELLER_REQUEST_STATUS,
  type AdminAuditLog,
  type Category,
  type Order,
  type OrderStatus,
  type Product,
  type ProductImageInput,
  type ReviewSellerRequestInput,
  type SellerProductUpdateInput,
  type Store,
  type StoreStatus,
  type UpdateStoreStatusInput,
  type UpdateUserRoleInput,
  type UpdateUserStatusInput,
  type User,
  type UserRole,
  type UserStatus,
} from '@edgecart/shared';
import { AdminRepository } from '../repositories/admin.repo.js';
import { ProductRepository, type DbProduct } from '../repositories/product.repo.js';
import { CategoryRepository } from '../repositories/category.repo.js';
import { OrderRepository } from '../repositories/order.repo.js';
import { InventoryRepository } from '../repositories/inventory.repo.js';
import { UserRepository, type DbUser } from '../repositories/user.repo.js';
import { StoreRepository } from '../repositories/store.repo.js';
import { SellerRequestRepository } from '../repositories/seller-request.repo.js';
import { AuditRepository } from '../repositories/audit.repo.js';
import { CatalogService } from './catalog.service.js';
import { mapDbSellerRequest, mapDbStore } from './store.service.js';
import { AppError } from '../utils/response.js';
import { assertProductImagesOwnership } from '../utils/r2-upload.js';
import type { Env } from '../types/env.js';

function mapSafeUser(u: DbUser): User {
  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    phone: u.phone,
    role: u.role as UserRole,
    isSeller: u.is_seller === 1,
    status: u.status as UserStatus,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };
}

export class AdminService {
  private adminRepo: AdminRepository;
  private productRepo: ProductRepository;
  private categoryRepo: CategoryRepository;
  private orderRepo: OrderRepository;
  private inventoryRepo: InventoryRepository;
  private userRepo: UserRepository;
  private storeRepo: StoreRepository;
  private sellerRequestRepo: SellerRequestRepository;
  private auditRepo: AuditRepository;
  private catalogService: CatalogService;

  constructor(private env: Env) {
    this.adminRepo = new AdminRepository(env.DB);
    this.productRepo = new ProductRepository(env.DB);
    this.categoryRepo = new CategoryRepository(env.DB);
    this.orderRepo = new OrderRepository(env.DB);
    this.inventoryRepo = new InventoryRepository(env.DB);
    this.userRepo = new UserRepository(env.DB);
    this.storeRepo = new StoreRepository(env.DB);
    this.sellerRequestRepo = new SellerRequestRepository(env.DB);
    this.auditRepo = new AuditRepository(env.DB);
    this.catalogService = new CatalogService(env);
  }

  private async mapAdminProduct(p: DbProduct): Promise<Product> {
    const [variants, images, dbStore] = await Promise.all([
      this.productRepo.getVariantsByProductId(p.id),
      this.productRepo.getImagesByProductId(p.id),
      p.store_id ? this.storeRepo.findById(p.store_id) : Promise.resolve(null),
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
      store: dbStore
        ? {
            id: dbStore.id,
            name: dbStore.name,
            slug: dbStore.slug,
            logoUrl: dbStore.logo_url,
            status: dbStore.status as StoreStatus,
          }
        : null,
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

  async getDashboardStats() {
    const stats = await this.adminRepo.getDashboardStats();
    const { orders } = await this.orderRepo.findAllOrders({ limit: 5 });

    return {
      ...stats,
      recentOrders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        shippingName: o.shipping_name,
        shippingStatus: o.shipping_status,
        totalAmount: o.total_amount,
        createdAt: o.created_at,
      })),
    };
  }

  async getAdminProducts(
    params: {
      q?: string;
      scope?: 'system' | 'all';
      storeId?: string;
      includeInactive?: boolean;
      page?: number;
      limit?: number;
    },
    actorRole: UserRole = 'SUPER_ADMIN'
  ) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 50);

    // PRODUCT_MANAGER manages system products (store_id IS NULL); SUPER_ADMIN can view all or filter
    const effectiveScope =
      actorRole === 'PRODUCT_MANAGER' ? 'system' : params.scope || (params.storeId ? 'all' : 'all');

    const { products: dbProducts, total } = await this.productRepo.findAdminProducts({
      q: params.q,
      scope: effectiveScope,
      storeId: actorRole === 'SUPER_ADMIN' ? params.storeId : undefined,
      includeInactive: params.includeInactive ?? true,
      page,
      limit,
    });

    const products: Product[] = [];
    for (const p of dbProducts) {
      products.push(await this.mapAdminProduct(p));
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

  async createProduct(data: {
    name: string;
    slug: string;
    categoryId: string;
    basePrice: number;
    salePrice?: number | null;
    description?: string | null;
    contentMarkdown?: string | null;
    isFeatured?: boolean;
    variants: Array<{
      sku: string;
      title: string;
      price: number;
      compareAtPrice?: number | null;
      stockQuantity: number;
    }>;
    images?: unknown;
  }): Promise<Product> {
    if (!data.name || !data.slug || !data.categoryId || !Array.isArray(data.variants) || data.variants.length === 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, 'Thông tin sản phẩm hoặc biến thể không hợp lệ');
    }

    let validatedImages: ProductImageInput[] | undefined;
    if (data.images !== undefined) {
      if (!Array.isArray(data.images) || data.images.length > 8) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, 'Danh sách ảnh sản phẩm không hợp lệ (tối đa 8 ảnh)');
      }
      validatedImages = data.images.map((item) => {
        const parsed = ProductImageInputSchema.safeParse(item);
        if (!parsed.success) {
          throw new AppError(
            400,
            ERROR_CODES.BAD_REQUEST,
            parsed.error.issues[0]?.message || 'Thông tin ảnh sản phẩm không hợp lệ'
          );
        }
        return parsed.data;
      });
      assertProductImagesOwnership(validatedImages, ['products/']);
    }

    const category = await this.categoryRepo.findById(data.categoryId);
    if (!category) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, 'Danh mục sản phẩm không tồn tại');
    }

    const normalizedSlug = data.slug.trim().toLowerCase();
    const existingSlug = await this.productRepo.findAnyBySlug(normalizedSlug);
    if (existingSlug) {
      throw new AppError(409, ERROR_CODES.CONFLICT_RESOURCE_EXISTS, 'Slug sản phẩm đã tồn tại trên hệ thống');
    }

    for (const v of data.variants) {
      const existingSku = await this.productRepo.findVariantBySku(v.sku);
      if (existingSku) {
        throw new AppError(409, ERROR_CODES.CONFLICT_RESOURCE_EXISTS, `Mã SKU "${v.sku}" đã tồn tại trên hệ thống`);
      }
    }

    const productId = crypto.randomUUID();
    const created = await this.productRepo.createProductWithVariants(
      {
        id: productId,
        name: data.name.trim(),
        slug: normalizedSlug,
        categoryId: data.categoryId,
        storeId: null, // System / Official Admin product always has store_id = NULL
        basePrice: data.basePrice,
        salePrice: data.salePrice ?? null,
        description: data.description ?? null,
        contentMarkdown: data.contentMarkdown ?? null,
        isFeatured: data.isFeatured ?? false,
      },
      data.variants.map((v) => ({
        id: crypto.randomUUID(),
        sku: v.sku.trim(),
        title: v.title.trim(),
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        stockQuantity: v.stockQuantity,
      })),
      validatedImages
    );

    await this.catalogService.invalidateCatalogCache(normalizedSlug);
    return await this.mapAdminProduct(created);
  }

  async updateProduct(
    id: string,
    input: SellerProductUpdateInput,
    actorRole: UserRole = 'SUPER_ADMIN'
  ): Promise<Product> {
    const existing = await this.productRepo.findById(id);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy sản phẩm');
    }

    if (actorRole === 'PRODUCT_MANAGER' && existing.store_id !== null) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN_ACCESS,
        'PRODUCT_MANAGER chỉ được phép chỉnh sửa sản phẩm hệ thống (store_id = NULL)'
      );
    }

    if (input.categoryId !== undefined) {
      const cat = await this.categoryRepo.findById(input.categoryId);
      if (!cat) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, 'Danh mục sản phẩm không tồn tại');
      }
    }

    const allowedImagePrefixes =
      existing.store_id === null ? ['products/'] : ['products/', `stores/${existing.store_id}/`];
    assertProductImagesOwnership(input.images, allowedImagePrefixes);

    const updated = await this.productRepo.updateProduct(id, input);
    await this.catalogService.invalidateCatalogCache(updated.slug);
    return await this.mapAdminProduct(updated);
  }

  async deleteProduct(id: string, actorRole: UserRole = 'SUPER_ADMIN'): Promise<void> {
    const p = await this.productRepo.findById(id);
    if (!p) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy sản phẩm');
    }

    if (actorRole === 'PRODUCT_MANAGER' && p.store_id !== null) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN_ACCESS,
        'PRODUCT_MANAGER chỉ được phép xóa/ẩn sản phẩm hệ thống (store_id = NULL)'
      );
    }

    await this.productRepo.deleteProduct(id);
    await this.catalogService.invalidateCatalogCache(p.slug);
  }

  async createCategory(data: {
    name: string;
    slug: string;
    parentId?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    sortOrder?: number;
  }): Promise<Category> {
    if (!data.name || !data.slug) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, 'Tên và slug danh mục không được để trống');
    }

    const normalizedSlug = data.slug.trim().toLowerCase();
    const existing = await this.categoryRepo.findBySlug(normalizedSlug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT_RESOURCE_EXISTS, 'Slug danh mục đã tồn tại');
    }

    const created = await this.categoryRepo.create({
      id: crypto.randomUUID(),
      parentId: data.parentId || null,
      name: data.name.trim(),
      slug: normalizedSlug,
      description: data.description || null,
      imageUrl: data.imageUrl || null,
      sortOrder: data.sortOrder ?? 0,
    });

    await this.catalogService.invalidateCatalogCache();
    return {
      id: created.id,
      parentId: created.parent_id,
      name: created.name,
      slug: created.slug,
      description: created.description,
      imageUrl: created.image_url,
      sortOrder: created.sort_order,
      isActive: created.is_active === 1,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };
  }

  async getOrders(params?: { status?: string; page?: number; limit?: number }) {
    const page = params?.page || 1;
    const limit = Math.min(params?.limit || 20, 50);
    const offset = (page - 1) * limit;

    const { orders, total } = await this.orderRepo.findAllOrders({
      status: params?.status,
      limit,
      offset,
    });

    return {
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        customerEmail: o.customer_email,
        customerPhone: o.customer_phone,
        shippingName: o.shipping_name,
        shippingAddress: o.shipping_address,
        paymentMethod: o.payment_method as any,
        paymentStatus: o.payment_status as any,
        shippingStatus: o.shipping_status as any,
        totalAmount: o.total_amount,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getOrderById(orderId: string): Promise<Order> {
    const o = await this.orderRepo.findOrderById(orderId);
    if (!o) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy đơn hàng');
    }
    const items = await this.orderRepo.getOrderItems(o.id);
    return {
      id: o.id,
      orderNumber: o.order_number,
      userId: o.user_id,
      customerEmail: o.customer_email,
      customerPhone: o.customer_phone,
      shippingName: o.shipping_name,
      shippingAddress: o.shipping_address,
      shippingProvince: o.shipping_province,
      shippingDistrict: o.shipping_district,
      shippingWard: o.shipping_ward,
      paymentMethod: o.payment_method as any,
      paymentStatus: o.payment_status as any,
      shippingStatus: o.shipping_status as any,
      subtotal: o.subtotal,
      discountAmount: o.discount_amount,
      shippingFee: o.shipping_fee,
      totalAmount: o.total_amount,
      notes: o.notes,
      items: items.map((i) => ({
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
        fulfillmentStatus: i.fulfillment_status as any,
      })),
      createdAt: o.created_at,
      updatedAt: o.updated_at,
    };
  }

  async updateOrderStatus(orderId: string, status: OrderStatus, note?: string, createdBy?: string) {
    const existing = await this.orderRepo.findOrderById(orderId);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy đơn hàng');
    }

    if (status === 'CANCELLED' && (existing.shipping_status === 'PENDING' || existing.shipping_status === 'CONFIRMED')) {
      await this.orderRepo.cancelOrderAndRestock(orderId, note || 'Admin hủy đơn hàng', createdBy);
      const { results } = await this.env.DB.prepare(
        `SELECT DISTINCT p.slug FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`
      )
        .bind(orderId)
        .all<{ slug: string }>();
      if (results && results.length > 0) {
        await this.catalogService.invalidateProductSlugs(results.map((r) => r.slug));
      }
      return;
    }

    await this.orderRepo.updateOrderStatus(orderId, status, note, createdBy);
  }

  async getInventory(
    params?: { q?: string; lowStockOnly?: boolean; storeId?: string | null },
    actorRole: UserRole = 'SUPER_ADMIN'
  ) {
    // PRODUCT_MANAGER only views system inventory (store_id IS NULL)
    const effectiveStoreId = actorRole === 'PRODUCT_MANAGER' ? null : params?.storeId;
    const list = await this.inventoryRepo.getInventoryList({
      q: params?.q,
      lowStockOnly: params?.lowStockOnly,
      storeId: effectiveStoreId,
    });

    return list.map((i) => ({
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

  async adjustInventory(
    variantId: string,
    changeQuantity: number,
    type: string,
    notes: string,
    createdBy?: string,
    actorRole: UserRole = 'SUPER_ADMIN'
  ) {
    const variant = await this.productRepo.findVariantWithOwnership(variantId);
    if (!variant) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy biến thể sản phẩm');
    }

    if (actorRole === 'PRODUCT_MANAGER' && variant.product_store_id !== null) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN_ACCESS,
        'PRODUCT_MANAGER chỉ được điều chỉnh tồn kho cho sản phẩm hệ thống (store_id = NULL)'
      );
    }

    await this.inventoryRepo.adjustStock({
      variantId,
      changeQuantity,
      type,
      notes,
      createdBy,
    });
    await this.catalogService.invalidateCatalogCache(variant.product_slug);
  }

  // =========================================================================
  // SUPER_ADMIN EXCLUSIVE GOVERNANCE OPERATIONS
  // =========================================================================

  async getUsers(params?: {
    role?: string;
    status?: string;
    isSeller?: boolean;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = Math.min(params?.limit || 20, 50);
    const offset = (page - 1) * limit;

    const { users, total } = await this.userRepo.findAllUsers({
      role: params?.role,
      status: params?.status,
      isSeller: params?.isSeller,
      q: params?.q,
      limit,
      offset,
    });

    return {
      users: users.map(mapSafeUser),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async updateUserStatus(
    targetUserId: string,
    input: UpdateUserStatusInput,
    adminUserId: string,
    ipAddress?: string | null
  ): Promise<User> {
    if (targetUserId === adminUserId) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        'Không thể tự khóa hoặc thay đổi trạng thái tài khoản của chính mình'
      );
    }

    const target = await this.userRepo.findById(targetUserId);
    if (!target) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy người dùng');
    }

    if (target.role === 'SUPER_ADMIN' && input.status !== 'ACTIVE') {
      const activeSuperAdmins = await this.userRepo.countActiveSuperAdmins();
      if (activeSuperAdmins <= 1) {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          'Không thể khóa tài khoản SUPER_ADMIN đang hoạt động cuối cùng của hệ thống'
        );
      }
    }

    await this.userRepo.updateStatusWithAudit({
      targetUserId,
      fromStatus: target.status,
      toStatus: input.status,
      adminUserId,
      reason: input.reason,
      ipAddress,
    });

    // Immediate KV token & session revocation when locking/banning an account
    if (this.env.KV) {
      if (input.status !== 'ACTIVE') {
        await this.env.KV.put(`revoked_user:${targetUserId}`, '1', { expirationTtl: 900 });
        let cursor: string | undefined = undefined;
        const prefix = `session:${targetUserId}:`;
        for (let page = 0; page < 50; page++) {
          const sessions: KVNamespaceListResult<unknown, string> = await this.env.KV.list({
            prefix,
            cursor,
          });
          const deletions: Promise<void>[] = [];
          for (const k of sessions.keys) {
            deletions.push(this.env.KV.delete(k.name));
            const tokenPart = k.name.slice(prefix.length);
            if (tokenPart) {
              deletions.push(this.env.KV.delete(`refresh_idx:${tokenPart}`));
            }
          }
          await Promise.all(deletions);
          if (sessions.list_complete) {
            break;
          }
          cursor = sessions.cursor;
        }
      } else {
        await this.env.KV.delete(`revoked_user:${targetUserId}`);
      }
    }

    const updated = await this.userRepo.findById(targetUserId);
    if (!updated) throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy người dùng');
    return mapSafeUser(updated);
  }

  async updateUserRole(
    targetUserId: string,
    input: UpdateUserRoleInput,
    adminUserId: string,
    ipAddress?: string | null
  ): Promise<User> {
    if (targetUserId === adminUserId) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, 'Không thể tự thay đổi vai trò của chính mình');
    }

    const target = await this.userRepo.findById(targetUserId);
    if (!target) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy người dùng');
    }

    if (target.role === 'SUPER_ADMIN') {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN_ACCESS,
        'Không thể hạ quyền tài khoản SUPER_ADMIN thông qua API vận hành'
      );
    }

    await this.userRepo.updateRoleWithAudit({
      targetUserId,
      fromRole: target.role,
      toRole: input.role,
      adminUserId,
      reason: input.reason,
      ipAddress,
    });

    const updated = await this.userRepo.findById(targetUserId);
    if (!updated) throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy người dùng');
    return mapSafeUser(updated);
  }

  async getSellerRequests(params?: { status?: string; page?: number; limit?: number }) {
    const page = params?.page || 1;
    const limit = Math.min(params?.limit || 20, 50);
    const offset = (page - 1) * limit;

    const { requests, total } = await this.sellerRequestRepo.findAllRequests({
      status: params?.status,
      limit,
      offset,
    });

    return {
      requests: requests.map((r) => mapDbSellerRequest(r)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async reviewSellerRequest(
    requestId: string,
    input: ReviewSellerRequestInput,
    reviewerId: string,
    ipAddress?: string | null
  ) {
    const req = await this.sellerRequestRepo.findById(requestId);
    if (!req) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy yêu cầu mở cửa hàng');
    }

    if (req.status !== SELLER_REQUEST_STATUS.PENDING) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT_RESOURCE_EXISTS,
        'Yêu cầu mở cửa hàng này đã được xét duyệt trước đó'
      );
    }

    const applicant = await this.userRepo.findById(req.user_id);
    if (!applicant) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy tài khoản người đăng ký');
    }

    if (input.status === SELLER_REQUEST_STATUS.APPROVED) {
      if (applicant.status !== 'ACTIVE') {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          'Không thể phê duyệt mở cửa hàng cho tài khoản đang bị khóa'
        );
      }

      const [existingOwnerStore, existingSlugStore] = await Promise.all([
        this.storeRepo.findByOwnerUserId(req.user_id),
        this.storeRepo.findBySlug(req.store_slug),
      ]);

      if (existingOwnerStore) {
        throw new AppError(409, ERROR_CODES.CONFLICT_RESOURCE_EXISTS, 'Người dùng này đã sở hữu một cửa hàng');
      }
      if (existingSlugStore) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT_RESOURCE_EXISTS,
          'Đường dẫn (slug) cửa hàng đã tồn tại trên hệ thống'
        );
      }

      const storeId = crypto.randomUUID();
      await this.sellerRequestRepo.approveRequestAtomic({
        requestId,
        userId: req.user_id,
        storeId,
        storeName: req.store_name,
        storeSlug: req.store_slug,
        storeDescription: req.store_description,
        phone: req.phone,
        businessEmail: req.business_email,
        reviewerId,
        ipAddress,
      });

      const [updatedReq, createdStore] = await Promise.all([
        this.sellerRequestRepo.findById(requestId),
        this.storeRepo.findById(storeId),
      ]);

      return {
        request: updatedReq ? mapDbSellerRequest(updatedReq) : null,
        store: createdStore ? mapDbStore(createdStore) : null,
      };
    }

    await this.sellerRequestRepo.rejectRequestAtomic({
      requestId,
      applicantUserId: req.user_id,
      rejectionReason: input.rejectionReason || 'Không đạt điều kiện phê duyệt',
      reviewerId,
      ipAddress,
    });

    const updatedReq = await this.sellerRequestRepo.findById(requestId);
    return {
      request: updatedReq ? mapDbSellerRequest(updatedReq) : null,
      store: null,
    };
  }

  async getStores(params?: { status?: string; q?: string; page?: number; limit?: number }) {
    const page = params?.page || 1;
    const limit = Math.min(params?.limit || 20, 50);
    const offset = (page - 1) * limit;

    const { stores, total } = await this.storeRepo.findAllStores({
      status: params?.status,
      q: params?.q,
      limit,
      offset,
    });

    return {
      stores: stores.map((s) => ({
        ...mapDbStore(s),
        ownerEmail: s.owner_email,
        ownerFullName: s.owner_full_name,
        productCount: s.product_count,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async updateStoreStatus(
    storeId: string,
    input: UpdateStoreStatusInput,
    adminUserId: string,
    ipAddress?: string | null
  ): Promise<Store> {
    const existing = await this.storeRepo.findById(storeId);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy cửa hàng');
    }

    await this.storeRepo.updateStatusWithAudit({
      storeId,
      fromStatus: existing.status,
      toStatus: input.status,
      adminUserId,
      reason: input.reason,
      ipAddress,
    });

    // Invalidate all KV-cached product detail entries belonging to this store
    const productSlugs = await this.storeRepo.getProductSlugsByStoreId(storeId);
    await this.catalogService.invalidateProductSlugs(productSlugs);

    const updated = await this.storeRepo.findById(storeId);
    if (!updated) throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy cửa hàng');
    return mapDbStore(updated);
  }

  async getAuditLogs(params?: {
    entity?: string;
    action?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = Math.min(params?.limit || 30, 100);
    const offset = (page - 1) * limit;

    const { logs, total } = await this.auditRepo.findAll({
      entity: params?.entity,
      action: params?.action,
      userId: params?.userId,
      limit,
      offset,
    });

    const mapped: AdminAuditLog[] = logs.map((l) => {
      let parsedPayload: unknown = null;
      if (l.payload) {
        try {
          parsedPayload = JSON.parse(l.payload);
        } catch {
          parsedPayload = l.payload;
        }
      }
      return {
        id: l.id,
        userId: l.user_id,
        action: l.action,
        entity: l.entity,
        entityId: l.entity_id,
        payload: parsedPayload,
        ipAddress: l.ip_address,
        createdAt: l.created_at,
      };
    });

    return {
      logs: mapped,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
