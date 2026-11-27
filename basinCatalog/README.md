# Basin Catalog Analytics — Nhóm 8 (Group 8)

Tích hợp luồng dữ liệu (Stream Ingestion) và phân tích thống kê lượng truy cập website trong 24 giờ qua theo quốc gia và thiết bị, sử dụng Cloudflare Basin Catalog.

---

## 1. Thông Tin Stream Endpoint

- **Stream Endpoint**: `https://f8fb6f6f730b404fb2f273fd789d04df.ingest.cloudflare.com`
- **Host**: `f8fb6f6f730b404fb2f273fd789d04df.ingest.cloudflare.com`
- **Method**: `POST`
- **ID (Tên nhóm)**: `nhóm 8 sáng t6`
- **Cấu trúc trường dữ liệu (Schema)**:
  - `id` (string): Mã nhóm (`nhóm 8 sáng t6`)
  - `country` (string): Mã quốc gia 2 ký tự (VN, US, JP, SG, ...)
  - `device` (string): Loại thiết bị (`desktop`, `mobile`, `tablet`)
  - `time` (timestamp / millisecond): Thời điểm truy cập (epoch ms)
  - `ip` (string): Địa chỉ IP người truy cập
  - `meta` (json): Thông tin bổ sung (path, userAgent, referrer, ...)

---

## 2. Hướng Dẫn Sử Dụng CLI

Công cụ dòng lệnh `cli.js` nằm trong thư mục `basinCatalog/`:

### a. Xem Thống Kê 24 Giờ Qua
Hiển thị tổng số lượt truy cập, phân tích theo quốc gia, phân tích theo thiết bị và timeline 24 giờ:
```bash
node basinCatalog/cli.js stats
```

### b. Gửi Lượt Truy Cập Mới (Real-time Ingest)
Gửi trực tiếp 1 bản ghi truy cập lên Basin Catalog Stream:
```bash
node basinCatalog/cli.js send --country VN --device mobile --ip 14.232.208.1
```

### c. Mô Phỏng Dữ Liệu Truy Cập 24 Giờ (Simulate Traffic)
Mô phỏng 50 lượt truy cập trải đều trong 24 giờ qua và gửi đồng thời lên Cloudflare Basin Catalog:
```bash
node basinCatalog/cli.js simulate 50
```

### d. Kiểm Tra Kết Nối Stream Endpoint
```bash
node basinCatalog/cli.js test
```

### e. Xuất Dữ Liệu Dạng JSON
```bash
node basinCatalog/cli.js json
```

---

## 3. Tích Hợp Vào Backend EdgeCart (Cloudflare Workers API)

Hệ thống cung cấp sẵn các API endpoint tại `apps/api`:

- `POST /api/v1/analytics/visit`: Tự động ghi nhận lượt truy cập của khách truy cập, tự động xác định quốc gia qua header Cloudflare (`cf-ipcountry`), nhận diện thiết bị qua User-Agent, gửi trực tiếp lên Basin Catalog Stream (`id: nhom8`), và cập nhật thống kê 24h.
- `GET /api/v1/analytics/stats-24h`: Trả về JSON thống kê 24h qua gồm tổng lượt truy cập, tỷ lệ quốc gia, tỷ lệ thiết bị.
- `GET /api/v1/analytics/basin-info`: Trả về thông tin cấu hình stream endpoint.

---

## 4. Tệp Cấu Hình
- `basinCatalog/streamInfo`: File cấu hình theo yêu cầu gốc.
- `basinCatalog/streamInfo.json`: File cấu hình dạng JSON có cấu trúc.
- `basinCatalog/ingest.js`: Module gửi dữ liệu trực tiếp lên stream endpoint.
- `basinCatalog/analytics.js`: Module tổng hợp và tính toán thống kê trong 24 giờ.
- `basinCatalog/cli.js`: Giao diện CLI tương tác dòng lệnh.
