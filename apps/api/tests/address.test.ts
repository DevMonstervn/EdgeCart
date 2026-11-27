import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createTestEnv } from './helpers/test-env.js';
import { signJwt } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/crypto.js';
import type { Env } from '../src/types/env.js';

describe('Vietnam Address Management API Integration Tests', () => {
  let env: Env;
  let userTokenA: string;
  let userTokenB: string;
  const userAId = 'usr_test_user_a';
  const userBId = 'usr_test_user_b';

  beforeEach(async () => {
    env = createTestEnv();

    const passHash = await hashPassword('Password123!');

    // Seed two test users
    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
      VALUES
        (?, 'user.a@edgecart.vn', ?, 'Nguyễn Văn A', '0912345678', 'CUSTOMER', 'ACTIVE'),
        (?, 'user.b@edgecart.vn', ?, 'Trần Thị B', '0987654321', 'CUSTOMER', 'ACTIVE');
    `)
      .bind(userAId, passHash, userBId, passHash)
      .run();

    userTokenA = await signJwt({ sub: userAId, email: 'user.a@edgecart.vn', role: 'CUSTOMER' }, env.JWT_SECRET, 86400);
    userTokenB = await signJwt({ sub: userBId, email: 'user.b@edgecart.vn', role: 'CUSTOMER' }, env.JWT_SECRET, 86400);
  });

  it('1. New user starts with empty address list (no sample or fake default addresses)', async () => {
    const res = await app.request('/api/v1/addresses', {
      method: 'GET',
      headers: { Authorization: `Bearer ${userTokenA}` },
    }, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('2. Creating first address automatically sets it as default', async () => {
    const res = await app.request('/api/v1/addresses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userTokenA}`,
      },
      body: JSON.stringify({
        recipientName: 'Nguyễn Văn A',
        phone: '0912345678',
        province: 'Thành phố Hà Nội',
        district: 'Quận Ba Đình',
        ward: 'Phường Điện Biên',
        streetAddress: 'Số 10 Chu Văn An',
        isDefault: false, // Even if false, first address becomes default
        label: 'HOME',
      }),
    }, env);

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.recipientName).toBe('Nguyễn Văn A');
    expect(body.data.province).toBe('Thành phố Hà Nội');
    expect(body.data.isDefault).toBe(true);
    expect(body.data.label).toBe('HOME');
  });

  it('3. Adding multiple addresses and switching default address works atomically', async () => {
    // Add address 1
    const res1 = await app.request('/api/v1/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({
        recipientName: 'Nguyễn Văn A - Nhà',
        phone: '0912345678',
        province: 'Thành phố Hà Nội',
        district: 'Quận Cầu Giấy',
        ward: 'Phường Dịch Vọng',
        streetAddress: 'Số 20 Trần Đăng Ninh',
        label: 'HOME',
      }),
    }, env);
    const addr1 = ((await res1.json()) as any).data;
    expect(addr1.isDefault).toBe(true);

    // Add address 2 with isDefault = true
    const res2 = await app.request('/api/v1/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({
        recipientName: 'Nguyễn Văn A - Công ty',
        phone: '0912345678',
        province: 'Thành phố Hồ Chí Minh',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        streetAddress: 'Số 50 Lê Lợi',
        isDefault: true,
        label: 'OFFICE',
      }),
    }, env);
    const addr2 = ((await res2.json()) as any).data;
    expect(addr2.isDefault).toBe(true);

    // Check list of addresses: exactly ONE is default (addr2)
    const listRes = await app.request('/api/v1/addresses', {
      method: 'GET',
      headers: { Authorization: `Bearer ${userTokenA}` },
    }, env);
    const listBody = (await listRes.json()) as any;
    expect(listBody.data.length).toBe(2);

    const defaultAddresses = listBody.data.filter((a: any) => a.isDefault === true);
    expect(defaultAddresses.length).toBe(1);
    expect(defaultAddresses[0].id).toBe(addr2.id);

    // Switch default back to addr1 via PATCH /:id/default
    const patchRes = await app.request(`/api/v1/addresses/${addr1.id}/default`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userTokenA}` },
    }, env);
    expect(patchRes.status).toBe(200);

    const updatedListRes = await app.request('/api/v1/addresses', {
      method: 'GET',
      headers: { Authorization: `Bearer ${userTokenA}` },
    }, env);
    const updatedList = ((await updatedListRes.json()) as any).data;
    const currentDefault = updatedList.find((a: any) => a.isDefault);
    expect(currentDefault.id).toBe(addr1.id);
  });

  it('4. Updating an address updates details properly', async () => {
    const createRes = await app.request('/api/v1/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({
        recipientName: 'Anh Long',
        phone: '0912345678',
        province: 'Thành phố Đà Nẵng',
        district: 'Quận Hải Châu',
        ward: 'Phường Hải Châu 1',
        streetAddress: 'Số 1 Bạch Đằng',
        label: 'HOME',
      }),
    }, env);
    const addr = ((await createRes.json()) as any).data;

    const updateRes = await app.request(`/api/v1/addresses/${addr.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({
        recipientName: 'Hoàng Long',
        phone: '0988776655',
        province: 'Thành phố Đà Nẵng',
        district: 'Quận Sơn Trà',
        ward: 'Phường An Hải Bắc',
        streetAddress: 'Số 99 Võ Nguyên Giáp',
        label: 'Văn phòng chi nhánh',
      }),
    }, env);

    expect(updateRes.status).toBe(200);
    const updated = ((await updateRes.json()) as any).data;
    expect(updated.recipientName).toBe('Hoàng Long');
    expect(updated.phone).toBe('0988776655');
    expect(updated.district).toBe('Quận Sơn Trà');
    expect(updated.ward).toBe('Phường An Hải Bắc');
    expect(updated.streetAddress).toBe('Số 99 Võ Nguyên Giáp');
    expect(updated.label).toBe('Văn phòng chi nhánh');
  });

  it('5. Deleting default address promotes remaining address to default', async () => {
    // Create address 1
    const res1 = await app.request('/api/v1/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({
        recipientName: 'Người nhận 1',
        phone: '0912345678',
        province: 'Hà Nội',
        district: 'Cầu Giấy',
        ward: 'Quan Hoa',
        streetAddress: 'Ngõ 50',
      }),
    }, env);
    const addr1 = ((await res1.json()) as any).data;

    // Create address 2
    const res2 = await app.request('/api/v1/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({
        recipientName: 'Người nhận 2',
        phone: '0912345678',
        province: 'TP.HCM',
        district: 'Quận 3',
        ward: 'Phường 1',
        streetAddress: 'Số 100',
        isDefault: false,
      }),
    }, env);
    const addr2 = ((await res2.json()) as any).data;

    expect(addr1.isDefault).toBe(true);
    expect(addr2.isDefault).toBe(false);

    // Delete addr1 (which is the default)
    const delRes = await app.request(`/api/v1/addresses/${addr1.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userTokenA}` },
    }, env);
    expect(delRes.status).toBe(200);

    // Now addr2 must be automatically promoted to default!
    const listRes = await app.request('/api/v1/addresses', {
      method: 'GET',
      headers: { Authorization: `Bearer ${userTokenA}` },
    }, env);
    const list = ((await listRes.json()) as any).data;
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(addr2.id);
    expect(list[0].isDefault).toBe(true);
  });

  it('6. IDOR Protection: User B cannot access, modify, or delete User A address', async () => {
    // User A creates an address
    const resA = await app.request('/api/v1/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({
        recipientName: 'User A Private Address',
        phone: '0912345678',
        province: 'Thành phố Hà Nội',
        district: 'Hoàn Kiếm',
        ward: 'Hàng Bạc',
        streetAddress: 'Số 12 Hàng Bạc',
      }),
    }, env);
    const addrA = ((await resA.json()) as any).data;

    // User B tries to update User A's address
    const updateRes = await app.request(`/api/v1/addresses/${addrA.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenB}` },
      body: JSON.stringify({
        recipientName: 'Hacker',
        phone: '0987654321',
        province: 'Hà Nội',
        district: 'Hoàn Kiếm',
        ward: 'Hàng Gai',
        streetAddress: 'Hacked Address',
      }),
    }, env);
    expect(updateRes.status).toBe(404);

    // User B tries to set User A's address as default
    const patchRes = await app.request(`/api/v1/addresses/${addrA.id}/default`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${userTokenB}` },
    }, env);
    expect(patchRes.status).toBe(404);

    // User B tries to delete User A's address
    const delRes = await app.request(`/api/v1/addresses/${addrA.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userTokenB}` },
    }, env);
    expect(delRes.status).toBe(404);

    // Verify User A's address is completely intact
    const verifyRes = await app.request('/api/v1/addresses', {
      method: 'GET',
      headers: { Authorization: `Bearer ${userTokenA}` },
    }, env);
    const listA = ((await verifyRes.json()) as any).data;
    expect(listA[0].recipientName).toBe('User A Private Address');
  });

  it('7. Historical order retains its shipping address snapshot even after user edits or deletes the address in address book', async () => {
    // 1. Seed product & variant for checkout
    await env.DB.prepare(`
      INSERT INTO categories (id, name, slug) VALUES ('cat_test', 'Test', 'test');
    `).run();
    await env.DB.prepare(`
      INSERT INTO products (id, category_id, name, slug, base_price, is_active)
      VALUES ('prd_t1', 'cat_test', 'Sản phẩm test', 'sp-test', 200000, 1);
    `).run();
    await env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES ('var_t1', 'prd_t1', 'SKU-T1', 'Mặc định', 200000, 10, 1);
    `).run();

    // 2. User A creates address
    const addrRes = await app.request('/api/v1/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({
        recipientName: 'Anh A - Giao Nhà Cũ',
        phone: '0912345678',
        province: 'Thành phố Cần Thơ',
        district: 'Quận Ninh Kiều',
        ward: 'Phường Tân An',
        streetAddress: 'Số 100 Đại Lộ Hòa Bình',
      }),
    }, env);
    const addr = ((await addrRes.json()) as any).data;

    // 3. User A adds item to cart & checkouts with this address
    await app.request('/api/v1/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({ variantId: 'var_t1', quantity: 1 }),
    }, env);

    const checkoutRes = await app.request('/api/v1/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({
        shippingAddress: {
          recipientName: addr.recipientName,
          phone: addr.phone,
          province: addr.province,
          district: addr.district,
          ward: addr.ward,
          streetAddress: addr.streetAddress,
        },
        paymentMethod: 'COD',
      }),
    }, env);
    expect(checkoutRes.status).toBe(201);
    const orderData = ((await checkoutRes.json()) as any).data;

    // 4. User A deletes the address from address book
    await app.request(`/api/v1/addresses/${addr.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userTokenA}` },
    }, env);

    // 5. Query order in database: verify order snapshot address is 100% intact!
    const orderRow = await env.DB.prepare('SELECT * FROM orders WHERE id = ?')
      .bind(orderData.orderId)
      .first<any>();

    expect(orderRow).not.toBeNull();
    expect(orderRow.shipping_name).toBe('Anh A - Giao Nhà Cũ');
    expect(orderRow.shipping_province).toBe('Thành phố Cần Thơ');
    expect(orderRow.shipping_district).toBe('Quận Ninh Kiều');
    expect(orderRow.shipping_ward).toBe('Phường Tân An');
    expect(orderRow.shipping_address).toBe('Số 100 Đại Lộ Hòa Bình');
  });

  it('8. Supports flexible address structure (district optional / empty)', async () => {
    const res = await app.request('/api/v1/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({
        recipientName: 'Đặc khu / Trực tiếp',
        phone: '0912345678',
        province: 'Tỉnh Đặc Biệt',
        district: '', // No district
        ward: 'Xã Đảo',
        streetAddress: 'Khu dân cư số 1',
      }),
    }, env);

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.province).toBe('Tỉnh Đặc Biệt');
    expect(body.data.ward).toBe('Xã Đảo');
  });

  it('9. Supports 2025 2-tier administrative model (Tỉnh/Thành phố -> Phường/Xã) in checkout and order snapshot', async () => {
    // 1. Seed product & variant for test
    await env.DB.prepare(`
      INSERT OR IGNORE INTO categories (id, name, slug) VALUES ('cat_test', 'Test', 'test');
    `).run();
    await env.DB.prepare(`
      INSERT OR IGNORE INTO products (id, category_id, name, slug, base_price, is_active)
      VALUES ('prd_t2', 'cat_test', 'Sản phẩm test 2', 'sp-test-2', 250000, 1);
    `).run();
    await env.DB.prepare(`
      INSERT OR IGNORE INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES ('var_t2', 'prd_t2', 'SKU-T2', 'Mặc định', 250000, 10, 1);
    `).run();

    // 2. Add 2-tier address in TP. Huế (new centrally-run city) with no district
    const addrRes = await app.request('/api/v1/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({
        recipientName: 'Nguyễn Cư Dân Huế',
        phone: '0912345678',
        province: 'Thành phố Huế',
        district: '', // 2-tier: direct Cấp Tỉnh -> Cấp Xã
        ward: 'Phường Vỹ Dạ',
        streetAddress: 'Số 15 Nguyễn Sinh Cung',
        label: 'HOME',
      }),
    }, env);

    expect(addrRes.status).toBe(201);
    const addr = ((await addrRes.json()) as any).data;
    expect(addr.province).toBe('Thành phố Huế');
    expect(addr.ward).toBe('Phường Vỹ Dạ');
    expect(addr.district).toBeFalsy(); // null or empty in 2-tier model

    // 3. Add product to cart & checkout with 2-tier address
    const cartRes = await app.request('/api/v1/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({ variantId: 'var_t2', quantity: 1 }),
    }, env);
    expect(cartRes.status).toBe(200);

    const checkoutRes = await app.request('/api/v1/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userTokenA}` },
      body: JSON.stringify({
        shippingAddress: {
          recipientName: addr.recipientName,
          phone: addr.phone,
          province: addr.province,
          district: addr.district || '',
          ward: addr.ward,
          streetAddress: addr.streetAddress,
        },
        paymentMethod: 'COD',
      }),
    }, env);

    expect(checkoutRes.status).toBe(201);
    const orderData = ((await checkoutRes.json()) as any).data;

    const orderRow = await env.DB.prepare('SELECT * FROM orders WHERE id = ?')
      .bind(orderData.orderId)
      .first<any>();

    expect(orderRow).not.toBeNull();
    expect(orderRow.shipping_name).toBe('Nguyễn Cư Dân Huế');
    expect(orderRow.shipping_province).toBe('Thành phố Huế');
    expect(orderRow.shipping_district).toBe('');
    expect(orderRow.shipping_ward).toBe('Phường Vỹ Dạ');
    expect(orderRow.shipping_address).toBe('Số 15 Nguyễn Sinh Cung');
  });
});
