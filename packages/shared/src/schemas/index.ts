import { z } from 'zod';
import {
  USER_ROLES,
  USER_STATUS,
  STORE_STATUS,
  SELLER_REQUEST_STATUS,
  ORDER_STATUS,
  PAYMENT_METHOD,
  INVENTORY_LOG_TYPE,
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
} from '../constants/index.js';

const VIETNAM_PHONE_REGEX = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const RegisterSchema = z
  .object({
    email: z.string().email('Email không đúng định dạng'),
    password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
    fullName: z.string().min(2, 'Họ và tên không được để trống'),
    phone: z.string().regex(VIETNAM_PHONE_REGEX, 'Số điện thoại không hợp lệ').optional().or(z.literal('')),
  })
  .strict();

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token không được để trống'),
});

export const AddressSchema = z.object({
  recipientName: z.string().min(2, 'Tên người nhận không được để trống'),
  phone: z.string().regex(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/, 'Số điện thoại không hợp lệ'),
  province: z.string().min(1, 'Vui lòng chọn Tỉnh/Thành phố'),
  district: z.string().min(1, 'Vui lòng chọn Quận/Huyện'),
  ward: z.string().min(1, 'Vui lòng chọn Phường/Xã'),
  streetAddress: z.string().min(5, 'Địa chỉ chi tiết phải từ 5 ký tự trở lên'),
  isDefault: z.boolean().default(false),
});

export type AddressInput = z.infer<typeof AddressSchema>;

export const CartItemAddSchema = z.object({
  variantId: z.string().min(1, 'Mã biến thể không được để trống'),
  quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
});

export type CartItemAddInput = z.infer<typeof CartItemAddSchema>;

export const CartItemUpdateSchema = z.object({
  quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
});

export const CartMergeSchema = z.object({
  guestItems: z.array(
    z.object({
      variantId: z.string(),
      quantity: z.number().int().positive(),
    })
  ),
});

export const CheckoutSchema = z.object({
  shippingAddress: z.object({
    recipientName: z.string().min(2, 'Tên người nhận không được để trống'),
    phone: z.string().regex(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/, 'Số điện thoại không hợp lệ'),
    province: z.string().min(1, 'Tỉnh/Thành phố không được để trống'),
    district: z.string().min(1, 'Quận/Huyện không được để trống'),
    ward: z.string().min(1, 'Phường/Xã không được để trống'),
    streetAddress: z.string().min(5, 'Địa chỉ đường/phố không được để trống'),
  }),
  paymentMethod: z.enum([
    PAYMENT_METHOD.COD,
    PAYMENT_METHOD.VNPAY,
    PAYMENT_METHOD.MOMO,
    PAYMENT_METHOD.STRIPE,
    PAYMENT_METHOD.BANK_TRANSFER,
  ]),
  notes: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional(),
});

export type CheckoutInput = z.infer<typeof CheckoutSchema>;

export const ProductFilterQuerySchema = z.object({
  category: z.string().optional(),
  store: z.string().optional(),
  q: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'popular']).default('newest'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ProductFilterQuery = z.infer<typeof ProductFilterQuerySchema>;

export const CreateSellerRequestSchema = z
  .object({
    storeName: z.string().trim().min(2, 'Tên cửa hàng tối thiểu 2 ký tự').max(100, 'Tên cửa hàng tối đa 100 ký tự'),
    storeSlug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, 'Slug cửa hàng tối thiểu 2 ký tự')
      .max(100, 'Slug cửa hàng tối đa 100 ký tự')
      .regex(SLUG_REGEX, 'Slug chỉ gồm chữ thường, chữ số và dấu gạch ngang'),
    storeDescription: z.string().trim().max(1000, 'Mô tả cửa hàng tối đa 1000 ký tự').optional().or(z.literal('')),
    phone: z.string().regex(VIETNAM_PHONE_REGEX, 'Số điện thoại không hợp lệ').optional().or(z.literal('')),
    businessEmail: z.string().email('Email kinh doanh không đúng định dạng').optional().or(z.literal('')),
  })
  .strict();

export type CreateSellerRequestInput = z.infer<typeof CreateSellerRequestSchema>;

export const ReviewSellerRequestSchema = z
  .object({
    status: z.enum([SELLER_REQUEST_STATUS.APPROVED, SELLER_REQUEST_STATUS.REJECTED]),
    rejectionReason: z.string().trim().max(500, 'Lý do từ chối tối đa 500 ký tự').optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.status === SELLER_REQUEST_STATUS.REJECTED && (!val.rejectionReason || val.rejectionReason.length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectionReason'],
        message: 'Vui lòng nhập lý do từ chối (tối thiểu 3 ký tự)',
      });
    }
  });

export type ReviewSellerRequestInput = z.infer<typeof ReviewSellerRequestSchema>;

export const UpdateStoreSchema = z
  .object({
    name: z.string().trim().min(2, 'Tên cửa hàng tối thiểu 2 ký tự').max(100, 'Tên cửa hàng tối đa 100 ký tự').optional(),
    description: z.string().trim().max(1000, 'Mô tả cửa hàng tối đa 1000 ký tự').nullable().optional(),
    logoUrl: z.string().url('URL logo không hợp lệ').nullable().optional().or(z.literal('')),
    bannerUrl: z.string().url('URL ảnh bìa không hợp lệ').nullable().optional().or(z.literal('')),
    phone: z.string().regex(VIETNAM_PHONE_REGEX, 'Số điện thoại không hợp lệ').nullable().optional().or(z.literal('')),
    email: z.string().email('Email liên hệ không đúng định dạng').nullable().optional().or(z.literal('')),
  })
  .strict();

export type UpdateStoreInput = z.infer<typeof UpdateStoreSchema>;

export const ProductVariantInputSchema = z
  .object({
    sku: z.string().trim().min(2, 'SKU tối thiểu 2 ký tự').max(64, 'SKU tối đa 64 ký tự'),
    title: z.string().trim().min(1, 'Tên biến thể không được để trống').max(120),
    price: z.number().int().nonnegative('Giá bán không được âm'),
    compareAtPrice: z.number().int().nonnegative('Giá gốc không được âm').nullable().optional(),
    stockQuantity: z.number().int().nonnegative('Tồn kho không được âm'),
    option1Name: z.string().trim().max(50).nullable().optional(),
    option1Value: z.string().trim().max(50).nullable().optional(),
    option2Name: z.string().trim().max(50).nullable().optional(),
    option2Value: z.string().trim().max(50).nullable().optional(),
    weightGrams: z.number().nonnegative().nullable().optional(),
  })
  .strict();

export type ProductVariantInput = z.infer<typeof ProductVariantInputSchema>;

export const ProductImageInputSchema = z
  .object({
    imageUrl: z.string().trim().url('URL ảnh sản phẩm không hợp lệ').max(1000, 'URL ảnh tối đa 1000 ký tự'),
    r2Key: z.string().trim().min(3, 'Khóa đối tượng ảnh R2 không hợp lệ').max(500, 'Khóa đối tượng ảnh R2 tối đa 500 ký tự'),
    altText: z.string().trim().max(255, 'Mô tả ảnh tối đa 255 ký tự').nullable().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict();

export type ProductImageInput = z.infer<typeof ProductImageInputSchema>;

export const PresignedUploadRequestSchema = z
  .object({
    fileName: z.string().trim().min(1, 'Tên tệp ảnh không được để trống').max(255, 'Tên tệp ảnh tối đa 255 ký tự'),
    contentType: z
      .enum(ALLOWED_IMAGE_MIME_TYPES, {
        errorMap: () => ({ message: 'Chỉ chấp nhận định dạng ảnh WebP, PNG, JPEG hoặc AVIF' }),
      })
      .optional(),
    fileSize: z
      .number({ invalid_type_error: 'Dung lượng tệp không hợp lệ' })
      .int('Dung lượng tệp phải là số nguyên (bytes)')
      .positive('Dung lượng tệp phải lớn hơn 0 byte')
      .max(MAX_IMAGE_UPLOAD_BYTES, 'Dung lượng ảnh tối đa là 5 MB')
      .optional(),
  })
  .strict();

export type PresignedUploadRequestInput = z.infer<typeof PresignedUploadRequestSchema>;

export const SellerProductCreateSchema = z
  .object({
    categoryId: z.string().min(1, 'Danh mục sản phẩm không được để trống'),
    name: z.string().trim().min(2, 'Tên sản phẩm tối thiểu 2 ký tự').max(200),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, 'Slug sản phẩm tối thiểu 2 ký tự')
      .max(200)
      .regex(SLUG_REGEX, 'Slug chỉ gồm chữ thường, chữ số và dấu gạch ngang'),
    description: z.string().trim().max(2000).nullable().optional(),
    contentMarkdown: z.string().max(20000).nullable().optional(),
    basePrice: z.number().int().nonnegative('Giá cơ bản không được âm'),
    salePrice: z.number().int().nonnegative('Giá khuyến mãi không được âm').nullable().optional(),
    variants: z.array(ProductVariantInputSchema).min(1, 'Sản phẩm phải có ít nhất 1 biến thể'),
    images: z.array(ProductImageInputSchema).max(8, 'Tối đa 8 ảnh cho mỗi sản phẩm').optional(),
  })
  .strict();

export type SellerProductCreateInput = z.infer<typeof SellerProductCreateSchema>;

export const SellerProductUpdateSchema = z
  .object({
    categoryId: z.string().min(1, 'Danh mục sản phẩm không được để trống').optional(),
    name: z.string().trim().min(2, 'Tên sản phẩm tối thiểu 2 ký tự').max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    contentMarkdown: z.string().max(20000).nullable().optional(),
    basePrice: z.number().int().nonnegative('Giá cơ bản không được âm').optional(),
    salePrice: z.number().int().nonnegative('Giá khuyến mãi không được âm').nullable().optional(),
    isActive: z.boolean().optional(),
    images: z.array(ProductImageInputSchema).max(8, 'Tối đa 8 ảnh cho mỗi sản phẩm').optional(),
  })
  .strict();

export type SellerProductUpdateInput = z.infer<typeof SellerProductUpdateSchema>;

export const SellerInventoryAdjustSchema = z
  .object({
    variantId: z.string().min(1, 'Mã biến thể không được để trống'),
    changeQuantity: z.number().int().refine((v) => v !== 0, 'Số lượng điều chỉnh phải khác 0'),
    type: z.enum([
      INVENTORY_LOG_TYPE.MANUAL_IMPORT,
      INVENTORY_LOG_TYPE.MANUAL_ADJUST,
      INVENTORY_LOG_TYPE.DAMAGED_DISCARD,
    ]),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export type SellerInventoryAdjustInput = z.infer<typeof SellerInventoryAdjustSchema>;

export const UpdateOrderStatusSchema = z
  .object({
    status: z.enum([
      ORDER_STATUS.PENDING,
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.PROCESSING,
      ORDER_STATUS.SHIPPING,
      ORDER_STATUS.DELIVERED,
      ORDER_STATUS.CANCELLED,
      ORDER_STATUS.RETURNED,
    ]),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;

export const UpdateUserStatusSchema = z
  .object({
    status: z.enum([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE, USER_STATUS.BANNED]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type UpdateUserStatusInput = z.infer<typeof UpdateUserStatusSchema>;

export const UpdateUserRoleSchema = z
  .object({
    role: z.enum([USER_ROLES.CUSTOMER, USER_ROLES.PRODUCT_MANAGER, USER_ROLES.ORDER_OPERATOR]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleSchema>;

export const UpdateStoreStatusSchema = z
  .object({
    status: z.enum([STORE_STATUS.ACTIVE, STORE_STATUS.INACTIVE, STORE_STATUS.SUSPENDED]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type UpdateStoreStatusInput = z.infer<typeof UpdateStoreStatusSchema>;
