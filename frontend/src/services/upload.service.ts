import axios from 'axios';
import { apiClient } from './api.js';
import type { ApiResponse } from '@edgecart/shared';

export interface PresignedUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  r2Key: string;
}

export const uploadService = {
  async getPresignedUrl(file: File): Promise<PresignedUrlResponse> {
    const res = await apiClient.post<ApiResponse<PresignedUrlResponse>>('/uploads/presigned-url', {
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
    });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error?.message || 'Không thể tạo URL tải lên');
    }
    return res.data.data;
  },

  async uploadDirectToR2(file: File): Promise<string> {
    const { uploadUrl, publicUrl } = await this.getPresignedUrl(file);

    // Direct PUT to Cloudflare R2 without passing through Worker CPU!
    await axios.put(uploadUrl, file, {
      headers: {
        'Content-Type': file.type,
      },
    });

    return publicUrl;
  },
};
