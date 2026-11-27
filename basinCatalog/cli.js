#!/usr/bin/env node
/**
 * Basin Catalog CLI — Nhóm 8 Sáng T6 (Real Data Only)
 * Command line tool for Basin Catalog stream telemetry & 24h real traffic analytics.
 * 
 * Usage:
 *   node basinCatalog/cli.js stats       Display real 24h traffic statistics
 *   node basinCatalog/cli.js visit       Record a real visit from current client & stream to Basin Catalog
 *   node basinCatalog/cli.js send        Alias for visit
 *   node basinCatalog/cli.js json        Output real 24h stats as raw JSON
 */

import { recordVisit, get24hStats, syncRealVisitsFromApi } from './analytics.js';
import { streamConfig } from './ingest.js';

const args = process.argv.slice(2);
const command = args[0] || 'stats';

function drawBar(percentage, maxLen = 20) {
  const filled = Math.round((percentage / 100) * maxLen);
  const empty = maxLen - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function printHeader() {
  console.log('='.repeat(70));
  console.log(`  🌐 BASIN CATALOG 24-HOUR REAL TRAFFIC ANALYTICS`);
  console.log(`  Stream: ${streamConfig.streamEndpoint}`);
  console.log(`  ID (Tên nhóm): ${streamConfig.groupId}`);
  console.log('='.repeat(70));
}

async function handleStats() {
  printHeader();
  await syncRealVisitsFromApi();
  const stats = get24hStats();

  console.log(`\n📅 Khoảng thời gian thống kê thực tế (24 giờ qua):`);
  console.log(`   Từ:  ${stats.windowStart}`);
  console.log(`   Đến: ${stats.windowEnd}`);
  console.log(`\n📊 TỔNG SỐ LƯỢT TRUY CẬP THỰC TẾ: ${stats.totalVisits} lượt\n`);

  // 1. Quốc gia
  console.log('-'.repeat(70));
  console.log('🌍 THỐNG KÊ THEO QUỐC GIA (Country - Real Cloudflare GeoIP):');
  console.log('-'.repeat(70));
  if (stats.countries.length === 0) {
    console.log('   (Chưa có lượt truy cập thực tế nào trong 24h qua)');
  } else {
    console.log('   Quốc gia | Số lượt | Tỷ lệ %   | Biểu đồ');
    console.log('   ---------+---------+-----------+---------------------');
    for (const c of stats.countries) {
      const countryPadded = c.country.padEnd(8);
      const countPadded = String(c.count).padStart(7);
      const pctPadded = (c.percentage.toFixed(1) + '%').padStart(8);
      const bar = drawBar(c.percentage);
      console.log(`   ${countryPadded} | ${countPadded} | ${pctPadded} | ${bar}`);
    }
  }

  // 2. Thiết bị
  console.log('\n' + '-'.repeat(70));
  console.log('📱 THỐNG KÊ THEO THIẾT BỊ (Device - Real User-Agent / OS):');
  console.log('-'.repeat(70));
  if (stats.devices.length === 0 || stats.totalVisits === 0) {
    console.log('   (Chưa có lượt truy cập thực tế nào trong 24h qua)');
  } else {
    console.log('   Thiết bị  | Số lượt | Tỷ lệ %   | Biểu đồ');
    console.log('   ----------+---------+-----------+---------------------');
    for (const d of stats.devices) {
      const devPadded = d.device.padEnd(9);
      const countPadded = String(d.count).padStart(7);
      const pctPadded = (d.percentage.toFixed(1) + '%').padStart(8);
      const bar = drawBar(d.percentage);
      console.log(`   ${devPadded} | ${countPadded} | ${pctPadded} | ${bar}`);
    }
  }

  // 3. Nhật ký truy cập thực tế gần nhất
  console.log('\n' + '-'.repeat(70));
  console.log('📋 NHẬT KÝ TRUY CẬP THỰC TẾ GẦN NHẤT (Real Visits Log):');
  console.log('-'.repeat(70));
  if (stats.recentVisits.length === 0) {
    console.log('   (Chưa có bản ghi nào)');
  } else {
    console.log('   Thời gian (UTC)          | IP Thực Tế      | QG | Thiết Bị | Đường dẫn');
    console.log('   -------------------------+-----------------+----+----------+----------------');
    for (const v of stats.recentVisits.slice(0, 15)) {
      const timeIso = new Date(v.time).toISOString().replace('T', ' ').substring(0, 19);
      const ipPadded = String(v.ip).padEnd(15);
      const cPadded = String(v.country).padEnd(2);
      const dPadded = String(v.device).padEnd(8);
      const pathStr = v.meta?.path || '/';
      console.log(`   ${timeIso}      | ${ipPadded} | ${cPadded} | ${dPadded} | ${pathStr}`);
    }
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

async function handleVisit() {
  printHeader();
  const pathIdx = args.indexOf('--path');
  const uaIdx = args.indexOf('--ua');
  const visitPath = pathIdx !== -1 && args[pathIdx + 1] ? args[pathIdx + 1] : '/';
  const userAgent = uaIdx !== -1 && args[uaIdx + 1] ? args[uaIdx + 1] : undefined;

  console.log(`\n🚀 Đang ghi nhận lượt truy cập thực tế và gửi lên Basin Catalog Stream...`);

  const res = await recordVisit({
    path: visitPath,
    userAgent
  });

  console.log(`   ID:       ${res.visit.id}`);
  console.log(`   IP thật:  ${res.visit.ip}`);
  console.log(`   Quốc gia: ${res.visit.country} (Cloudflare Edge: ${res.visit.meta?.colo || 'N/A'})`);
  console.log(`   Thiết bị: ${res.visit.device} (${res.visit.meta?.os || ''})`);
  console.log(`   Time(ms): ${res.visit.time} (${new Date(res.visit.time).toISOString()})`);
  console.log(`   Path:     ${res.visit.meta?.path}`);

  if (res.success) {
    console.log(`\n✅ Đã gửi thành công lên Basin Catalog Stream! (committed: ${res.committed})`);
  } else {
    console.error(`\n❌ Gửi thất bại: ${res.streamError}`);
  }
}

async function handleJson() {
  await syncRealVisitsFromApi();
  const stats = get24hStats();
  console.log(JSON.stringify(stats, null, 2));
}

switch (command) {
  case 'stats':
    await handleStats();
    break;
  case 'visit':
  case 'send':
    await handleVisit();
    break;
  case 'json':
    await handleJson();
    break;
  default:
    console.log(`Lệnh không hợp lệ: "${command}". Sử dụng: stats, visit, send, json`);
}
