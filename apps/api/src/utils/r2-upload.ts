import {
  ERROR_CODES,
  MAX_IMAGE_UPLOAD_BYTES,
  type AllowedImageMimeType,
  type ProductImageInput,
} from '@edgecart/shared';
import { AppError } from './response.js';

export const UPLOAD_TOKEN_TTL_SECONDS = 300; // 5 minutes

export const EXTENSION_TO_MIME: Record<string, AllowedImageMimeType> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
};

const VALID_R2_KEY_REGEX = /^(products|stores\/[a-zA-Z0-9_-]+|avatars\/[a-zA-Z0-9_-]+)\/[a-zA-Z0-9_-]+\.(webp|png|jpg|jpeg|avif)$/;

export interface SignedUploadTokenPayload {
  purpose: 'r2_upload';
  sub: string;
  storeId: string | null;
  r2Key: string;
  contentType: AllowedImageMimeType;
  maxBytes: number;
  expectedSize: number | null;
  iat: number;
  exp: number;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeBytes(encoded: string): Uint8Array {
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isValidR2Key(r2Key: string): boolean {
  if (!r2Key || r2Key.includes('..') || r2Key.includes('\\')) {
    return false;
  }
  return VALID_R2_KEY_REGEX.test(r2Key);
}

export function resolveValidatedImageSpec(input: {
  fileName: string;
  contentType?: AllowedImageMimeType;
  fileSize?: number;
}): {
  ext: string;
  contentType: AllowedImageMimeType;
  maxBytes: number;
  expectedSize: number | null;
} {
  const trimmedName = input.fileName.trim();
  const lastDot = trimmedName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmedName.length - 1) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      'Tên tệp phải có phần mở rộng hợp lệ (.webp, .png, .jpg, .jpeg, .avif)'
    );
  }

  const rawExt = trimmedName.slice(lastDot + 1).toLowerCase();
  const expectedMime = EXTENSION_TO_MIME[rawExt];
  if (!expectedMime) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      'Định dạng tệp không được hỗ trợ. Chỉ chấp nhận ảnh .webp, .png, .jpg, .jpeg hoặc .avif'
    );
  }

  const resolvedMime = input.contentType ?? expectedMime;
  if (resolvedMime !== expectedMime) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `Phần mở rộng .${rawExt} không khớp với kiểu MIME ${resolvedMime}`
    );
  }

  if (input.fileSize !== undefined) {
    if (!Number.isInteger(input.fileSize) || input.fileSize <= 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, 'Dung lượng tệp ảnh phải lớn hơn 0 byte');
    }
    if (input.fileSize > MAX_IMAGE_UPLOAD_BYTES) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, 'Dung lượng tệp ảnh vượt quá giới hạn tối đa 5 MB');
    }
  }

  return {
    ext: rawExt,
    contentType: resolvedMime,
    maxBytes: input.fileSize ?? MAX_IMAGE_UPLOAD_BYTES,
    expectedSize: input.fileSize ?? null,
  };
}

export async function signUploadToken(
  payload: Omit<SignedUploadTokenPayload, 'purpose' | 'iat' | 'exp'>,
  secret: string,
  expiresInSeconds: number = UPLOAD_TOKEN_TTL_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SignedUploadTokenPayload = {
    ...payload,
    purpose: 'r2_upload',
    iat: now,
    exp: now + expiresInSeconds,
  };

  const enc = new TextEncoder();
  const encodedHeader = base64UrlEncodeBytes(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'R2UP' })));
  const encodedPayload = base64UrlEncodeBytes(enc.encode(JSON.stringify(fullPayload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
  const encodedSig = base64UrlEncodeBytes(new Uint8Array(sigBuf));

  return `${signingInput}.${encodedSig}`;
}

export async function verifyUploadToken(
  token: string,
  secret: string
): Promise<{ payload: SignedUploadTokenPayload | null; expired: boolean }> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { payload: null, expired: false };
  }

  const [encodedHeader, encodedPayload, encodedSig] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = base64UrlDecodeBytes(encodedSig);
    const sigArrayBuffer = sigBytes.buffer.slice(
      sigBytes.byteOffset,
      sigBytes.byteOffset + sigBytes.byteLength
    ) as ArrayBuffer;
    const isValid = await crypto.subtle.verify('HMAC', key, sigArrayBuffer, enc.encode(signingInput));
    if (!isValid) {
      return { payload: null, expired: false };
    }

    const decodedJson = new TextDecoder().decode(base64UrlDecodeBytes(encodedPayload));
    const parsed = JSON.parse(decodedJson) as SignedUploadTokenPayload;
    if (parsed.purpose !== 'r2_upload' || !parsed.r2Key || !parsed.sub || !parsed.contentType) {
      return { payload: null, expired: false };
    }

    const now = Math.floor(Date.now() / 1000);
    if (!parsed.exp || parsed.exp < now) {
      return { payload: null, expired: true };
    }

    return { payload: parsed, expired: false };
  } catch {
    return { payload: null, expired: false };
  }
}

export function sniffImageMimeType(bytes: Uint8Array): AllowedImageMimeType | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  // AVIF: ISO BMFF box "ftyp" at offset 4..7 with brand "avif" or "avis"
  if (
    bytes.byteLength >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const headerAscii = Array.from(bytes.subarray(8, Math.min(bytes.byteLength, 36)))
      .map((b) => String.fromCharCode(b))
      .join('');
    if (headerAscii.includes('avif') || headerAscii.includes('avis')) {
      return 'image/avif';
    }
  }

  return null;
}

export function buildPublicMediaUrl(reqUrl: string, r2Key: string, r2PublicBaseUrl?: string): string {
  const configuredBase = r2PublicBaseUrl?.trim().replace(/\/+$/, '');
  if (configuredBase && (configuredBase.startsWith('https://') || configuredBase.startsWith('http://'))) {
    return `${configuredBase}/${r2Key}`;
  }
  const origin = new URL(reqUrl).origin;
  return `${origin}/api/v1/uploads/files/${r2Key}`;
}

export function assertProductImagesOwnership(
  images: ProductImageInput[] | undefined,
  allowedPrefixes: string[]
): void {
  if (!images || images.length === 0) return;

  for (const img of images) {
    const r2Key = img.r2Key.trim();
    if (!isValidR2Key(r2Key)) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Khóa đối tượng ảnh R2 "${img.r2Key}" không hợp lệ`);
    }

    const isAllowed = allowedPrefixes.some((prefix) => r2Key.startsWith(prefix));
    if (!isAllowed) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN_ACCESS,
        'Bạn không có quyền gắn tệp ảnh R2 không thuộc phạm vi cửa hàng của mình'
      );
    }
  }
}
