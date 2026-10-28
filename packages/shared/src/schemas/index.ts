import { z } from 'zod';
import { PAYMENT_METHOD } from '../constants/index.js';

export const RegisterSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
  fullName: z.string().min(2, 'Họ và tên không được để trống'),
  phone: z.string().regex(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/, 'Số điện thoại không hợp lệ').optional().or(z.literal('')),
});

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
  q: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'popular']).default('newest'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ProductFilterQuery = z.infer<typeof ProductFilterQuerySchema>;
