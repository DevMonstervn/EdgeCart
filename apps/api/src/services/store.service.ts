import {
  ERROR_CODES,
  type CreateSellerRequestInput,
  type SellerRequest,
  type SellerRequestStatus,
  type Store,
  type StoreStatus,
} from '@edgecart/shared';
import { StoreRepository, type DbStore } from '../repositories/store.repo.js';
import { SellerRequestRepository, type DbSellerRequest } from '../repositories/seller-request.repo.js';
import { CatalogService } from './catalog.service.js';
import { AppError } from '../utils/response.js';
import type { Env } from '../types/env.js';

export function mapDbStore(s: DbStore): Store {
  return {
    id: s.id,
    ownerUserId: s.owner_user_id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    logoUrl: s.logo_url,
    bannerUrl: s.banner_url,
    phone: s.phone,
    email: s.email,
    status: s.status as StoreStatus,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

export function mapDbSellerRequest(r: DbSellerRequest & { user_email?: string; user_full_name?: string }): SellerRequest {
  return {
    id: r.id,
    userId: r.user_id,
    ...(r.user_email !== undefined ? { userEmail: r.user_email } : {}),
    ...(r.user_full_name !== undefined ? { userFullName: r.user_full_name } : {}),
    storeName: r.store_name,
    storeSlug: r.store_slug,
    storeDescription: r.store_description,
    phone: r.phone,
    businessEmail: r.business_email,
    status: r.status as SellerRequestStatus,
    rejectionReason: r.rejection_reason,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class StoreService {
  private storeRepo: StoreRepository;
  private sellerRequestRepo: SellerRequestRepository;
  private catalogService: CatalogService;

  constructor(private env: Env) {
    this.storeRepo = new StoreRepository(env.DB);
    this.sellerRequestRepo = new SellerRequestRepository(env.DB);
    this.catalogService = new CatalogService(env);
  }

  async getPublicStoreBySlug(
    slug: string,
    params?: {
      page?: number;
      limit?: number;
      q?: string;
      sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular';
    }
  ) {
    const dbStore = await this.storeRepo.findActiveBySlug(slug);
    if (!dbStore) {
      throw new AppError(
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND,
        'Không tìm thấy cửa hàng hoặc cửa hàng hiện không hoạt động'
      );
    }

    const catalog = await this.catalogService.getProducts({
      store: dbStore.slug,
      page: params?.page || 1,
      limit: params?.limit || 20,
      q: params?.q,
      sort: params?.sort,
    });

    return {
      store: mapDbStore(dbStore),
      products: catalog.products,
      meta: catalog.meta,
    };
  }

  async submitSellerRequest(userId: string, input: CreateSellerRequestInput): Promise<SellerRequest> {
    const existingStore = await this.storeRepo.findByOwnerUserId(userId);
    if (existingStore) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT_RESOURCE_EXISTS,
        'Tài khoản của bạn đã sở hữu một cửa hàng đang hoạt động'
      );
    }

    const pendingRequest = await this.sellerRequestRepo.findPendingByUserId(userId);
    if (pendingRequest) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT_RESOURCE_EXISTS,
        'Bạn đang có một yêu cầu mở cửa hàng ở trạng thái chờ duyệt'
      );
    }

    const normalizedSlug = input.storeSlug.trim().toLowerCase();
    const [existingSlugStore, existingPendingSlug] = await Promise.all([
      this.storeRepo.findBySlug(normalizedSlug),
      this.sellerRequestRepo.findPendingBySlug(normalizedSlug),
    ]);

    if (existingSlugStore || existingPendingSlug) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT_RESOURCE_EXISTS,
        'Đường dẫn (slug) cửa hàng này đã được sử dụng hoặc đang chờ duyệt'
      );
    }

    const created = await this.sellerRequestRepo.create({
      id: crypto.randomUUID(),
      userId,
      storeName: input.storeName,
      storeSlug: normalizedSlug,
      storeDescription: input.storeDescription || null,
      phone: input.phone || null,
      businessEmail: input.businessEmail || null,
    });

    return mapDbSellerRequest(created);
  }

  async getMySellerRequests(userId: string): Promise<{ store: Store | null; requests: SellerRequest[] }> {
    const [dbStore, dbRequests] = await Promise.all([
      this.storeRepo.findByOwnerUserId(userId),
      this.sellerRequestRepo.findByUserId(userId),
    ]);

    return {
      store: dbStore ? mapDbStore(dbStore) : null,
      requests: dbRequests.map((r) => mapDbSellerRequest(r)),
    };
  }
}
