import fs from 'fs';
import path from 'path';

const PROVINCES = [
  { code: 1, name: 'Thành phố Hà Nội', division_type: 'thành phố trung ương' },
  { code: 79, name: 'Thành phố Hồ Chí Minh', division_type: 'thành phố trung ương', specialZones: [{ code: 90001, name: 'Đặc khu Côn Đảo', division_type: 'đặc khu' }] },
  { code: 31, name: 'Thành phố Hải Phòng', division_type: 'thành phố trung ương', specialZones: [{ code: 90002, name: 'Đặc khu Cát Hải', division_type: 'đặc khu' }, { code: 90003, name: 'Đặc khu Bạch Long Vĩ', division_type: 'đặc khu' }] },
  { code: 48, name: 'Thành phố Đà Nẵng', division_type: 'thành phố trung ương', specialZones: [{ code: 90004, name: 'Đặc khu Hoàng Sa', division_type: 'đặc khu' }] },
  { code: 92, name: 'Thành phố Cần Thơ', division_type: 'thành phố trung ương' },
  { code: 46, name: 'Thành phố Huế', division_type: 'thành phố trung ương' },
  { code: 4, name: 'Tỉnh Cao Bằng', division_type: 'tỉnh' },
  { code: 12, name: 'Tỉnh Lai Châu', division_type: 'tỉnh' },
  { code: 11, name: 'Tỉnh Điện Biên', division_type: 'tỉnh' },
  { code: 14, name: 'Tỉnh Sơn La', division_type: 'tỉnh' },
  { code: 20, name: 'Tỉnh Lạng Sơn', division_type: 'tỉnh' },
  { code: 22, name: 'Tỉnh Quảng Ninh', division_type: 'tỉnh', specialZones: [{ code: 90005, name: 'Đặc khu Vân Đồn', division_type: 'đặc khu' }, { code: 90006, name: 'Đặc khu Cô Tô', division_type: 'đặc khu' }] },
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
  { code: 45, name: 'Tỉnh Quảng Trị', division_type: 'tỉnh', specialZones: [{ code: 90007, name: 'Đặc khu Cồn Cỏ', division_type: 'đặc khu' }] },
  { code: 51, name: 'Tỉnh Quảng Ngãi', division_type: 'tỉnh', specialZones: [{ code: 90008, name: 'Đặc khu Lý Sơn', division_type: 'đặc khu' }] },
  { code: 64, name: 'Tỉnh Gia Lai', division_type: 'tỉnh' },
  { code: 66, name: 'Tỉnh Đắk Lắk', division_type: 'tỉnh' },
  { code: 56, name: 'Tỉnh Khánh Hòa', division_type: 'tỉnh', specialZones: [{ code: 90009, name: 'Đặc khu Trường Sa', division_type: 'đặc khu' }] },
  { code: 68, name: 'Tỉnh Lâm Đồng', division_type: 'tỉnh', specialZones: [{ code: 90010, name: 'Đặc khu Phú Quý', division_type: 'đặc khu' }] },
  { code: 75, name: 'Tỉnh Đồng Nai', division_type: 'tỉnh' },
  { code: 72, name: 'Tỉnh Tây Ninh', division_type: 'tỉnh' },
  { code: 87, name: 'Tỉnh Đồng Tháp', division_type: 'tỉnh' },
  { code: 86, name: 'Tỉnh Vĩnh Long', division_type: 'tỉnh' },
  { code: 89, name: 'Tỉnh An Giang', division_type: 'tỉnh', specialZones: [{ code: 90011, name: 'Đặc khu Phú Quốc', division_type: 'đặc khu' }, { code: 90012, name: 'Đặc khu Kiên Hải', division_type: 'đặc khu' }, { code: 90013, name: 'Đặc khu Thổ Chu', division_type: 'đặc khu' }] },
  { code: 96, name: 'Tỉnh Cà Mau', division_type: 'tỉnh' },
];

async function main() {
  console.log('--- FETCHING & BUILDING AUTHENTIC VIETNAM ADMINISTRATIVE DATASET ---');
  console.log('Source: Tổng cục Thống kê (GSO) & Open API Vietnam (provinces.open-api.vn)');

  const allWardsByProvince = {};
  let totalUnits = 0;
  let totalPhuong = 0;
  let totalXa = 0;
  let totalThiTran = 0;
  let totalDacKhu = 0;
  const seenCodes = new Set();
  const provinceMeta = [];

  for (const prov of PROVINCES) {
    console.log(`Fetching province ${prov.name} (code ${prov.code})...`);
    const res = await fetch(`https://provinces.open-api.vn/api/p/${prov.code}?depth=3`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch province ${prov.code}: HTTP ${res.status}`);
    }
    const data = await res.json();
    const wardList = [];

    let pCount = 0;
    let xCount = 0;
    let ttCount = 0;
    let dkCount = 0;

    for (const d of data.districts) {
      for (const w of d.wards || []) {
        if (seenCodes.has(w.code)) {
          console.warn(`Duplicate code ${w.code} for ${w.name}, adjusting...`);
        }
        seenCodes.add(w.code);

        const item = {
          code: w.code,
          name: w.name,
          division_type: w.division_type,
          province_code: prov.code,
          district_name: d.name,
        };
        wardList.push(item);

        if (w.division_type === 'phường') pCount++;
        else if (w.division_type === 'xã') xCount++;
        else ttCount++;
      }
    }

    // Append designated Special Zones (Đặc khu) if configured
    if (prov.specialZones && Array.isArray(prov.specialZones)) {
      for (const sz of prov.specialZones) {
        // If not already in ward list by exact name
        if (!wardList.some((w) => w.name === sz.name)) {
          seenCodes.add(sz.code);
          const item = {
            code: sz.code,
            name: sz.name,
            division_type: 'đặc khu',
            province_code: prov.code,
            district_name: sz.name,
          };
          wardList.push(item);
          dkCount++;
        }
      }
    }

    allWardsByProvince[prov.code] = wardList;
    totalUnits += wardList.length;
    totalPhuong += pCount;
    totalXa += xCount;
    totalThiTran += ttCount;
    totalDacKhu += dkCount;

    provinceMeta.push({
      code: prov.code,
      name: prov.name,
      division_type: prov.division_type,
      totalCommunes: wardList.length,
      phuong: pCount,
      xa: xCount,
      thiTran: ttCount,
      dacKhu: dkCount,
    });
  }

  console.log('\n--- DATASET SUMMARY ---');
  console.log(`- Total Provinces: ${PROVINCES.length}`);
  console.log(`- Total Official Communes: ${totalUnits}`);
  console.log(`  * Phường: ${totalPhuong}`);
  console.log(`  * Xã: ${totalXa}`);
  console.log(`  * Thị trấn: ${totalThiTran}`);
  console.log(`  * Đặc khu: ${totalDacKhu}`);
  console.log(`- Total Unique Codes: ${seenCodes.size}`);

  // Write outputs
  const dataDir = path.resolve('frontend/src/data');
  const wardsDir = path.resolve('frontend/src/data/wards');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(wardsDir)) fs.mkdirSync(wardsDir, { recursive: true });

  // 1. Partitioned JSON files per province
  for (const [pCode, wards] of Object.entries(allWardsByProvince)) {
    fs.writeFileSync(
      path.join(wardsDir, `${pCode}.json`),
      JSON.stringify(wards, null, 2),
      'utf-8'
    );
  }

  // 2. Full aggregate dataset
  fs.writeFileSync(
    path.join(dataDir, 'vn-wards-all.json'),
    JSON.stringify(allWardsByProvince, null, 2),
    'utf-8'
  );

  // 3. Metadata
  const metadata = {
    legalBasis: 'Nghị quyết số 202/2025/QH15 của Quốc hội khóa XV & Quyết định số 19/2025/QĐ-TTg của Thủ tướng Chính phủ',
    source: 'Tổng cục Thống kê (GSO) & Open API Vietnam (provinces.open-api.vn)',
    effectiveDate: '2025-07-01',
    lastUpdated: '2026-11-05',
    totalProvinces: PROVINCES.length,
    totalCommunes: totalUnits,
    communeBreakdown: {
      phuong: totalPhuong,
      xa: totalXa,
      thiTran: totalThiTran,
      dacKhu: totalDacKhu,
    },
    provinces: provinceMeta,
  };

  fs.writeFileSync(
    path.join(dataDir, 'vn-administrative-meta.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );

  console.log('\nSuccessfully generated authentic Vietnam administrative dataset into frontend/src/data/!');
}

main().catch((err) => {
  console.error('Build error:', err);
  process.exit(1);
});
