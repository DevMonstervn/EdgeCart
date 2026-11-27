import { AddressRepository, type DbAddress } from '../repositories/address.repo.js';
import type { Env } from '../types/env.js';
import type { Address, AddressInput } from '@edgecart/shared';

export class AddressService {
  private addressRepo: AddressRepository;

  constructor(private env: Env) {
    this.addressRepo = new AddressRepository(env.DB);
  }

  private mapDbToAddress(db: DbAddress): Address {
    return {
      id: db.id,
      userId: db.user_id,
      recipientName: db.recipient_name,
      phone: db.phone,
      province: db.province,
      district: db.district || null,
      ward: db.ward,
      streetAddress: db.street_address,
      isDefault: db.is_default === 1,
      label: db.label || 'HOME',
      createdAt: db.created_at,
      updatedAt: db.updated_at,
    };
  }

  async getAddresses(userId: string): Promise<Address[]> {
    const list = await this.addressRepo.listByUserId(userId);
    return list.map((a) => this.mapDbToAddress(a));
  }

  async getAddressById(userId: string, id: string): Promise<Address> {
    const found = await this.addressRepo.findByIdAndUserId(id, userId);
    if (!found) {
      throw new Error('Địa chỉ không tồn tại hoặc bạn không có quyền truy cập');
    }
    return this.mapDbToAddress(found);
  }

  async createAddress(userId: string, input: AddressInput): Promise<Address> {
    const id = `addr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const created = await this.addressRepo.create({
      id,
      userId,
      recipientName: input.recipientName.trim(),
      phone: input.phone.trim(),
      province: input.province.trim(),
      district: input.district?.trim() || '',
      ward: input.ward.trim(),
      streetAddress: input.streetAddress.trim(),
      isDefault: input.isDefault ? 1 : 0,
      label: input.label?.trim() || 'HOME',
    });

    return this.mapDbToAddress(created);
  }

  async updateAddress(userId: string, id: string, input: AddressInput): Promise<Address> {
    const existing = await this.addressRepo.findByIdAndUserId(id, userId);
    if (!existing) {
      throw new Error('Địa chỉ không tồn tại hoặc bạn không có quyền truy cập');
    }

    const updated = await this.addressRepo.update(id, userId, {
      recipientName: input.recipientName.trim(),
      phone: input.phone.trim(),
      province: input.province.trim(),
      district: input.district?.trim() || '',
      ward: input.ward.trim(),
      streetAddress: input.streetAddress.trim(),
      isDefault: input.isDefault ? 1 : 0,
      label: input.label?.trim() || 'HOME',
    });

    if (!updated) {
      throw new Error('Không thể cập nhật địa chỉ');
    }

    return this.mapDbToAddress(updated);
  }

  async setDefaultAddress(userId: string, id: string): Promise<Address> {
    const existing = await this.addressRepo.findByIdAndUserId(id, userId);
    if (!existing) {
      throw new Error('Địa chỉ không tồn tại hoặc bạn không có quyền truy cập');
    }

    const updated = await this.addressRepo.setDefault(id, userId);
    if (!updated) {
      throw new Error('Không thể đặt địa chỉ mặc định');
    }

    return this.mapDbToAddress(updated);
  }

  async deleteAddress(userId: string, id: string): Promise<{ success: boolean; newDefaultId?: string }> {
    const existing = await this.addressRepo.findByIdAndUserId(id, userId);
    if (!existing) {
      throw new Error('Địa chỉ không tồn tại hoặc bạn không có quyền truy cập');
    }

    return await this.addressRepo.delete(id, userId);
  }
}
