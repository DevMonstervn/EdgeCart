import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEnv } from './helpers/test-env.js';
import { CatalogService } from '../src/services/catalog.service.js';
import { executeBusinessTool } from '../src/ai/tools/business-tools.js';
import { WorkersAIProvider } from '../src/ai/providers/workers-ai.provider.js';
import { GeminiProvider } from '../src/ai/providers/gemini.provider.js';
import { resolveCategorySlug, CANONICAL_CATEGORY_SLUGS } from '@edgecart/shared';
import { sanitizeLikeSearch, buildProductSearchConditions, preprocessSearchQuery } from '../src/repositories/product.repo.js';
import type { Env } from '../src/types/env.js';

describe('Vietnamese Product Search Normalization & Category Resolution (P1 Regression Tests)', () => {
  let env: Env;
  let catalogService: CatalogService;

  beforeEach(async () => {
    env = createTestEnv();
    catalogService = new CatalogService(env);

    // Seed the 4 canonical categories matching D1 Staging records
    await env.DB.prepare(`
      INSERT INTO categories (id, name, slug, description, sort_order, is_active)
      VALUES 
        ('c1', 'Thiết bị điện tử & Phụ kiện công nghệ', 'dien-tu-cong-nghe', 'Đồ công nghệ', 1, 1),
        ('c2', 'Phụ kiện máy tính & Bàn làm việc', 'phu-kien-may-tinh', 'Phụ kiện bàn làm việc', 2, 1),
        ('c3', 'Đồ gia dụng & Tiện ích cá nhân', 'gia-dung-tien-ich', 'Gia dụng tiện ích', 3, 1),
        ('c4', 'Balo, Túi & Phong cách sống', 'thoi-trang-phu-kien', 'Thời trang phụ kiện', 4, 1);
    `).run();

    // Seed products matching actual D1 Staging records
    await env.DB.prepare(`
      INSERT INTO products (id, category_id, name, slug, description, base_price, sale_price, is_featured, is_active)
      VALUES 
        ('p1', 'c1', 'Bàn phím cơ không dây EdgeKey K8', 'ban-phim-co-khong-day-edgekey-k8', 'Bàn phím cơ không dây 3 chế độ kết nối (Bluetooth 5.1, 2.4Ghz, Type-C), hotswap, pin 4000mAh.', 1250000, 1150000, 1, 1),
        ('p2', 'c1', 'Chuột không dây công thái học ProMouse M1', 'chuot-khong-day-cong-thai-hoc-promouse-m1', 'Chuột công thái học bảo vệ cổ tay, cảm biến quang học 4000 DPI, silent click yên tĩnh.', 650000, 590000, 1, 1),
        ('p3', 'c1', 'Tai nghe Bluetooth chống ồn chủ động ANC-X', 'tai-nghe-bluetooth-chong-on-anc-x', 'Tai nghe over-ear chống ồn chủ động Hybrid ANC 35dB, âm thanh Hi-Res, pin 50 giờ.', 1890000, 1690000, 1, 1),
        ('p4', 'c2', 'Giá đỡ laptop nhôm tản nhiệt StandPro', 'gia-do-laptop-nhom-tan-nhiet-standpro', 'Giá đỡ hợp kim nhôm nguyên khối, gấp gọn di động, tùy chỉnh 6 nấc độ cao.', 420000, 380000, 0, 1),
        ('p5', 'c2', 'Đèn bàn học chống cận bảo vệ mắt DeskGlow', 'den-ban-hoc-chong-can-deskglow', 'Đèn LED bảo vệ mắt chỉ số hoàn màu Ra>95, cảm ứng 3 chế độ sáng, hẹn giờ tắt.', 550000, 490000, 0, 1),
        ('p6', 'c2', 'Sổ tay bìa da cao cấp kẻ ngang Journal-01', 'so-tay-bia-da-cao-cap-journal-01', 'Sổ tay ghi chép bìa da PU chống nước, 200 trang giấy dowling 100gsm không lem mực.', 180000, 150000, 0, 1),
        ('p7', 'c3', 'Bình nước giữ nhiệt thép không gỉ ThermoPeak 800ml', 'binh-nuoc-giu-nhiet-thermopeak-800ml', 'Bình giữ nhiệt Inox 316 giữ nóng 12h, giữ lạnh 24h, dung tích 800ml thể thao.', 320000, 280000, 0, 1),
        ('p8', 'c4', 'Balo laptop chống nước đa năng UrbanShield 15.6 inch', 'balo-laptop-chong-nuoc-urbanshield-15-6', 'Balo đựng vừa laptop 15.6 inch, chất liệu vải Oxford chống thấm trượt nước, cổng sạc USB tích hợp.', 790000, 690000, 1, 1),
        ('p9', 'c3', 'Cốc giữ nhiệt cà phê có nắp đậy CoffeeGo 500ml', 'coc-giu-nhiet-ca-phe-coffeego-500ml', 'Cốc uống cà phê giữ nhiệt 500ml, nắp chống tràn có lỗ cắm ống hút, giữ hương vị thơm ngon 6h.', 250000, 220000, 0, 1),
        ('p10_inactive', 'c1', 'Tai nghe có dây cũ hỏng', 'tai-nghe-co-day-cu-hong', 'Tai nghe chống ồn đã ngừng kinh doanh', 100000, 50000, 0, 0);
    `).run();

    // Seed variants for stock count
    await env.DB.prepare(`
      INSERT INTO product_variants (id, product_id, sku, title, price, stock_quantity, is_active)
      VALUES 
        ('v1', 'p1', 'K8-01', 'Red Switch / Màu Đen', 1150000, 20, 1),
        ('v2', 'p2', 'PM-M1-BLK', 'Đen Nhám', 590000, 30, 1),
        ('v3', 'p3', 'ANC-01', 'Midnight Black', 1690000, 15, 1),
        ('v4', 'p4', 'SP-01', 'Giá đỡ StandPro', 380000, 40, 1),
        ('v5', 'p5', 'DG-01', 'Đèn DeskGlow', 490000, 25, 1),
        ('v6', 'p6', 'JN-01', 'Sổ Journal-01', 150000, 50, 1),
        ('v7', 'p7', 'TP-01', 'Bình ThermoPeak', 280000, 35, 1),
        ('v8', 'p8', 'US-01', 'Balo UrbanShield', 690000, 18, 1),
        ('v9', 'p9', 'CG-01', 'Cốc CoffeeGo', 220000, 45, 1),
        ('v10', 'p10_inactive', 'OLD-01', 'Tai nghe cũ', 50000, 0, 0);
    `).run();
  });

  // 1. "tai nghe chống ồn" must find "Tai nghe Bluetooth chống ồn chủ động ANC-X"
  it('1. "tai nghe chống ồn" finds "Tai nghe Bluetooth chống ồn chủ động ANC-X" despite intervening word "Bluetooth"', async () => {
    const res = await catalogService.getProducts({ q: 'tai nghe chống ồn' });
    expect(res.meta.total).toBe(1);
    expect(res.products).toHaveLength(1);
    expect(res.products[0].id).toBe('p3');
    expect(res.products[0].name).toBe('Tai nghe Bluetooth chống ồn chủ động ANC-X');

    // Also verify via executeBusinessTool
    const toolRes = await executeBusinessTool(
      'search_products',
      { query: 'tai nghe chống ồn' },
      { env }
    );
    expect(toolRes.productCards).toHaveLength(1);
    expect(toolRes.productCards![0].name).toBe('Tai nghe Bluetooth chống ồn chủ động ANC-X');
  });

  // 2. "đèn bàn" must find "Đèn bàn học chống cận bảo vệ mắt DeskGlow"
  it('2. "đèn bàn" finds "Đèn bàn học chống cận bảo vệ mắt DeskGlow" across non-ASCII Unicode case (đ vs Đ)', async () => {
    // Lowercase 'đ'
    const resLower = await catalogService.getProducts({ q: 'đèn bàn' });
    expect(resLower.meta.total).toBe(1);
    expect(resLower.products[0].id).toBe('p5');
    expect(resLower.products[0].name).toContain('Đèn bàn học');

    // Capitalized 'Đ'
    const resUpper = await catalogService.getProducts({ q: 'Đèn bàn' });
    expect(resUpper.meta.total).toBe(1);
    expect(resUpper.products[0].id).toBe('p5');
  });

  // 3. "chuột công thái học không dây" must find "Chuột không dây công thái học ProMouse M1"
  it('3. "chuột công thái học không dây" finds "Chuột không dây công thái học ProMouse M1" despite inverted word order', async () => {
    const res = await catalogService.getProducts({ q: 'chuột công thái học không dây' });
    expect(res.meta.total).toBe(1);
    expect(res.products[0].id).toBe('p2');
    expect(res.products[0].name).toBe('Chuột không dây công thái học ProMouse M1');
  });

  // 4. "chuot khong day" must find the corresponding unaccented product
  it('4. "chuot khong day" finds the corresponding unaccented product via slug fallback', async () => {
    const res = await catalogService.getProducts({ q: 'chuot khong day' });
    expect(res.meta.total).toBe(1);
    expect(res.products[0].id).toBe('p2');
    expect(res.products[0].name).toBe('Chuột không dây công thái học ProMouse M1');
  });

  // 5. "đồ công nghệ" must resolve to the correct canonical category
  it('5. "đồ công nghệ" resolves to canonical category "dien-tu-cong-nghe" and filters correctly', async () => {
    expect(resolveCategorySlug('đồ công nghệ')).toBe('dien-tu-cong-nghe');
    expect(resolveCategorySlug('do cong nghe')).toBe('dien-tu-cong-nghe');
    expect(resolveCategorySlug('ĐỒ CÔNG NGHỆ')).toBe('dien-tu-cong-nghe');

    const toolRes = await executeBusinessTool(
      'search_products',
      { query: 'chuột', category: 'đồ công nghệ' },
      { env }
    );
    expect(toolRes.productCards).toHaveLength(1);
    expect(toolRes.productCards![0].name).toContain('Chuột không dây');
  });

  // 6. "phụ kiện máy tính" must resolve to the correct canonical category
  it('6. "phụ kiện máy tính" resolves to canonical category "phu-kien-may-tinh"', async () => {
    expect(resolveCategorySlug('phụ kiện máy tính')).toBe('phu-kien-may-tinh');
    expect(resolveCategorySlug('phu kien may tinh')).toBe('phu-kien-may-tinh');
    expect(resolveCategorySlug('đồ gia dụng')).toBe('gia-dung-tien-ich');
    expect(resolveCategorySlug('thời trang')).toBe('thoi-trang-phu-kien');

    const toolRes = await executeBusinessTool(
      'search_products',
      { category: 'phụ kiện máy tính' },
      { env }
    );
    // Returns products in phu-kien-may-tinh: StandPro, DeskGlow, Journal-01
    expect(toolRes.productCards).toHaveLength(3);
    const names = toolRes.productCards!.map((c) => c.name);
    expect(names).toContain('Giá đỡ laptop nhôm tản nhiệt StandPro');
    expect(names).toContain('Đèn bàn học chống cận bảo vệ mắt DeskGlow');
    expect(names).toContain('Sổ tay bìa da cao cấp kẻ ngang Journal-01');
  });

  // 7. Unknown category input must not eliminate otherwise valid keyword results
  it('7. Unknown category input does not eliminate otherwise valid keyword search results', async () => {
    // When an unknown category is passed with a valid query:
    // resolveCategorySlug returns undefined, so the search performs keyword search without broken filter
    expect(resolveCategorySlug('danh mục không tồn tại xyz')).toBeUndefined();

    const toolRes = await executeBusinessTool(
      'search_products',
      { query: 'chuột', category: 'danh mục không tồn tại xyz' },
      { env }
    );

    expect(toolRes.productCards).toHaveLength(1);
    expect(toolRes.productCards![0].name).toBe('Chuột không dây công thái học ProMouse M1');
  });

  // 8. Existing zero-result behavior must remain unchanged
  it('8. Existing zero-result behavior returns empty products without unfiltered catalog dump', async () => {
    const toolRes = await executeBusinessTool(
      'search_products',
      { query: 'áo polo nam thể thao' },
      { env }
    );

    expect(toolRes.productCards).toEqual([]);
    const resultData = toolRes.result as any;
    expect(resultData.totalFound).toBe(0);
    expect(resultData.products).toEqual([]);
    expect(resultData.message).toContain('Không tìm thấy sản phẩm nào');
  });

  // 9. Existing price filters and pagination must remain unchanged
  it('9. Existing price filters and pagination remain fully compatible', async () => {
    // Price filter between 1.000.000 and 2.000.000 VNĐ
    // Matches p1 (1.150.000) and p3 (1.690.000)
    const priceRes = await catalogService.getProducts({
      minPrice: 1000000,
      maxPrice: 2000000,
    });
    expect(priceRes.meta.total).toBe(2);
    const ids = priceRes.products.map((p) => p.id);
    expect(ids).toContain('p1');
    expect(ids).toContain('p3');

    // Pagination test (page 1, limit 2)
    const pageRes = await catalogService.getProducts({ page: 1, limit: 2 });
    expect(pageRes.products).toHaveLength(2);
    expect(pageRes.meta.page).toBe(1);
    expect(pageRes.meta.limit).toBe(2);
    expect(pageRes.meta.total).toBe(9); // 9 active products
    expect(pageRes.meta.totalPages).toBe(5);
  });

  // 10. Existing product visibility restrictions must remain unchanged
  it('10. Existing product visibility restrictions exclude inactive products (is_active = 0)', async () => {
    // p10_inactive has name "Tai nghe có dây cũ hỏng" and is_active = 0
    const res = await catalogService.getProducts({ q: 'tai nghe có dây' });
    expect(res.meta.total).toBe(0);
    expect(res.products).toHaveLength(0);

    const allRes = await catalogService.getProducts({});
    const foundInactive = allRes.products.some((p) => p.id === 'p10_inactive');
    expect(foundInactive).toBe(false);
  });

  // 11. Existing GeminiProvider and WorkersAIProvider compatibility must remain intact
  it('11. Existing GeminiProvider and WorkersAIProvider compatibility remains fully functional', async () => {
    // WorkersAIProvider message formatting with tool calls
    const waiProvider = new WorkersAIProvider(undefined);
    const waiMessages = waiProvider.formatMessages([
      { role: 'user', content: 'Tìm tai nghe chống ồn' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'search_products', arguments: { query: 'tai nghe chống ồn' } }],
      },
      {
        role: 'tool',
        name: 'search_products',
        toolCallId: 'call_1',
        content: JSON.stringify({ totalFound: 1, products: [{ id: 'p3', name: 'Tai nghe ANC-X' }] }),
      },
    ]);
    expect(waiMessages).toHaveLength(3);
    expect(waiMessages[2].role).toBe('tool');
    expect((waiMessages[2] as any).tool_call_id).toBe('call_1');

    // GeminiProvider fallback behavior
    const geminiProvider = new GeminiProvider('fake_key', 'gemini-3.8-flash');
    const gemResponse = await geminiProvider.generateResponse([
      { role: 'user', content: 'Tìm đèn bàn' },
    ]);
    expect(gemResponse.providerUsed).toBe('mock-fallback');
    expect(gemResponse.message.content.length).toBeGreaterThan(0);
  });

  // 12. SQL injection and wildcard sanitization tests must continue passing
  it('12. SQL injection attempts and wildcard characters are safely sanitized without SQL errors', async () => {
    // 12a. Wildcard sanitization
    const wildResult = sanitizeLikeSearch('%%%___\\\\', 50);
    expect(wildResult).toBeNull();

    // 12b. SQL injection payload
    const injectPayload = "'; DROP TABLE products; --";
    const sanitized = sanitizeLikeSearch(injectPayload, 50);
    expect(sanitized).toBe("'; DROP TABLE products; --");

    // 12c. Run through catalogService and productRepo with injection string
    const res = await catalogService.getProducts({ q: injectPayload });
    expect(res.meta.total).toBe(0);
    expect(res.products).toEqual([]);

    // 12d. Verify table was NOT dropped
    const verifyTable = await env.DB.prepare('SELECT COUNT(*) as count FROM products;').first<{ count: number }>();
    expect(verifyTable?.count).toBeGreaterThan(0);
  });

  // --- Task 1 & 3: Conversational Query Normalization & Punctuation Tests ---

  it('13. Conversational Query 1: "Tìm cho tôi một cái chuột máy tính không dây màu đen xịn xò" finds ProMouse M1', async () => {
    const tokens = preprocessSearchQuery('Tìm cho tôi một cái chuột máy tính không dây màu đen xịn xò');
    expect(tokens).toContain('chuột');
    expect(tokens).toContain('không');
    expect(tokens).toContain('dây');
    // Ensure stopwords were stripped
    expect(tokens).not.toContain('Tìm');
    expect(tokens).not.toContain('cho');
    expect(tokens).not.toContain('tôi');
    expect(tokens).not.toContain('xịn');
    expect(tokens).not.toContain('xò');

    const res = await catalogService.getProducts({ q: 'Tìm cho tôi một cái chuột máy tính không dây màu đen xịn xò' });
    expect(res.meta.total).toBe(1);
    expect(res.products[0].id).toBe('p2');
    expect(res.products[0].name).toBe('Chuột không dây công thái học ProMouse M1');
  });

  it('14. Conversational Query 2: "Tôi muốn mua tai nghe chống ồn" finds ANC-X', async () => {
    const res = await catalogService.getProducts({ q: 'Tôi muốn mua tai nghe chống ồn' });
    expect(res.meta.total).toBe(1);
    expect(res.products[0].id).toBe('p3');
    expect(res.products[0].name).toBe('Tai nghe Bluetooth chống ồn chủ động ANC-X');
  });

  it('15. Conversational Query 3: "Cho mình xem đèn bàn học" finds DeskGlow', async () => {
    const res = await catalogService.getProducts({ q: 'Cho mình xem đèn bàn học' });
    expect(res.meta.total).toBe(1);
    expect(res.products[0].id).toBe('p5');
    expect(res.products[0].name).toBe('Đèn bàn học chống cận bảo vệ mắt DeskGlow');
  });

  it('16. Conversational Query 4: "Có chuột không dây không?" preserves "không dây" and strips trailing question particle', async () => {
    const tokens = preprocessSearchQuery('Có chuột không dây không?');
    // "không" in "không dây" preserved, trailing "không?" removed
    expect(tokens).toEqual(['chuột', 'không', 'dây']);

    const res = await catalogService.getProducts({ q: 'Có chuột không dây không?' });
    expect(res.meta.total).toBe(1);
    expect(res.products[0].id).toBe('p2');
    expect(res.products[0].name).toBe('Chuột không dây công thái học ProMouse M1');
  });

  it('17. Conversational Query 5: "Tìm balo cho laptop" finds UrbanShield', async () => {
    const res = await catalogService.getProducts({ q: 'Tìm balo cho laptop' });
    expect(res.meta.total).toBe(1);
    expect(res.products[0].id).toBe('p8');
    expect(res.products[0].name).toBe('Balo laptop chống nước đa năng UrbanShield 15.6 inch');
  });

  // --- Task 2: Short Token Slug Matching False-Positive Prevention ---

  it('18. Short token "ồn" does not cause false-positive matches through slug substring search', async () => {
    // Under unaccented slug search, "on" appears in "khong" (keyboard, mouse), "chong" (desk lamp, backpack)
    // But since "on".length < 3, p.slug LIKE '%on%' must be omitted!
    const res = await catalogService.getProducts({ q: 'ồn' });
    expect(res.meta.total).toBe(1);
    expect(res.products[0].id).toBe('p3');
    expect(res.products[0].name).toBe('Tai nghe Bluetooth chống ồn chủ động ANC-X');

    // Confirm that products with "khong" or "chong" in slug were NOT falsely matched
    const ids = res.products.map((p) => p.id);
    expect(ids).not.toContain('p1'); // ban-phim-co-khong-day
    expect(ids).not.toContain('p2'); // chuot-khong-day
    expect(ids).not.toContain('p5'); // den-ban-hoc-chong-can
    expect(ids).not.toContain('p8'); // balo-laptop-chong-nuoc
  });

  // --- Task 3: Punctuation Handling Tests ---

  it('19. Punctuation handling: mixed punctuation and extra whitespace do not break search matching', async () => {
    // "Tai nghe chống ồn!"
    const res1 = await catalogService.getProducts({ q: 'Tai nghe chống ồn!' });
    expect(res1.meta.total).toBe(1);
    expect(res1.products[0].id).toBe('p3');

    // "Đèn bàn, học."
    const res2 = await catalogService.getProducts({ q: 'Đèn bàn, học.' });
    expect(res2.meta.total).toBe(1);
    expect(res2.products[0].id).toBe('p5');

    // Mixed punctuation and repeated whitespace: "   Tìm    balo,   cho   laptop!???   "
    const res3 = await catalogService.getProducts({ q: '   Tìm    balo,   cho   laptop!???   ' });
    expect(res3.meta.total).toBe(1);
    expect(res3.products[0].id).toBe('p8');
  });
});
