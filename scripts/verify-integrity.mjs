import fs from 'fs';
import path from 'path';

const fullData = JSON.parse(fs.readFileSync('frontend/src/data/vn-wards-all.json', 'utf8'));
const meta = JSON.parse(fs.readFileSync('frontend/src/data/vn-administrative-meta.json', 'utf8'));
const wardsDir = 'frontend/src/data/wards';
const wardFiles = fs.readdirSync(wardsDir);

console.log('Number of ward files:', wardFiles.length);
if (wardFiles.length !== meta.provinces.length) {
  throw new Error(`Mismatch file count: ${wardFiles.length} vs ${meta.provinces.length}`);
}

let totalUnits = 0;
let totalPhuong = 0;
let totalXa = 0;
let totalDacKhu = 0;
const seenCodes = new Set();

for (const prov of meta.provinces) {
  const filePath = path.join(wardsDir, `${prov.code}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file for province ${prov.code}: ${prov.name}`);
  }
  const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const fullContent = fullData[prov.code];

  if (!fullContent) {
    throw new Error(`Missing province ${prov.code} in full dataset`);
  }

  if (JSON.stringify(fileContent) !== JSON.stringify(fullContent)) {
    throw new Error(`Data mismatch for province ${prov.code}: ${prov.name}`);
  }

  if (fileContent.length !== prov.totalCommunes) {
    throw new Error(`Count mismatch for province ${prov.code}: file=${fileContent.length}, meta=${prov.totalCommunes}`);
  }

  let pCount = 0;
  let xCount = 0;
  let ttCount = 0;
  let dkCount = 0;

  for (const item of fileContent) {
    if (seenCodes.has(item.code)) {
      throw new Error(`Duplicate code detected: ${item.code} in ${prov.name}`);
    }
    seenCodes.add(item.code);

    if (item.province_code !== prov.code) {
      throw new Error(`Province code mismatch in item ${item.code}: expected ${prov.code}, got ${item.province_code}`);
    }

    if (item.division_type === 'phường') pCount++;
    else if (item.division_type === 'xã') xCount++;
    else if (item.division_type === 'thị trấn') ttCount++;
    else if (item.division_type === 'đặc khu') dkCount++;
    else throw new Error(`Unknown division type: ${item.division_type}`);
  }

  if (pCount !== prov.phuong || xCount !== prov.xa || ttCount !== prov.thiTran || dkCount !== prov.dacKhu) {
    throw new Error(`Breakdown mismatch in ${prov.name}: expected P:${prov.phuong}/X:${prov.xa}/TT:${prov.thiTran}/DK:${prov.dacKhu}, got P:${pCount}/X:${xCount}/TT:${ttCount}/DK:${dkCount}`);
  }

  totalUnits += fileContent.length;
  totalPhuong += pCount;
  totalXa += xCount;
  totalDacKhu += dkCount;
}

console.log('=== VERIFICATION PASSED ===');
console.log(`- Provinces: ${meta.provinces.length}`);
console.log(`- Total Communes: ${totalUnits}`);
console.log(`- Phường: ${totalPhuong}`);
console.log(`- Xã: ${totalXa}`);
console.log(`- Đặc khu: ${totalDacKhu}`);
console.log(`- Unique codes: ${seenCodes.size}`);
console.log('All partitioned files and aggregate file are 100% consistent!');
