import {
  VN_PROVINCES_34,
  VN_PROVINCES_FALLBACK,
  VN_WARDS_BY_PROVINCE,
  VN_TOTAL_OFFLINE_WARDS_COUNT,
  VN_DISTRICTS_FALLBACK,
  VN_WARDS_FALLBACK,
  type VnProvinceItem,
  type VnDistrictItem,
  type VnWardItem,
} from './vn-administrative.data.js';

const API_BASE = 'https://provinces.open-api.vn/api';
const TIMEOUT_MS = 10000;

// Memory cache for active session
let memoryProvincesCache: VnProvinceItem[] = [];
const memoryProvinceWardsCache = new Map<number, VnWardItem[]>();
const memoryDistrictsCache = new Map<number, VnDistrictItem[]>();
const memoryWardsCache = new Map<number, VnWardItem[]>();

// Lazy-loaded partitioned province modules via Vite code-splitting
const provinceWardsModules = import.meta.glob<VnWardItem[]>('../data/wards/*.json');

export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

async function fetchWithTimeout<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return (await response.json()) as T;
}

export const vnAddressService = {
  /**
   * Lấy danh mục 34 đơn vị hành chính cấp tỉnh hiện hành (Nghị quyết 202/2025/QH15)
   */
  async getProvinces(): Promise<VnProvinceItem[]> {
    if (memoryProvincesCache.length === 34) {
      return memoryProvincesCache;
    }

    // Try sessionStorage
    try {
      const stored = sessionStorage.getItem('ec_vn_provinces_v2');
      if (stored) {
        const parsed = JSON.parse(stored) as VnProvinceItem[];
        if (Array.isArray(parsed) && parsed.length === 34) {
          memoryProvincesCache = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignore storage errors
    }

    // Kiểm tra API bên ngoài
    try {
      const list = await fetchWithTimeout<VnProvinceItem[]>(`${API_BASE}/p/`);
      // Chỉ chấp nhận dữ liệu API nếu thực sự đã cập nhật theo mô hình 34 tỉnh/thành phố hiện hành
      if (Array.isArray(list) && list.length === 34) {
        memoryProvincesCache = list;
        try {
          sessionStorage.setItem('ec_vn_provinces_v2', JSON.stringify(list));
        } catch {}
        return list;
      } else if (Array.isArray(list) && list.length !== 34) {
        // Nguồn API bên ngoài vẫn dùng dữ liệu 63 tỉnh/thành phố cũ (chưa cập nhật sau 01/07/2025)
        // Hệ thống chủ động kích hoạt dataset ngoại tuyến chuẩn 34 đơn vị
        console.warn(
          `[vnAddressService] Provinces Open API trả về ${list.length} tỉnh/thành phố (dữ liệu theo mô hình cũ). Hệ thống chuyển sang sử dụng bộ dữ liệu 34 đơn vị hành chính hiện hành theo Nghị quyết 202/2025/QH15.`
        );
      }
    } catch {
      // Fallback khi lỗi mạng hoặc timeout
    }

    memoryProvincesCache = VN_PROVINCES_34;
    return VN_PROVINCES_34;
  },

  /**
   * Lấy danh sách Phường / Xã / Thị trấn trực tiếp theo Cấp Tỉnh (Mô hình 2 cấp: Tỉnh -> Xã)
   */
  async getWardsByProvince(provinceCode: number): Promise<VnWardItem[]> {
    if (!provinceCode) return [];

    if (memoryProvinceWardsCache.has(provinceCode)) {
      return memoryProvinceWardsCache.get(provinceCode)!;
    }

    const storageKey = `ec_vn_wards_p_${provinceCode}`;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as VnWardItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          memoryProvinceWardsCache.set(provinceCode, parsed);
          return parsed;
        }
      }
    } catch {}

    // 1. Lazy load partitioned JSON per province (optimal bundle size & memory)
    try {
      const moduleKey = `../data/wards/${provinceCode}.json`;
      if (provinceWardsModules[moduleKey]) {
        const mod: any = await provinceWardsModules[moduleKey]();
        const wards = mod.default || mod;
        if (Array.isArray(wards) && wards.length > 0) {
          memoryProvinceWardsCache.set(provinceCode, wards);
          try {
            sessionStorage.setItem(storageKey, JSON.stringify(wards));
          } catch {}
          return wards;
        }
      }
    } catch {
      // Fallback below
    }

    // 2. Fallback to aggregate offline dataset
    const wards = VN_WARDS_BY_PROVINCE[provinceCode] || [];
    memoryProvinceWardsCache.set(provinceCode, wards);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(wards));
    } catch {}
    return wards;
  },

  /**
   * Hỗ trợ tương thích ngược (Legacy District Lookup)
   * Trong mô hình 2 cấp, cấp quận/huyện không bắt buộc và trả về rỗng nếu không có dữ liệu
   */
  async getDistricts(provinceCode: number): Promise<VnDistrictItem[]> {
    if (!provinceCode) return [];
    if (memoryDistrictsCache.has(provinceCode)) {
      return memoryDistrictsCache.get(provinceCode)!;
    }

    const fallback = VN_DISTRICTS_FALLBACK[provinceCode] || [];
    memoryDistrictsCache.set(provinceCode, fallback);
    return fallback;
  },

  /**
   * Hỗ trợ tương thích ngược cho các lệnh gọi getWards theo districtCode cũ
   */
  async getWards(districtCode: number): Promise<VnWardItem[]> {
    if (!districtCode) return [];
    if (memoryWardsCache.has(districtCode)) {
      return memoryWardsCache.get(districtCode)!;
    }

    const fallback = VN_WARDS_FALLBACK[districtCode] || [];
    memoryWardsCache.set(districtCode, fallback);
    return fallback;
  },

  /**
   * Tìm kiếm thông minh không phân biệt dấu tiếng Việt và chữ hoa/thường
   */
  filterItems<T extends { name: string }>(items: T[], query: string): T[] {
    if (!query || !query.trim()) return items;
    const normalizedQuery = removeVietnameseTones(query);
    return items.filter((item) => removeVietnameseTones(item.name).includes(normalizedQuery));
  },

  /**
   * Thông tin siêu dữ liệu hành chính hiện hành
   */
  getAdministrativeInfo() {
    return {
      model: 'Chính quyền địa phương 2 cấp (Cấp Tỉnh -> Cấp Xã)',
      legalBasis:
        'Nghị quyết số 202/2025/QH15 của Quốc hội khóa XV & Quyết định số 19/2025/QĐ-TTg của Thủ tướng Chính phủ',
      source: 'Tổng cục Thống kê (GSO) & Open API Vietnam (provinces.open-api.vn)',
      effectiveDate: '2025-07-01',
      lastUpdated: '2026-11-05',
      totalProvinces: VN_PROVINCES_34.length,
      totalOfficialCommunes: VN_TOTAL_OFFLINE_WARDS_COUNT,
      totalOfflineWards: VN_TOTAL_OFFLINE_WARDS_COUNT,
      communeBreakdown: {
        phuong: 1200,
        xa: 4583,
        thiTran: 343,
        dacKhu: 13,
      },
    };
  },
};
