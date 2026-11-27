import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Address, AddressInput } from '@edgecart/shared';
import { addressService } from '../services/address.service.js';
import { useAuthStore } from './auth.js';
import { useToastStore } from './toast.js';
import { extractErrorMessage } from '../services/api.js';

export const useAddressStore = defineStore('address', () => {
  const addresses = ref<Address[]>([]);
  const isLoading = ref<boolean>(false);
  const isSaving = ref<boolean>(false);

  const defaultAddress = computed<Address | null>(() => {
    if (addresses.value.length === 0) return null;
    return addresses.value.find((a) => a.isDefault) || addresses.value[0];
  });

  async function fetchAddresses() {
    const auth = useAuthStore();
    if (!auth.isAuthenticated) {
      addresses.value = [];
      return;
    }

    isLoading.value = true;
    try {
      addresses.value = await addressService.getAddresses();
    } catch (err: unknown) {
      // Keep empty if failed
    } finally {
      isLoading.value = false;
    }
  }

  async function addAddress(input: AddressInput): Promise<Address | null> {
    const toast = useToastStore();
    isSaving.value = true;
    try {
      const created = await addressService.createAddress(input);
      if (created.isDefault) {
        addresses.value.forEach((a) => (a.isDefault = false));
      }
      addresses.value.unshift(created);
      toast.success('Đã thêm địa chỉ giao hàng mới thành công!');
      return created;
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err));
      return null;
    } finally {
      isSaving.value = false;
    }
  }

  async function updateAddress(id: string, input: AddressInput): Promise<Address | null> {
    const toast = useToastStore();
    isSaving.value = true;
    try {
      const updated = await addressService.updateAddress(id, input);
      if (updated.isDefault) {
        addresses.value.forEach((a) => (a.isDefault = false));
      }
      const idx = addresses.value.findIndex((a) => a.id === id);
      if (idx !== -1) {
        addresses.value[idx] = updated;
      }
      toast.success('Đã cập nhật thông tin địa chỉ!');
      return updated;
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err));
      return null;
    } finally {
      isSaving.value = false;
    }
  }

  async function setDefault(id: string): Promise<boolean> {
    const toast = useToastStore();
    try {
      const updated = await addressService.setDefaultAddress(id);
      addresses.value.forEach((a) => (a.isDefault = a.id === id));
      const idx = addresses.value.findIndex((a) => a.id === id);
      if (idx !== -1) {
        addresses.value[idx] = updated;
      }
      toast.success('Đã thiết lập làm địa chỉ mặc định');
      return true;
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err));
      return false;
    }
  }

  async function deleteAddress(id: string): Promise<boolean> {
    const toast = useToastStore();
    try {
      const result = await addressService.deleteAddress(id);
      addresses.value = addresses.value.filter((a) => a.id !== id);
      if (result.newDefaultId) {
        const newDef = addresses.value.find((a) => a.id === result.newDefaultId);
        if (newDef) {
          newDef.isDefault = true;
        }
      }
      toast.success('Đã xóa địa chỉ thành công');
      return true;
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err));
      return false;
    }
  }

  return {
    addresses,
    isLoading,
    isSaving,
    defaultAddress,
    fetchAddresses,
    addAddress,
    updateAddress,
    setDefault,
    deleteAddress,
  };
});
