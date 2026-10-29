import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
  type AllowedImageMimeType,
  type ApiResponse,
  type PresignedUploadResponse,
  type UploadedMediaObject,
} from '@edgecart/shared';
import { apiClient, extractErrorMessage } from './api.js';

const EXTENSION_MIME_MAP: Record<string, AllowedImageMimeType> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
};

export function validateImageFileClient(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!file || typeof file.name !== 'string' || !file.name.trim()) {
    return 'Tên tệp ảnh không hợp lệ.';
  }

  if (file.size <= 0) {
    return `Tệp "${file.name}" đang rỗng (0 byte).`;
  }

  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return `Tệp "${file.name}" vượt quá giới hạn dung lượng tối đa 5 MB.`;
  }

  const dotIdx = file.name.lastIndexOf('.');
  const ext = dotIdx > 0 ? file.name.slice(dotIdx + 1).toLowerCase() : '';
  const expectedMime = EXTENSION_MIME_MAP[ext];
  if (!expectedMime) {
    return `Định dạng tệp "${file.name}" không được hỗ trợ. Chỉ chấp nhận WebP, PNG, JPG hoặc AVIF.`;
  }

  if (file.type) {
    if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      return `Kiểu tệp "${file.type}" không được hỗ trợ. Chỉ chấp nhận ảnh WebP, PNG, JPEG hoặc AVIF.`;
    }
    if (file.type !== expectedMime) {
      return `Phần mở rộng .${ext} của "${file.name}" không khớp với định dạng ${file.type}.`;
    }
  }

  return null;
}

export const uploadService = {
  async uploadImage(file: File, folder?: 'products' | 'stores' | 'avatars'): Promise<UploadedMediaObject> {
    const validationError = validateImageFileClient(file);
    if (validationError) {
      throw new Error(validationError);
    }

    const dotIdx = file.name.lastIndexOf('.');
    const ext = dotIdx > 0 ? file.name.slice(dotIdx + 1).toLowerCase() : '';
    const contentType = (file.type || EXTENSION_MIME_MAP[ext]) as AllowedImageMimeType;

    let presigned: PresignedUploadResponse;
    try {
      const res = await apiClient.post<ApiResponse<PresignedUploadResponse>>('/uploads/presigned-url', {
        fileName: file.name,
        contentType,
        fileSize: file.size,
        folder,
      });
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error?.message || 'Không thể khởi tạo phiên tải ảnh lên R2');
      }
      presigned = res.data.data;
    } catch (err) {
      throw new Error(extractErrorMessage(err));
    }

    let putResponse: Response;
    try {
      putResponse = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': presigned.contentType,
        },
        body: file,
      });
    } catch {
      throw new Error('Không thể kết nối tới kho lưu trữ ảnh R2. Vui lòng kiểm tra mạng và thử lại.');
    }

    if (!putResponse.ok) {
      let serverMsg = '';
      try {
        const errBody = (await putResponse.json()) as ApiResponse;
        serverMsg = errBody?.error?.message || '';
      } catch {
        // Ignore non-JSON error body
      }
      if (serverMsg) {
        throw new Error(serverMsg);
      }
      if (putResponse.status === 401 || putResponse.status === 403) {
        throw new Error('Phiên tải ảnh không hợp lệ hoặc bạn không có quyền tải ảnh lên.');
      }
      throw new Error('Lưu tệp ảnh lên Cloudflare R2 thất bại. Vui lòng thử lại.');
    }

    try {
      const putJson = (await putResponse.json()) as ApiResponse<UploadedMediaObject>;
      if (putJson?.success && putJson.data) {
        return putJson.data;
      }
    } catch {
      // Fallback when PUT endpoint returns empty 200/204 body
    }

    return {
      r2Key: presigned.r2Key,
      imageUrl: presigned.publicUrl,
      contentType: presigned.contentType,
      size: file.size,
    };
  },
};
