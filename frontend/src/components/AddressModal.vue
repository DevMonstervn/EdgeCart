<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Address, AddressInput } from '@edgecart/shared';
import { vnAddressService, removeVietnameseTones } from '../services/vn-address.service.js';
import type { VnProvinceItem, VnWardItem } from '../services/vn-administrative.data.js';
import {
  X,
  MapPin,
  Check,
  Search,
  ChevronDown,
  Info,
  Loader2,
  Home,
  Building2,
  Sparkles,
} from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  addressToEdit?: Address | null;
  isSaving?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', payload: AddressInput): void;
}>();

// Mode: 'administrative' (list selection) vs 'manual' (direct typing)
const inputMode = ref<'administrative' | 'manual'>('administrative');

// Form state
const recipientName = ref('');
const phone = ref('');
const streetAddress = ref('');
const isDefault = ref(false);
const label = ref('HOME');

// Administrative hierarchy selections (Mô hình 2 cấp: Tỉnh/Thành phố -> Phường/Xã/Thị trấn)
const selectedProvince = ref<VnProvinceItem | null>(null);
const selectedWard = ref<VnWardItem | null>(null);

// Manual inputs (used when inputMode === 'manual')
const manualProvince = ref('');
const manualDistrict = ref('');
const manualWard = ref('');

// Lists
const provinces = ref<VnProvinceItem[]>([]);
const wards = ref<VnWardItem[]>([]);

// Dropdown open states
const isProvinceDropdownOpen = ref(false);
const isWardDropdownOpen = ref(false);

// Dropdown search terms
const provinceSearch = ref('');
const wardSearch = ref('');

// Loading states for data fetching
const isLoadingProvinces = ref(false);
const isLoadingWards = ref(false);

// Errors
const errors = ref<Record<string, string>>({});

// Filtered lists based on search
const filteredProvinces = computed(() => {
  return vnAddressService.filterItems(provinces.value, provinceSearch.value);
});

const filteredWards = computed(() => {
  return vnAddressService.filterItems(wards.value, wardSearch.value);
});

async function loadProvinces() {
  if (provinces.value.length > 0) return;
  isLoadingProvinces.value = true;
  try {
    provinces.value = await vnAddressService.getProvinces();
  } finally {
    isLoadingProvinces.value = false;
  }
}

async function handleSelectProvince(p: VnProvinceItem) {
  selectedProvince.value = p;
  isProvinceDropdownOpen.value = false;
  provinceSearch.value = '';

  // Reset child ward
  selectedWard.value = null;
  wards.value = [];

  // Load wards directly by province (2-tier model)
  isLoadingWards.value = true;
  try {
    wards.value = await vnAddressService.getWardsByProvince(p.code);
  } finally {
    isLoadingWards.value = false;
  }
}

function handleSelectWard(w: VnWardItem) {
  selectedWard.value = w;
  isWardDropdownOpen.value = false;
  wardSearch.value = '';
}

function resetForm() {
  recipientName.value = '';
  phone.value = '';
  streetAddress.value = '';
  isDefault.value = false;
  label.value = 'HOME';
  inputMode.value = 'administrative';

  selectedProvince.value = null;
  selectedWard.value = null;
  wards.value = [];

  manualProvince.value = '';
  manualDistrict.value = '';
  manualWard.value = '';
  errors.value = {};
}

// Watch addressToEdit to prefill form when editing
watch(
  () => props.addressToEdit,
  async (addr) => {
    if (addr) {
      recipientName.value = addr.recipientName;
      phone.value = addr.phone;
      streetAddress.value = addr.streetAddress;
      isDefault.value = addr.isDefault;
      label.value = addr.label || 'HOME';

      await loadProvinces();

      // Find matching province in 34 provinces
      const matchedProvince = provinces.value.find(
        (p) =>
          removeVietnameseTones(p.name) === removeVietnameseTones(addr.province) ||
          p.name === addr.province ||
          removeVietnameseTones(p.name).includes(removeVietnameseTones(addr.province)) ||
          removeVietnameseTones(addr.province).includes(removeVietnameseTones(p.name))
      );

      if (matchedProvince) {
        inputMode.value = 'administrative';
        selectedProvince.value = matchedProvince;
        wards.value = await vnAddressService.getWardsByProvince(matchedProvince.code);

        const matchedWard = wards.value.find(
          (w) =>
            removeVietnameseTones(w.name) === removeVietnameseTones(addr.ward) ||
            w.name === addr.ward ||
            removeVietnameseTones(w.name).includes(removeVietnameseTones(addr.ward))
        );
        if (matchedWard) {
          selectedWard.value = matchedWard;
        } else if (addr.ward) {
          // Synthetic ward for custom/specific existing wards
          selectedWard.value = {
            code: 99999,
            name: addr.ward,
            province_code: matchedProvince.code,
            division_type: 'phường',
          };
        }
      } else {
        // Fallback to manual mode if not found in 34-province list
        inputMode.value = 'manual';
        manualProvince.value = addr.province;
        manualDistrict.value = addr.district || '';
        manualWard.value = addr.ward;
      }
    } else {
      resetForm();
      loadProvinces();
    }
  },
  { immediate: true }
);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      loadProvinces();
    }
  }
);

function validate(): boolean {
  errors.value = {};

  if (!recipientName.value.trim() || recipientName.value.trim().length < 2) {
    errors.value.recipientName = 'Họ và tên người nhận phải từ 2 ký tự trở lên';
  }

  const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
  if (!phone.value || !phoneRegex.test(phone.value.trim())) {
    errors.value.phone = 'Số điện thoại không hợp lệ (VD: 0912345678)';
  }

  if (inputMode.value === 'administrative') {
    if (!selectedProvince.value) {
      errors.value.province = 'Vui lòng chọn Tỉnh/Thành phố';
    }
    if (!selectedWard.value) {
      errors.value.ward = 'Vui lòng chọn Phường/Xã/Thị trấn';
    }
  } else {
    if (!manualProvince.value.trim()) {
      errors.value.province = 'Vui lòng nhập Tỉnh/Thành phố';
    }
    if (!manualWard.value.trim()) {
      errors.value.ward = 'Vui lòng nhập Phường/Xã/Thị trấn';
    }
  }

  if (!streetAddress.value.trim() || streetAddress.value.trim().length < 3) {
    errors.value.streetAddress = 'Địa chỉ chi tiết (số nhà, đường, thôn...) phải từ 3 ký tự trở lên';
  }

  return Object.keys(errors.value).length === 0;
}

function handleSubmit() {
  if (!validate()) return;

  const payloadProvince =
    inputMode.value === 'administrative'
      ? selectedProvince.value!.name
      : manualProvince.value.trim();

  // District is optional in the 2-tier administrative model (Tỉnh -> Xã)
  // Preserves existing legacy district if editing, or user manual input
  const payloadDistrict =
    inputMode.value === 'administrative'
      ? props.addressToEdit?.district || ''
      : manualDistrict.value.trim();

  const payloadWard =
    inputMode.value === 'administrative'
      ? selectedWard.value!.name
      : manualWard.value.trim();

  const payload: AddressInput = {
    recipientName: recipientName.value.trim(),
    phone: phone.value.trim(),
    province: payloadProvince,
    district: payloadDistrict,
    ward: payloadWard,
    streetAddress: streetAddress.value.trim(),
    isDefault: isDefault.value,
    label: label.value.trim() || 'HOME',
  };

  emit('save', payload);
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" @click="emit('close')" />

    <!-- Modal Content -->
    <div class="relative bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col z-10 animate-in fade-in zoom-in-95 duration-200">
      <!-- Modal Header -->
      <div class="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
            <MapPin class="w-5 h-5" />
          </div>
          <div>
            <h3 class="font-black text-slate-900 text-base sm:text-lg">
              {{ addressToEdit ? 'Chỉnh Sửa Địa Chỉ' : 'Thêm Địa Chỉ Nhận Hàng' }}
            </h3>
            <p class="text-[11px] text-slate-500">
              Mô hình chính quyền địa phương 2 cấp (34 Tỉnh/Thành phố &bull; Cấp Tỉnh &rarr; Cấp Xã)
            </p>
          </div>
        </div>
        <button
          type="button"
          @click="emit('close')"
          class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Modal Body (Scrollable) -->
      <div class="px-5 sm:px-6 py-4 overflow-y-auto flex-1 space-y-4">
        <!-- Input Mode Switcher -->
        <div class="p-1 bg-slate-100 rounded-2xl flex text-xs font-bold text-slate-600">
          <button
            type="button"
            @click="inputMode = 'administrative'"
            class="flex-1 py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
            :class="inputMode === 'administrative' ? 'bg-white text-brand-700 shadow-xs' : 'hover:text-slate-900'"
          >
            <Sparkles class="w-3.5 h-3.5" />
            <span>Chọn từ danh mục hành chính (34 Tỉnh/Thành)</span>
          </button>
          <button
            type="button"
            @click="inputMode = 'manual'"
            class="flex-1 py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
            :class="inputMode === 'manual' ? 'bg-white text-brand-700 shadow-xs' : 'hover:text-slate-900'"
          >
            <span>Nhập thủ công</span>
          </button>
        </div>

        <!-- Recipient & Phone Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">
              Họ và tên người nhận <span class="text-rose-500">*</span>
            </label>
            <input
              v-model="recipientName"
              type="text"
              placeholder="Nguyễn Văn A"
              class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-hidden transition"
              :class="errors.recipientName ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
            />
            <span v-if="errors.recipientName" class="text-[11px] text-rose-500 mt-0.5 block">
              {{ errors.recipientName }}
            </span>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">
              Số điện thoại <span class="text-rose-500">*</span>
            </label>
            <input
              v-model="phone"
              type="tel"
              placeholder="0912345678"
              class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-hidden transition"
              :class="errors.phone ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
            />
            <span v-if="errors.phone" class="text-[11px] text-rose-500 mt-0.5 block">
              {{ errors.phone }}
            </span>
          </div>
        </div>

        <!-- Administrative Selector Mode (2-Tier: Tỉnh/Thành -> Phường/Xã) -->
        <div v-if="inputMode === 'administrative'" class="space-y-3">
          <!-- Legacy District Notice if Editing an Old Address -->
          <div
            v-if="addressToEdit?.district"
            class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px] flex items-center gap-2"
          >
            <Info class="w-3.5 h-3.5 text-brand-600 shrink-0" />
            <span>
              Quận/Huyện đã lưu trước đây: <strong class="text-slate-900">{{ addressToEdit.district }}</strong> (Được bảo lưu tự động).
            </span>
          </div>

          <!-- 1. Province Dropdown -->
          <div class="relative">
            <div class="flex items-center justify-between mb-1">
              <label class="block text-xs font-bold text-slate-700">
                Tỉnh / Thành phố <span class="text-rose-500">*</span>
              </label>
              <span class="text-[10px] text-brand-600 font-semibold bg-brand-50 px-2 py-0.5 rounded-full">
                34 đơn vị hành chính
              </span>
            </div>
            <button
              type="button"
              @click="isProvinceDropdownOpen = !isProvinceDropdownOpen"
              class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs sm:text-sm flex items-center justify-between text-left focus:bg-white focus:outline-hidden transition cursor-pointer"
              :class="errors.province ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
            >
              <span :class="selectedProvince ? 'text-slate-900 font-semibold' : 'text-slate-400'">
                {{ selectedProvince ? selectedProvince.name : 'Chọn Tỉnh / Thành phố (34 tỉnh thành)' }}
              </span>
              <ChevronDown class="w-4 h-4 text-slate-400 transition-transform" :class="{ 'rotate-180': isProvinceDropdownOpen }" />
            </button>
            <span v-if="errors.province" class="text-[11px] text-rose-500 mt-0.5 block">
              {{ errors.province }}
            </span>

            <!-- Dropdown Popover with Search -->
            <div
              v-if="isProvinceDropdownOpen"
              class="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-2 max-h-60 overflow-hidden flex flex-col"
            >
              <div class="relative mb-1.5">
                <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  v-model="provinceSearch"
                  type="text"
                  placeholder="Tìm tỉnh, thành phố trong 34 đơn vị..."
                  class="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden"
                  autofocus
                />
              </div>

              <div class="overflow-y-auto flex-1 space-y-0.5 max-h-44">
                <div v-if="isLoadingProvinces" class="p-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 class="w-3.5 h-3.5 animate-spin" />
                  <span>Đang tải danh sách tỉnh thành...</span>
                </div>
                <div v-else-if="filteredProvinces.length === 0" class="p-3 text-center text-xs text-slate-400">
                  Không tìm thấy tỉnh / thành phố nào
                </div>
                <button
                  v-for="p in filteredProvinces"
                  :key="p.code"
                  type="button"
                  @click="handleSelectProvince(p)"
                  class="w-full px-3 py-2 rounded-xl text-left text-xs hover:bg-brand-50 hover:text-brand-700 flex items-center justify-between transition cursor-pointer"
                  :class="selectedProvince?.code === p.code ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-700'"
                >
                  <div class="flex items-center gap-2">
                    <span>{{ p.name }}</span>
                    <span v-if="p.division_type === 'thành phố trung ương'" class="text-[9px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-md font-medium">
                      TP Trung ương
                    </span>
                  </div>
                  <Check v-if="selectedProvince?.code === p.code" class="w-3.5 h-3.5 text-brand-600" />
                </button>
              </div>
            </div>
          </div>

          <!-- 2. Ward Dropdown (Directly under Province) -->
          <div class="relative">
            <div class="flex items-center justify-between mb-1">
              <label class="block text-xs font-bold text-slate-700">
                Phường / Xã / Thị trấn <span class="text-rose-500">*</span>
              </label>
              <span class="text-[10px] text-slate-400">
                Cấp xã trực thuộc tỉnh/thành
              </span>
            </div>
            <button
              type="button"
              @click="isWardDropdownOpen = !isWardDropdownOpen"
              :disabled="!selectedProvince"
              class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs sm:text-sm flex items-center justify-between text-left focus:bg-white focus:outline-hidden transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              :class="errors.ward ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
            >
              <span :class="selectedWard ? 'text-slate-900 font-semibold' : 'text-slate-400'">
                {{
                  !selectedProvince
                    ? 'Vui lòng chọn Tỉnh / Thành phố trước'
                    : selectedWard
                    ? selectedWard.name
                    : 'Chọn Phường / Xã / Thị trấn'
                }}
              </span>
              <ChevronDown class="w-4 h-4 text-slate-400 transition-transform" :class="{ 'rotate-180': isWardDropdownOpen }" />
            </button>
            <span v-if="errors.ward" class="text-[11px] text-rose-500 mt-0.5 block">
              {{ errors.ward }}
            </span>

            <!-- Dropdown Popover with Search -->
            <div
              v-if="isWardDropdownOpen && selectedProvince"
              class="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-2 max-h-60 overflow-hidden flex flex-col"
            >
              <div class="relative mb-1.5">
                <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  v-model="wardSearch"
                  type="text"
                  placeholder="Tìm kiếm phường, xã, thị trấn..."
                  class="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden"
                  autofocus
                />
              </div>

              <div class="overflow-y-auto flex-1 space-y-0.5 max-h-44">
                <div v-if="isLoadingWards" class="p-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 class="w-3.5 h-3.5 animate-spin" />
                  <span>Đang tải danh sách phường xã...</span>
                </div>
                <div v-else-if="filteredWards.length === 0" class="p-3 text-center text-xs text-slate-400">
                  Không tìm thấy phường / xã nào
                </div>
                <button
                  v-for="w in filteredWards"
                  :key="w.code"
                  type="button"
                  @click="handleSelectWard(w)"
                  class="w-full px-3 py-2 rounded-xl text-left text-xs hover:bg-brand-50 hover:text-brand-700 flex items-center justify-between transition cursor-pointer"
                  :class="selectedWard?.code === w.code ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-700'"
                >
                  <span>{{ w.name }}</span>
                  <Check v-if="selectedWard?.code === w.code" class="w-3.5 h-3.5 text-brand-600" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Manual Input Mode -->
        <div v-else class="space-y-3">
          <div class="p-3 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-800 text-xs flex items-start gap-2">
            <Info class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p class="font-bold">Lưu ý khi nhập địa chỉ thủ công:</p>
              <p class="text-[11px] text-amber-700 mt-0.5">
                Vui lòng nhập chính xác Tỉnh/Thành phố, Phường/Xã để tránh gián đoạn hoặc thất lạc khi nhân viên bưu cục giao hàng.
              </p>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">
              Tỉnh / Thành phố <span class="text-rose-500">*</span>
            </label>
            <input
              v-model="manualProvince"
              type="text"
              placeholder="Ví dụ: Thành phố Hà Nội hoặc Tỉnh Ninh Bình"
              class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-hidden transition"
              :class="errors.province ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
            />
            <span v-if="errors.province" class="text-[11px] text-rose-500 mt-0.5 block">
              {{ errors.province }}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">
                Phường / Xã <span class="text-rose-500">*</span>
              </label>
              <input
                v-model="manualWard"
                type="text"
                placeholder="Ví dụ: Phường Dịch Vọng"
                class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-hidden transition"
                :class="errors.ward ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
              />
              <span v-if="errors.ward" class="text-[11px] text-rose-500 mt-0.5 block">
                {{ errors.ward }}
              </span>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">
                Quận / Huyện <span class="text-slate-400 font-normal">(tùy chọn - không bắt buộc)</span>
              </label>
              <input
                v-model="manualDistrict"
                type="text"
                placeholder="Ví dụ: Quận Cầu Giấy (nếu có)"
                class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-hidden transition"
              />
            </div>
          </div>
        </div>

        <!-- Street / Detail Address -->
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">
            Số nhà, tên đường, thôn/xóm hoặc địa chỉ chi tiết <span class="text-rose-500">*</span>
          </label>
          <textarea
            v-model="streetAddress"
            rows="2"
            placeholder="Ví dụ: Số 123 Đường Cầu Giấy, Ngõ 45, Tòa nhà EdgeCart Tower"
            class="w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-hidden transition resize-none"
            :class="errors.streetAddress ? 'border-rose-400' : 'border-slate-200 focus:border-brand-500'"
          />
          <span v-if="errors.streetAddress" class="text-[11px] text-rose-500 mt-0.5 block">
            {{ errors.streetAddress }}
          </span>
        </div>

        <!-- Label Selection (Nhà riêng vs Văn phòng) -->
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1.5">
            Loại địa chỉ
          </label>
          <div class="flex items-center gap-3">
            <button
              type="button"
              @click="label = 'HOME'"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer"
              :class="label === 'HOME' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'"
            >
              <Home class="w-3.5 h-3.5" />
              <span>Nhà riêng</span>
            </button>
            <button
              type="button"
              @click="label = 'OFFICE'"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer"
              :class="label === 'OFFICE' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'"
            >
              <Building2 class="w-3.5 h-3.5" />
              <span>Văn phòng / Công ty</span>
            </button>
          </div>
        </div>

        <!-- Default Checkbox -->
        <label class="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100/70 transition cursor-pointer select-none">
          <input
            v-model="isDefault"
            type="checkbox"
            class="w-4 h-4 text-brand-600 rounded-md border-slate-300 focus:ring-brand-500"
          />
          <div class="text-xs">
            <span class="font-bold text-slate-800">Đặt làm địa chỉ mặc định</span>
            <p class="text-[11px] text-slate-500">
              Hệ thống sẽ tự động ưu tiên địa chỉ này khi thanh toán đơn hàng mới
            </p>
          </div>
        </label>
      </div>

      <!-- Modal Footer -->
      <div class="px-5 sm:px-6 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50 rounded-b-3xl">
        <button
          type="button"
          @click="emit('close')"
          :disabled="isSaving"
          class="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
        >
          Hủy bỏ
        </button>
        <button
          type="button"
          @click="handleSubmit"
          :disabled="isSaving"
          class="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition shadow-sm hover:shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Loader2 v-if="isSaving" class="w-3.5 h-3.5 animate-spin" />
          <span>{{ addressToEdit ? 'Lưu thay đổi' : 'Thêm địa chỉ' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
