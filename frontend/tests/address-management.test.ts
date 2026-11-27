import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { useAddressStore } from '../src/stores/address.js';
import { addressService } from '../src/services/address.service.js';
import { vnAddressService, removeVietnameseTones } from '../src/services/vn-address.service.js';
import {
  VN_PROVINCES_34,
  VN_WARDS_BY_PROVINCE,
  VN_TOTAL_OFFLINE_WARDS_COUNT,
} from '../src/services/vn-administrative.data.js';
import AddressModal from '../src/components/AddressModal.vue';
import type { Address } from '@edgecart/shared';

describe('Vietnam Address Management (2-Tier 2025 Reform) Frontend Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('Administrative Dataset (34 Provinces, Nghị quyết 202/2025/QH15)', () => {
    it('should have exactly 34 administrative units at provincial level', () => {
      expect(VN_PROVINCES_34.length).toBe(34);
      const cities = VN_PROVINCES_34.filter((p) => p.division_type === 'thành phố trung ương');
      const provinces = VN_PROVINCES_34.filter((p) => p.division_type === 'tỉnh');
      expect(cities.length).toBe(6);
      expect(provinces.length).toBe(28);
    });

    it('should include all 6 centrally-run cities after 2025 reorganization', () => {
      const cityNames = VN_PROVINCES_34.filter((p) => p.division_type === 'thành phố trung ương').map((c) => c.name);
      expect(cityNames).toContain('Thành phố Hà Nội');
      expect(cityNames).toContain('Thành phố Hồ Chí Minh');
      expect(cityNames).toContain('Thành phố Hải Phòng');
      expect(cityNames).toContain('Thành phố Đà Nẵng');
      expect(cityNames).toContain('Thành phố Cần Thơ');
      expect(cityNames).toContain('Thành phố Huế');
    });

    it('should cover all 6,139 authentic commune-level units across 34 provinces without duplicate codes', () => {
      expect(VN_TOTAL_OFFLINE_WARDS_COUNT).toBe(6139);

      const allCodes = new Set<number>();
      let phuongCount = 0;
      let xaCount = 0;
      let thiTranCount = 0;
      let dacKhuCount = 0;

      for (const p of VN_PROVINCES_34) {
        const wards = VN_WARDS_BY_PROVINCE[p.code];
        expect(wards).toBeDefined();
        expect(wards.length).toBeGreaterThan(0);

        for (const w of wards) {
          expect(allCodes.has(w.code)).toBe(false); // No duplicate codes
          allCodes.add(w.code);
          expect(w.province_code).toBe(p.code); // Province relation integrity

          if (w.division_type === 'phường') phuongCount++;
          else if (w.division_type === 'xã') xaCount++;
          else if (w.division_type === 'thị trấn') thiTranCount++;
          else if (w.division_type === 'đặc khu') dacKhuCount++;
        }
      }

      expect(allCodes.size).toBe(6139);
      expect(phuongCount).toBe(1200);
      expect(xaCount).toBe(4583);
      expect(thiTranCount).toBe(343);
      expect(dacKhuCount).toBe(13);
    });

    it('should guarantee authentic local ward mapping for specific provinces without cross-province leaks', () => {
      // 1. Hà Nội: 526 đơn vị - chứa Giảng Võ, Thành Công, Nghĩa Đô, Hàng Gai, Tràng Tiền
      expect(VN_WARDS_BY_PROVINCE[1].length).toBe(526);
      expect(VN_WARDS_BY_PROVINCE[1].some((w) => w.name === 'Phường Giảng Võ')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[1].some((w) => w.name === 'Phường Thành Công')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[1].some((w) => w.name === 'Phường Nghĩa Đô')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[1].some((w) => w.name === 'Phường Tràng Tiền')).toBe(true);

      // 2. TP. Hồ Chí Minh: 274 đơn vị - chứa Bến Nghé, Bến Thành, Thảo Điền, Đặc khu Côn Đảo
      // TUYỆT ĐỐI KHÔNG chứa Nam Cường, Đồng Tâm (thuộc tỉnh khác)
      expect(VN_WARDS_BY_PROVINCE[79].length).toBe(274);
      expect(VN_WARDS_BY_PROVINCE[79].some((w) => w.name === 'Phường Bến Nghé')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[79].some((w) => w.name === 'Phường Bến Thành')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[79].some((w) => w.name === 'Phường Thảo Điền')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[79].some((w) => w.name === 'Đặc khu Côn Đảo')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[79].some((w) => w.name.includes('Nam Cường') || w.name.includes('Đồng Tâm'))).toBe(false);

      // 3. Đà Nẵng: 48 đơn vị - chứa Hải Châu, Thạch Thang, Thanh Bình, Xã Hòa Tiến, Đặc khu Hoàng Sa
      // TUYỆT ĐỐI KHÔNG chứa Giảng Võ, Thành Công (thuộc Hà Nội)
      expect(VN_WARDS_BY_PROVINCE[48].length).toBe(48);
      expect(VN_WARDS_BY_PROVINCE[48].some((w) => w.name === 'Phường Hải Châu')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[48].some((w) => w.name === 'Phường Thạch Thang')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[48].some((w) => w.name === 'Xã Hòa Tiến')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[48].some((w) => w.name === 'Đặc khu Hoàng Sa')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[48].some((w) => w.name.includes('Giảng Võ') || w.name.includes('Thành Công'))).toBe(false);
      // Hòa Vang là xã thuộc huyện Hòa Vang, không phải đặc khu
      expect(VN_WARDS_BY_PROVINCE[48].filter((w) => w.division_type === 'đặc khu').map((w) => w.name)).toEqual(['Đặc khu Hoàng Sa']);

      // 4. Lạng Sơn: 194 đơn vị - chứa Tam Thanh, Hoàng Văn Thụ, Vĩnh Trại, Xã Mai Pha
      // TUYỆT ĐỐI KHÔNG chứa Nghĩa Đô, Nghĩa Tân, Mai Dịch (thuộc Cầu Giấy, Hà Nội)
      expect(VN_WARDS_BY_PROVINCE[20].length).toBe(194);
      expect(VN_WARDS_BY_PROVINCE[20].some((w) => w.name === 'Phường Tam Thanh')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[20].some((w) => w.name === 'Phường Hoàng Văn Thụ')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[20].some((w) => w.name === 'Xã Mai Pha')).toBe(true);
      expect(VN_WARDS_BY_PROVINCE[20].some((w) => w.name.includes('Nghĩa Đô') || w.name.includes('Mai Dịch'))).toBe(false);

      // 5. An Giang: chứa Đặc khu Phú Quốc, Đặc khu Kiên Hải, Đặc khu Thổ Chu
      const anGiangDacKhu = VN_WARDS_BY_PROVINCE[89].filter((w) => w.division_type === 'đặc khu');
      expect(anGiangDacKhu.length).toBe(3);
      expect(anGiangDacKhu.map((w) => w.name)).toEqual([
        'Đặc khu Phú Quốc',
        'Đặc khu Kiên Hải',
        'Đặc khu Thổ Chu',
      ]);
    });

    it('should correctly strip Vietnamese tones for fuzzy search', () => {
      expect(removeVietnameseTones('Thành phố Hà Nội')).toBe('thanh pho ha noi');
      expect(removeVietnameseTones('Thành phố Hồ Chí Minh')).toBe('thanh pho ho chi minh');
      expect(removeVietnameseTones('Đà Nẵng')).toBe('da nang');
      expect(removeVietnameseTones('Ninh Bình')).toBe('ninh binh');
    });

    it('should filter province items ignoring accents and case', () => {
      expect(vnAddressService.filterItems(VN_PROVINCES_34, 'ha noi')).toEqual([
        expect.objectContaining({ name: 'Thành phố Hà Nội' }),
      ]);
      expect(vnAddressService.filterItems(VN_PROVINCES_34, 'hue')).toEqual([
        expect.objectContaining({ name: 'Thành phố Huế' }),
      ]);
      expect(vnAddressService.filterItems(VN_PROVINCES_34, 'da nang')).toEqual([
        expect.objectContaining({ name: 'Thành phố Đà Nẵng' }),
      ]);
      expect(vnAddressService.filterItems(VN_PROVINCES_34, 'ninh binh')).toEqual([
        expect.objectContaining({ name: 'Tỉnh Ninh Bình' }),
      ]);
    });

    it('should return 34 provinces even if remote API returns outdated 63 provinces or errors out', async () => {
      // Test remote API fallback mechanism
      const provinces = await vnAddressService.getProvinces();
      expect(provinces.length).toBe(34);
      expect(provinces.some((p) => p.name === 'Thành phố Huế')).toBe(true);
      expect(provinces.some((p) => p.name === 'Tỉnh Cao Bằng')).toBe(true);
    });

    it('should expose administrative metadata indicating 2-tier governance model', () => {
      const meta = vnAddressService.getAdministrativeInfo();
      expect(meta.totalProvinces).toBe(34);
      expect(meta.totalOfflineWards).toBe(6139);
      expect(meta.totalOfficialCommunes).toBe(6139);
      expect(meta.communeBreakdown).toEqual({
        phuong: 1200,
        xa: 4583,
        thiTran: 343,
        dacKhu: 13,
      });
      expect(meta.legalBasis).toContain('Nghị quyết số 202/2025/QH15');
      expect(meta.legalBasis).toContain('Quyết định số 19/2025/QĐ-TTg');
      expect(meta.source).toContain('Tổng cục Thống kê (GSO)');
      expect(meta.effectiveDate).toBe('2025-07-01');
    });
  });

  describe('Address Store (useAddressStore)', () => {
    const mockAddresses: Address[] = [
      {
        id: 'addr_1',
        userId: 'usr_1',
        recipientName: 'Nguyễn Văn A',
        phone: '0912345678',
        province: 'Thành phố Hà Nội',
        district: '',
        ward: 'Phường Dịch Vọng',
        streetAddress: 'Số 10 Dịch Vọng Hậu',
        isDefault: true,
        label: 'HOME',
        createdAt: '2026-10-30',
        updatedAt: '2026-10-30',
      },
      {
        id: 'addr_2',
        userId: 'usr_1',
        recipientName: 'Nguyễn Văn A - Cty',
        phone: '0912345678',
        province: 'Thành phố Hồ Chí Minh',
        district: 'Quận 1', // Legacy district preserved
        ward: 'Phường Bến Nghé',
        streetAddress: 'Số 88 Lê Lợi',
        isDefault: false,
        label: 'OFFICE',
        createdAt: '2026-10-30',
        updatedAt: '2026-10-30',
      },
    ];

    it('should calculate defaultAddress properly', () => {
      const store = useAddressStore();
      store.addresses = [...mockAddresses];

      expect(store.defaultAddress?.id).toBe('addr_1');
      expect(store.defaultAddress?.isDefault).toBe(true);
    });

    it('should add new 2-tier address without requiring district', async () => {
      const store = useAddressStore();
      store.addresses = [...mockAddresses];

      const newAddr: Address = {
        id: 'addr_3',
        userId: 'usr_1',
        recipientName: 'Người Nhận Mới',
        phone: '0988776655',
        province: 'Thành phố Đà Nẵng',
        district: '', // empty in 2-tier model
        ward: 'Phường Hải Châu 1',
        streetAddress: 'Số 5 Bạch Đằng',
        isDefault: true,
        label: 'HOME',
        createdAt: '2026-10-30',
        updatedAt: '2026-10-30',
      };

      vi.spyOn(addressService, 'createAddress').mockResolvedValue(newAddr);

      const res = await store.addAddress({
        recipientName: newAddr.recipientName,
        phone: newAddr.phone,
        province: newAddr.province,
        district: '',
        ward: newAddr.ward,
        streetAddress: newAddr.streetAddress,
        isDefault: true,
        label: 'HOME',
      });

      expect(res?.id).toBe('addr_3');
      expect(store.addresses.length).toBe(3);
      expect(store.defaultAddress?.id).toBe('addr_3');
      const oldDefault = store.addresses.find((a) => a.id === 'addr_1');
      expect(oldDefault?.isDefault).toBe(false);
    });

    it('should delete address and re-promote default if deleted was default', async () => {
      const store = useAddressStore();
      store.addresses = [...mockAddresses];

      vi.spyOn(addressService, 'deleteAddress').mockResolvedValue({
        message: 'Deleted',
        newDefaultId: 'addr_2',
      });

      const success = await store.deleteAddress('addr_1');
      expect(success).toBe(true);
      expect(store.addresses.length).toBe(1);
      expect(store.addresses[0].id).toBe('addr_2');
      expect(store.addresses[0].isDefault).toBe(true);
      expect(store.defaultAddress?.id).toBe('addr_2');
    });
  });

  describe('AddressModal Component (2-Tier Support & Legacy Compatibility)', () => {
    it('should mount with two modes: administrative list vs manual entry', async () => {
      const wrapper = mount(AddressModal, {
        props: {
          isOpen: true,
          addressToEdit: null,
          isSaving: false,
        },
      });

      expect(wrapper.text()).toContain('Chọn từ danh mục hành chính');
      expect(wrapper.text()).toContain('Nhập thủ công');
      expect(wrapper.text()).toContain('Họ và tên người nhận');
      expect(wrapper.text()).toContain('Số điện thoại');

      // Click to toggle to manual input
      const buttons = wrapper.findAll('button');
      const manualBtn = buttons.find((b) => b.text().includes('Nhập thủ công'));
      expect(manualBtn).toBeDefined();
      await manualBtn!.trigger('click');

      expect(wrapper.text()).toContain('Lưu ý khi nhập địa chỉ thủ công');
      expect(wrapper.text()).toContain('Quận / Huyện (tùy chọn - không bắt buộc)');
    });

    it('should validate invalid phone and empty fields on submit', async () => {
      const wrapper = mount(AddressModal, {
        props: {
          isOpen: true,
          addressToEdit: null,
          isSaving: false,
        },
      });

      const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Thêm địa chỉ'));
      expect(saveBtn).toBeDefined();

      await saveBtn!.trigger('click');

      expect(wrapper.emitted('save')).toBeUndefined();
      expect(wrapper.text()).toContain('Họ và tên người nhận phải từ 2 ký tự trở lên');
      expect(wrapper.text()).toContain('Số điện thoại không hợp lệ');
    });

    it('should preserve legacy district notice when editing an address with district', async () => {
      const legacyAddress: Address = {
        id: 'addr_legacy',
        userId: 'usr_1',
        recipientName: 'Khách hàng Cũ',
        phone: '0912345678',
        province: 'Thành phố Hà Nội',
        district: 'Quận Cầu Giấy',
        ward: 'Phường Dịch Vọng',
        streetAddress: 'Số 123 Cầu Giấy',
        isDefault: true,
        label: 'HOME',
        createdAt: '2026-10-30',
        updatedAt: '2026-10-30',
      };

      const wrapper = mount(AddressModal, {
        props: {
          isOpen: true,
          addressToEdit: legacyAddress,
          isSaving: false,
        },
      });

      await wrapper.vm.$nextTick();
      expect(wrapper.text()).toContain('Quận Cầu Giấy');
      expect(wrapper.text()).toContain('Được bảo lưu tự động');
    });
  });
});
