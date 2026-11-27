import wardsData from '../data/vn-wards-all.json';
import administrativeMeta from '../data/vn-administrative-meta.json';

export interface VnProvinceItem {
  code: number;
  name: string;
  division_type?: string;
  codename?: string;
}

export interface VnDistrictItem {
  code: number;
  name: string;
  division_type?: string;
  codename?: string;
  province_code: number;
}

export interface VnWardItem {
  code: number;
  name: string;
  division_type?: 'phường' | 'xã' | 'thị trấn' | 'đặc khu' | string;
  codename?: string;
  province_code: number;
  district_code?: number;
  district_name?: string;
}

/**
 * Danh mục 34 đơn vị hành chính cấp tỉnh hiện hành của Việt Nam
 * Căn cứ: Nghị quyết số 202/2025/QH15 của Quốc hội khóa XV thông qua ngày 12/06/2025
 * Vận hành theo mô hình chính quyền địa phương 2 cấp từ ngày 01/07/2025
 * Gồm: 6 Thành phố trực thuộc Trung ương và 28 Tỉnh
 */
export const VN_PROVINCES_34: VnProvinceItem[] = [
  // 6 Thành phố trực thuộc Trung ương
  { code: 1, name: 'Thành phố Hà Nội', division_type: 'thành phố trung ương' },
  { code: 79, name: 'Thành phố Hồ Chí Minh', division_type: 'thành phố trung ương' },
  { code: 31, name: 'Thành phố Hải Phòng', division_type: 'thành phố trung ương' },
  { code: 48, name: 'Thành phố Đà Nẵng', division_type: 'thành phố trung ương' },
  { code: 92, name: 'Thành phố Cần Thơ', division_type: 'thành phố trung ương' },
  { code: 46, name: 'Thành phố Huế', division_type: 'thành phố trung ương' },

  // 28 Tỉnh
  { code: 4, name: 'Tỉnh Cao Bằng', division_type: 'tỉnh' },
  { code: 12, name: 'Tỉnh Lai Châu', division_type: 'tỉnh' },
  { code: 11, name: 'Tỉnh Điện Biên', division_type: 'tỉnh' },
  { code: 14, name: 'Tỉnh Sơn La', division_type: 'tỉnh' },
  { code: 20, name: 'Tỉnh Lạng Sơn', division_type: 'tỉnh' },
  { code: 22, name: 'Tỉnh Quảng Ninh', division_type: 'tỉnh' },
  { code: 38, name: 'Tỉnh Thanh Hóa', division_type: 'tỉnh' },
  { code: 40, name: 'Tỉnh Nghệ An', division_type: 'tỉnh' },
  { code: 42, name: 'Tỉnh Hà Tĩnh', division_type: 'tỉnh' },
  { code: 8, name: 'Tỉnh Tuyên Quang', division_type: 'tỉnh' },
  { code: 10, name: 'Tỉnh Lào Cai', division_type: 'tỉnh' },
  { code: 19, name: 'Tỉnh Thái Nguyên', division_type: 'tỉnh' },
  { code: 25, name: 'Tỉnh Phú Thọ', division_type: 'tỉnh' },
  { code: 27, name: 'Tỉnh Bắc Ninh', division_type: 'tỉnh' },
  { code: 33, name: 'Tỉnh Hưng Yên', division_type: 'tỉnh' },
  { code: 37, name: 'Tỉnh Ninh Bình', division_type: 'tỉnh' },
  { code: 45, name: 'Tỉnh Quảng Trị', division_type: 'tỉnh' },
  { code: 51, name: 'Tỉnh Quảng Ngãi', division_type: 'tỉnh' },
  { code: 64, name: 'Tỉnh Gia Lai', division_type: 'tỉnh' },
  { code: 66, name: 'Tỉnh Đắk Lắk', division_type: 'tỉnh' },
  { code: 56, name: 'Tỉnh Khánh Hòa', division_type: 'tỉnh' },
  { code: 68, name: 'Tỉnh Lâm Đồng', division_type: 'tỉnh' },
  { code: 75, name: 'Tỉnh Đồng Nai', division_type: 'tỉnh' },
  { code: 72, name: 'Tỉnh Tây Ninh', division_type: 'tỉnh' },
  { code: 87, name: 'Tỉnh Đồng Tháp', division_type: 'tỉnh' },
  { code: 86, name: 'Tỉnh Vĩnh Long', division_type: 'tỉnh' },
  { code: 89, name: 'Tỉnh An Giang', division_type: 'tỉnh' },
  { code: 96, name: 'Tỉnh Cà Mau', division_type: 'tỉnh' },
];

/**
 * Fallback dataset alias - luôn đảm bảo mô hình 34 đơn vị hành chính cấp tỉnh
 */
export const VN_PROVINCES_FALLBACK: VnProvinceItem[] = VN_PROVINCES_34;

/**
 * Toàn bộ danh mục đơn vị hành chính cấp xã chính thức (Phường / Xã / Thị trấn / Đặc khu)
 * Căn cứ: Tổng cục Thống kê (GSO) & Quyết định số 19/2025/QĐ-TTg ngày 30/06/2025
 * Bao phủ 100% 34 tỉnh/thành phố trên cả nước:
 * - 1.200 Phường
 * - 4.583 Xã
 * - 343 Thị trấn
 * - 13 Đặc khu
 * Tổng cộng: 6.139 đơn vị
 */
export const VN_WARDS_BY_PROVINCE: Record<number, VnWardItem[]> =
  wardsData as unknown as Record<number, VnWardItem[]>;

/**
 * Tổng số đơn vị hành chính cấp xã chính thức trên toàn quốc
 */
export const VN_TOTAL_OFFLINE_WARDS_COUNT: number = Object.values(VN_WARDS_BY_PROVINCE).reduce(
  (acc, curr) => acc + curr.length,
  0
);

/**
 * Siêu dữ liệu hành chính chi tiết
 */
export const VN_ADMINISTRATIVE_META = administrativeMeta;

/**
 * Hỗ trợ tương thích ngược (Backward compatibility)
 */
export const VN_DISTRICTS_FALLBACK: Record<number, VnDistrictItem[]> = {};
export const VN_WARDS_FALLBACK: Record<number, VnWardItem[]> = {};
