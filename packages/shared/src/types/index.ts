import type {
  UserRole,
  UserStatus,
  StoreStatus,
  SellerRequestStatus,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  AllowedImageMimeType,
} from '../constants/index.js';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  isSeller?: boolean;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoreSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  status: StoreStatus;
}

export interface Store {
  id: string;
  ownerUserId: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  status: StoreStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SellerRequest {
  id: string;
  userId: string;
  userEmail?: string;
  userFullName?: string;
  storeName: string;
  storeSlug: string;
  storeDescription?: string | null;
  phone?: string | null;
  businessEmail?: string | null;
  status: SellerRequestStatus;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLog {
  id: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: unknown;
  ipAddress?: string | null;
  createdAt: string;
}

export interface Address {
  id: string;
  userId: string;
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  streetAddress: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  parentId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
  children?: Category[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  barcode?: string | null;
  title: string;
  option1Name?: string | null;
  option1Value?: string | null;
  option2Name?: string | null;
  option2Value?: string | null;
  price: number;
  compareAtPrice?: number | null;
  stockQuantity: number;
  weightGrams?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  productId: string;
  variantId?: string | null;
  imageUrl: string;
  r2Key: string;
  altText?: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  publicUrl: string;
  r2Key: string;
  contentType: AllowedImageMimeType;
  maxSizeBytes: number;
  expiresIn: number;
}

export interface UploadedMediaObject {
  r2Key: string;
  imageUrl: string;
  contentType: AllowedImageMimeType;
  size: number;
}

export interface Product {
  id: string;
  categoryId: string;
  storeId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  contentMarkdown?: string | null;
  basePrice: number;
  salePrice?: number | null;
  isFeatured: boolean;
  isActive: boolean;
  category?: Category;
  store?: StoreSummary | null;
  variants?: ProductVariant[];
  images?: ProductImage[];
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: string;
  cartId: string;
  variantId: string;
  storeId?: string | null;
  storeName?: string | null;
  productName: string;
  variantTitle: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  currentStock: number;
  imageUrl?: string | null;
}

export interface Cart {
  id: string;
  userId?: string | null;
  sessionId?: string | null;
  items: CartItem[];
  subtotal: number;
  totalItems: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId: string;
  storeId?: string | null;
  productName: string;
  variantTitle: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  fulfillmentStatus?: OrderStatus;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId?: string | null;
  customerEmail: string;
  customerPhone: string;
  shippingName: string;
  shippingAddress: string;
  shippingProvince: string;
  shippingDistrict: string;
  shippingWard: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  shippingStatus: OrderStatus;
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  totalAmount: number;
  notes?: string | null;
  items?: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export * from './ai.js';
