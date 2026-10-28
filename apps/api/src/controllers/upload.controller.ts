import { Hono } from 'hono';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ERROR_CODES,
  MAX_IMAGE_UPLOAD_BYTES,
  type AllowedImageMimeType,
} from '@edgecart/shared';
import { requireAuth, type AuthContextVariables } from '../middlewares/auth.js';
import { StoreRepository } from '../repositories/store.repo.js';
import { UserRepository } from '../repositories/user.repo.js';
import { ok, created, fail, handleServiceError } from '../utils/response.js';
import {
  UPLOAD_TOKEN_TTL_SECONDS,
  buildPublicMediaUrl,
  isValidR2Key,
  resolveValidatedImageSpec,
  signUploadToken,
  sniffImageMimeType,
  verifyUploadToken,
} from '../utils/r2-upload.js';
import type { Env } from '../types/env.js';

export const uploadRouter = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();

function extractRouteKey(path: string, marker: string): string {
  const idx = path.indexOf(marker);
  if (idx === -1) return '';
  try {
    return decodeURIComponent(path.slice(idx + marker.length)).replace(/^\/+/, '');
  } catch {
    return '';
  }
}

/**
 * 1. Issue a short-lived HMAC-SHA256 signed upload URL bound to R2 key, user, store, MIME & byte limit.
 *    Order of checks: Authentication -> RBAC & Store Active Status -> File Spec Validation.
 */
uploadRouter.post('/presigned-url', requireAuth(), async (c) => {
  const user = c.get('user');

  let r2KeyPrefix: string;
  let storeId: string | null = null;

  if (user.role === 'SUPER_ADMIN' || user.role === 'PRODUCT_MANAGER') {
    r2KeyPrefix = 'products';
  } else if (user.isSeller) {
    const storeRepo = new StoreRepository(c.env.DB);
    const store = await storeRepo.findByOwnerUserId(user.sub);
    if (!store) {
      return fail(c, 403, ERROR_CODES.SELLER_NOT_APPROVED, 'Không tìm thấy cửa hàng gắn với tài khoản của bạn');
    }
    if (store.status === 'SUSPENDED') {
      return fail(c, 403, ERROR_CODES.STORE_SUSPENDED, 'Cửa hàng của bạn đang bị tạm đình chỉ hoạt động');
    }
    if (store.status !== 'ACTIVE') {
      return fail(c, 403, ERROR_CODES.FORBIDDEN_ACCESS, 'Cửa hàng của bạn hiện không ở trạng thái hoạt động');
    }
    storeId = store.id;
    r2KeyPrefix = `stores/${store.id}`;
  } else {
    return fail(c, 403, ERROR_CODES.FORBIDDEN_ACCESS, 'Bạn không có quyền tải tệp lên hệ thống');
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await c.req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fail(c, 400, ERROR_CODES.BAD_REQUEST, 'Dữ liệu yêu cầu tải ảnh không hợp lệ');
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, 'Dữ liệu JSON yêu cầu tải ảnh không hợp lệ');
  }

  if (typeof body.fileName !== 'string' || body.fileName.trim().length === 0 || body.fileName.length > 255) {
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, 'Vui lòng cung cấp tên tệp ảnh hợp lệ (tối đa 255 ký tự)');
  }

  let declaredMime: AllowedImageMimeType | undefined;
  if (body.contentType !== undefined && body.contentType !== null && body.contentType !== '') {
    if (
      typeof body.contentType !== 'string' ||
      !(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(body.contentType)
    ) {
      return fail(
        c,
        400,
        ERROR_CODES.BAD_REQUEST,
        'Định dạng MIME không hợp lệ. Chỉ chấp nhận image/webp, image/png, image/jpeg hoặc image/avif'
      );
    }
    declaredMime = body.contentType as AllowedImageMimeType;
  }

  let declaredSize: number | undefined;
  if (body.fileSize !== undefined && body.fileSize !== null) {
    if (typeof body.fileSize !== 'number' || !Number.isFinite(body.fileSize)) {
      return fail(c, 400, ERROR_CODES.BAD_REQUEST, 'Dung lượng tệp phải là số nguyên dương (bytes)');
    }
    declaredSize = body.fileSize;
  }

  try {
    const spec = resolveValidatedImageSpec({
      fileName: body.fileName,
      contentType: declaredMime,
      fileSize: declaredSize,
    });

    const r2Key = `${r2KeyPrefix}/${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}.${spec.ext}`;
    const token = await signUploadToken(
      {
        sub: user.sub,
        storeId,
        r2Key,
        contentType: spec.contentType,
        maxBytes: spec.maxBytes,
        expectedSize: spec.expectedSize,
      },
      c.env.JWT_SECRET,
      UPLOAD_TOKEN_TTL_SECONDS
    );

    const origin = new URL(c.req.url).origin;
    const uploadUrl = `${origin}/api/v1/uploads/direct/${r2Key}?token=${encodeURIComponent(token)}`;
    const publicUrl = buildPublicMediaUrl(c.req.url, r2Key, c.env.R2_PUBLIC_BASE_URL);

    return ok(c, {
      uploadUrl,
      publicUrl,
      r2Key,
      contentType: spec.contentType,
      maxSizeBytes: MAX_IMAGE_UPLOAD_BYTES,
      expiresIn: UPLOAD_TOKEN_TTL_SECONDS,
    });
  } catch (err: unknown) {
    return handleServiceError(c, err, 'Không thể khởi tạo phiên tải ảnh lên R2');
  }
});

/**
 * 2. Direct binary upload to Cloudflare R2 via native Worker R2Bucket binding.
 *    Verifies HMAC upload token, live user/store status, size cap, Content-Type, and binary magic bytes.
 */
uploadRouter.put('/direct/*', async (c) => {
  const r2Key = extractRouteKey(c.req.path, '/uploads/direct/');
  if (!isValidR2Key(r2Key)) {
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, 'Khóa lưu trữ tệp ảnh không hợp lệ');
  }

  const token = c.req.query('token');
  if (!token) {
    return fail(c, 401, ERROR_CODES.AUTH_UNAUTHORIZED, 'Thiếu chữ ký xác thực phiên tải ảnh');
  }

  const verified = await verifyUploadToken(token, c.env.JWT_SECRET);
  if (verified.expired) {
    return fail(c, 401, ERROR_CODES.AUTH_TOKEN_EXPIRED, 'Phiên tải ảnh đã hết hạn. Vui lòng thử lại');
  }
  if (!verified.payload) {
    return fail(c, 401, ERROR_CODES.AUTH_UNAUTHORIZED, 'Chữ ký xác thực tải ảnh không hợp lệ');
  }

  const tokenPayload = verified.payload;
  if (tokenPayload.r2Key !== r2Key) {
    return fail(c, 403, ERROR_CODES.FORBIDDEN_ACCESS, 'Chữ ký tải ảnh không khớp với đường dẫn lưu trữ');
  }

  // Re-verify live account & store status before writing to R2
  if (c.env.KV) {
    const revoked = await c.env.KV.get(`revoked_user:${tokenPayload.sub}`);
    if (revoked) {
      return fail(c, 403, ERROR_CODES.ACCOUNT_LOCKED, 'Tài khoản của bạn đã bị khóa');
    }
  }

  const userRepo = new UserRepository(c.env.DB);
  const dbUser = await userRepo.findById(tokenPayload.sub);
  if (!dbUser || dbUser.status !== 'ACTIVE') {
    return fail(c, 403, ERROR_CODES.ACCOUNT_LOCKED, 'Tài khoản không còn hoạt động');
  }

  if (tokenPayload.storeId) {
    if (dbUser.is_seller !== 1) {
      return fail(c, 403, ERROR_CODES.SELLER_NOT_APPROVED, 'Quyền người bán của bạn không còn hiệu lực');
    }
    const storeRepo = new StoreRepository(c.env.DB);
    const store = await storeRepo.findById(tokenPayload.storeId);
    if (!store || store.owner_user_id !== dbUser.id) {
      return fail(c, 403, ERROR_CODES.FORBIDDEN_ACCESS, 'Không có quyền tải ảnh vào cửa hàng này');
    }
    if (store.status === 'SUSPENDED') {
      return fail(c, 403, ERROR_CODES.STORE_SUSPENDED, 'Cửa hàng của bạn đang bị tạm đình chỉ hoạt động');
    }
    if (store.status !== 'ACTIVE') {
      return fail(c, 403, ERROR_CODES.FORBIDDEN_ACCESS, 'Cửa hàng hiện không ở trạng thái hoạt động');
    }
  } else if (dbUser.role !== 'SUPER_ADMIN' && dbUser.role !== 'PRODUCT_MANAGER') {
    return fail(c, 403, ERROR_CODES.FORBIDDEN_ACCESS, 'Bạn không có quyền tải ảnh sản phẩm hệ thống');
  }

  const headerContentType = c.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (
    headerContentType &&
    headerContentType !== 'application/octet-stream' &&
    headerContentType !== tokenPayload.contentType
  ) {
    return fail(
      c,
      400,
      ERROR_CODES.BAD_REQUEST,
      `Header Content-Type (${headerContentType}) không khớp định dạng đã cấp phép (${tokenPayload.contentType})`
    );
  }

  const contentLengthHeader = c.req.header('Content-Length');
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_UPLOAD_BYTES) {
      return fail(c, 400, ERROR_CODES.BAD_REQUEST, 'Dung lượng tệp ảnh vượt quá giới hạn tối đa 5 MB');
    }
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await c.req.arrayBuffer();
  } catch {
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, 'Không thể đọc dữ liệu nhị phân của tệp ảnh');
  }

  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.byteLength === 0) {
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, 'Tệp ảnh tải lên không được rỗng');
  }
  if (bytes.byteLength > MAX_IMAGE_UPLOAD_BYTES || bytes.byteLength > tokenPayload.maxBytes) {
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, 'Dung lượng tệp ảnh vượt quá giới hạn cho phép (tối đa 5 MB)');
  }
  if (tokenPayload.expectedSize !== null && bytes.byteLength !== tokenPayload.expectedSize) {
    return fail(
      c,
      400,
      ERROR_CODES.BAD_REQUEST,
      'Dung lượng tệp tải lên không khớp với dung lượng đã khai báo khi khởi tạo'
    );
  }

  const detectedMime = sniffImageMimeType(bytes);
  if (!detectedMime || detectedMime !== tokenPayload.contentType) {
    return fail(
      c,
      400,
      ERROR_CODES.BAD_REQUEST,
      'Nội dung tệp nhị phân không hợp lệ hoặc không khớp định dạng ảnh đã khai báo'
    );
  }

  if (!c.env.R2 || typeof c.env.R2.put !== 'function') {
    return fail(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Kho lưu trữ ảnh Cloudflare R2 hiện chưa sẵn sàng');
  }

  try {
    await c.env.R2.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: tokenPayload.contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        uploadedBy: tokenPayload.sub,
        ...(tokenPayload.storeId ? { storeId: tokenPayload.storeId } : {}),
      },
    });
  } catch {
    return fail(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Không thể lưu tệp ảnh lên Cloudflare R2. Vui lòng thử lại');
  }

  const imageUrl = buildPublicMediaUrl(c.req.url, r2Key, c.env.R2_PUBLIC_BASE_URL);
  return created(c, {
    r2Key,
    imageUrl,
    contentType: tokenPayload.contentType,
    size: bytes.byteLength,
  });
});

/**
 * 3. Public read endpoint for R2 product/store images so browsers can load <img> tags
 *    without assuming an unverified custom CDN domain.
 */
uploadRouter.get('/files/*', async (c) => {
  const r2Key = extractRouteKey(c.req.path, '/uploads/files/');
  if (!isValidR2Key(r2Key)) {
    return fail(c, 400, ERROR_CODES.BAD_REQUEST, 'Đường dẫn tệp ảnh không hợp lệ');
  }

  if (!c.env.R2 || typeof c.env.R2.get !== 'function') {
    return fail(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Kho lưu trữ ảnh Cloudflare R2 hiện chưa sẵn sàng');
  }

  try {
    const object = await c.env.R2.get(r2Key);
    if (!object) {
      return fail(c, 404, ERROR_CODES.RESOURCE_NOT_FOUND, 'Không tìm thấy tệp ảnh');
    }

    const headers = new Headers();
    const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', object.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    if (object.httpEtag) {
      headers.set('ETag', object.httpEtag);
    }

    const bodyBuffer = await object.arrayBuffer();
    return new Response(bodyBuffer, {
      status: 200,
      headers,
    });
  } catch {
    return fail(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Không thể tải tệp ảnh từ Cloudflare R2');
  }
});
