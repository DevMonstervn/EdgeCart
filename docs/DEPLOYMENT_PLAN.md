# EdgeCart - Cloudflare Deployment & Migration Plan

**Tài liệu:** Kế hoạch Triển khai & Vận hành Đa Môi trường (Local, Staging, Production)  
**Hạ tầng:** Cloudflare Edge-Native (Workers, D1, KV, R2, Pages / Workers Static Assets)  
**Phiên bản:** 1.0.0  
**Tác giả:** Senior Software Architect  
**Nguyên tắc vận hành:** Không tự ý thay đổi dữ liệu production, không ghi secrets vào Git, cô lập 100% giữa các môi trường, chỉ chuyển production khi có phê duyệt.

---

## 1. Kiến trúc Triển khai & Lựa chọn Nền tảng Frontend

### 1.1 So sánh Mô hình Triển khai Frontend

| Tiêu chí | Phương án A: **Cloudflare Pages** (Khuyến nghị) | Phương án B: **Workers Static Assets** |
| :--- | :--- | :--- |
| **Bản chất** | Nền tảng chuyên dụng cho Single Page Application (SPA / Jamstack) | Worker phục vụ đồng thời cả API (`/api/*`) và thư mục tĩnh (`dist/`) |
| **Domain** | Tách riêng: Storefront (`edgecart.com`), API (`api.edgecart.com`) | Chung một domain duy nhất (`edgecart.com/api/*`) |
| **CORS** | Cần cấu hình CORS giữa Frontend và Worker API | Không cần CORS cho cùng một domain gốc |
| **Preview Deployments** | Tự động tạo URL preview độc lập cho từng Pull Request / Git branch | Cần cấu hình custom worker environment cho preview |
| **Cơ chế Rollback** | Rollback tức thì (Instant 1-Click) về bất kỳ bản build nào trên UI/CLI | Phải rollback phiên bản Worker (kéo theo cả code API) |
| **Routing SPA** | Hỗ trợ fallback qua file `_redirects` (`/* /index.html 200`) | Hỗ trợ qua cấu hình `"not_found_handling": "single-page-application"` |
| **Khuyến nghị** | **LỰA CHỌN TỐI ƯU**: Tách biệt vòng đời phát hành giữa Frontend và Backend, an toàn cao, rollback độc lập | Phù hợp khi muốn giảm thiểu số lượng custom domain |

> [!NOTE]
> EdgeCart áp dụng **Phương án A (Cloudflare Pages)** làm kiến trúc mặc định theo đúng thiết kế tại [ARCHITECTURE.md](file:///d:/EdgeCart/docs/ARCHITECTURE.md). Mã nguồn Frontend đã tích hợp sẵn file `frontend/public/_redirects` để đảm bảo Vue Router hoạt động trơn tru trên Cloudflare Pages CDN.

---

## 2. Ma trận Môi trường & Danh mục Tài nguyên (Resource Inventory)

| Tài nguyên | Local (Development) | Staging | Production (Chờ phê duyệt) |
| :--- | :--- | :--- | :--- |
| **Backend Worker** | `edgecart-api` (Local Miniflare) | `edgecart-api-staging` | `edgecart-api` |
| **Frontend Platform** | Vite Dev Server (`localhost:5173`) | Cloudflare Pages (`edgecart-frontend`) | Cloudflare Pages (`edgecart-frontend`) |
| **Domain Frontend** | `http://localhost:5173` | `https://staging.edgecart.com` hoặc `*.pages.dev` | `https://edgecart.com` |
| **Domain API** | `http://localhost:8787` | `https://api-staging.edgecart.com` hoặc `*.workers.dev` | `https://api.edgecart.com` |
| **Cloudflare D1** | Local SQLite (`.wrangler/state/v3/d1`) | `edgecart-d1-staging` | `edgecart-d1-prod` |
| **Cloudflare KV** | Local in-memory KV | `edgecart-kv-staging` | `edgecart-kv-prod` |
| **Cloudflare R2** | Local in-memory R2 | `edgecart-media-staging` | `edgecart-media-prod` |
| **JWT_SECRET** | `.dev.vars` (Local chỉ định) | Cloudflare Secret (`wrangler secret put`) | Cloudflare Secret (Khóa mật 256-bit độc lập) |

---

## 3. Quy trình Triển khai Chi tiết Từng Bước

### Bước 1: Đăng nhập & Xác thực Tài khoản Cloudflare
```bash
# Đăng nhập vào Cloudflare CLI
pnpm --filter @edgecart/api exec wrangler login

# Kiểm tra danh tính và Account ID
pnpm --filter @edgecart/api exec wrangler whoami
```
> [!IMPORTANT]
> Lệnh này sẽ mở trình duyệt để xác thực OAuth với tài khoản Cloudflare của bạn. Cần lưu lại `Account ID` từ kết quả của `wrangler whoami`.

---

### Bước 2: Khởi tạo Tài nguyên Môi trường Staging (Chỉ tạo một lần)

Thực hiện các lệnh sau để khởi tạo tài nguyên Cloudflare miễn phí cho môi trường Staging:

```bash
# 1. Tạo Database D1 cho Staging
pnpm --filter @edgecart/api exec wrangler d1 create edgecart-d1-staging

# 2. Tạo KV Namespace cho Staging
pnpm --filter @edgecart/api exec wrangler kv namespace create edgecart-kv-staging

# 3. Tạo R2 Bucket cho Staging (Lưu trữ ảnh sản phẩm)
pnpm --filter @edgecart/api exec wrangler r2 bucket create edgecart-media-staging

# 4. Tạo Project Cloudflare Pages cho Frontend
pnpm --filter @edgecart/api exec wrangler pages project create edgecart-frontend --production-branch main
```

**Tác dụng của từng lệnh:**
- `d1 create`: Cấp phát database SQLite phân tán trên mạng lưới Edge của Cloudflare. Lệnh sẽ in ra `database_id` (dạng UUID).
- `kv namespace create`: Cấp phát vùng nhớ Key-Value độ trễ thấp toàn cầu. Lệnh sẽ in ra `id` (namespace ID).
- `r2 bucket create`: Khởi tạo kho lưu trữ đối tượng S3-compatible không tốn phí băng thông tải ra (Zero Egress).
- `pages project create`: Thiết lập dự án tĩnh trên Cloudflare Pages kết nối với nhánh Git hoặc direct upload.

---

### Bước 3: Cập nhật Bindings vào `apps/api/wrangler.jsonc`

Sau khi tạo xong tài nguyên ở Bước 2, mở file [wrangler.jsonc](file:///d:/EdgeCart/apps/api/wrangler.jsonc) và cập nhật các ID thật nhận được từ Cloudflare:

```jsonc
{
  "name": "edgecart-api",
  "env": {
    "staging": {
      "name": "edgecart-api-staging",
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "edgecart-d1-staging",
          "database_id": "<STAGING_D1_DATABASE_UUID>", // Thay thế bằng UUID thật
          "migrations_dir": "migrations"
        }
      ],
      "kv_namespaces": [
        {
          "binding": "KV",
          "id": "<STAGING_KV_NAMESPACE_ID>"           // Thay thế bằng KV ID thật
        }
      ],
      "r2_buckets": [
        {
          "binding": "R2",
          "bucket_name": "edgecart-media-staging"
        }
      ],
      "vars": {
        "ENVIRONMENT": "staging",
        "APP_URL": "https://staging.edgecart.com"
      }
    }
  }
}
```

---

### Bước 4: Thiết lập Secrets An toàn (Không lưu vào Git)

Tuyệt đối không lưu khóa bảo mật vào mã nguồn. Sử dụng lệnh CLI an toàn:

```bash
# Thiết lập JWT_SECRET cho môi trường Staging
pnpm --filter @edgecart/api exec wrangler secret put JWT_SECRET --env staging
# Nhập chuỗi ngẫu nhiên mạnh (tối thiểu 32 ký tự) khi terminal hỏi prompt
```

---

### Bước 5: Chạy Database Migration cho Môi trường Staging

Quy trình migration trên Cloudflare D1 là an toàn và có kiểm soát:

```bash
# 1. Kiểm tra danh sách migration chưa áp dụng
pnpm --filter @edgecart/api exec wrangler d1 migrations list edgecart-d1-staging --env staging

# 2. Áp dụng migration lên D1 Staging từ xa
pnpm --filter @edgecart/api run db:migrate:staging
```
*Lưu ý: Hệ thống sẽ yêu cầu xác nhận `y/N` trên terminal trước khi thực thi SQL lên cloud.*

---

### Bước 6: Deploy Backend API lên Cloudflare Workers (Staging)

```bash
# Deploy Backend API Worker lên Staging
pnpm --filter @edgecart/api run deploy:staging
```
Lệnh sẽ đóng gói TypeScript thành V8 Isolate bundle, tải lên Cloudflare Edge và trả về URL chính thức (ví dụ: `https://edgecart-api-staging.<your-subdomain>.workers.dev`).

---

### Bước 7: Build & Deploy Frontend lên Cloudflare Pages (Staging)

1. Cập nhật URL API của Staging vào cấu hình build:
```bash
# Tạo file .env cho Frontend trỏ tới URL API Staging vừa deploy
echo "VITE_API_BASE_URL=https://edgecart-api-staging.<your-subdomain>.workers.dev/api/v1" > frontend/.env.production
```

2. Build và deploy:
```bash
# 1. Build frontend Vue 3
pnpm --filter @edgecart/frontend run build

# 2. Deploy bundle dist/ lên Cloudflare Pages Staging
pnpm --filter @edgecart/frontend run deploy:staging
```
Lệnh sẽ trả về URL xem trước Staging (ví dụ: `https://staging.edgecart-frontend.pages.dev`).

---

## 4. Kịch bản Kiểm thử Khói Toàn diện (Smoke Test Protocol)

Sau khi deploy Staging thành công, tiến hành kiểm tra xác minh tuần tự theo danh sách kiểm tra (Checklist) sau:

| Thao tác Kiểm tra | Lệnh cURL / Kiểm tra Trình duyệt | Kết quả Kỳ vọng |
| :--- | :--- | :--- |
| **1. Health Check** | `curl -i https://<API_URL>/health` | HTTP 200, `"status": "healthy"`, `"environment": "staging"` |
| **2. CORS Preflight** | `curl -i -X OPTIONS https://<API_URL>/api/v1/products -H "Origin: https://staging.edgecart.com" -H "Access-Control-Request-Method: GET"` | HTTP 204, Header `Access-Control-Allow-Origin` khớp Origin |
| **3. Lấy Danh mục & KV** | `curl -i https://<API_URL>/api/v1/categories` | Lần 1: HTTP 200 (nạp từ D1, ghi KV). Lần 2: Phản hồi tức thì < 10ms từ KV |
| **4. Đăng ký & Đăng nhập** | `curl -X POST https://<API_URL>/api/v1/auth/register -H "Content-Type: application/json" -d '{"email":"test@edgecart.com","password":"Password123@","fullName":"Test User"}'` | HTTP 201 Created, trả về accessToken và refreshToken |
| **5. Giỏ hàng & Tồn kho** | Thao tác trên giao diện Web Staging: Chọn sản phẩm -> Thêm vào giỏ | Giỏ hàng cập nhật số lượng, không bị lỗi CORS |
| **6. Atomic Checkout** | Điền thông tin giao hàng -> Bấm đặt hàng (COD) | Tạo đơn hàng thành công, hiển thị Order ID, tồn kho giảm |
| **7. SPA Routing** | Mở trực tiếp link `https://<FRONTEND_URL>/products` và F5 Refresh | Trang tải bình thường, không gặp lỗi 404 (xác nhận `_redirects` hoạt động) |
| **8. Upload Ảnh R2** | Tạo presigned URL và upload ảnh qua admin portal | File được ghi vào R2 bucket `edgecart-media-staging` |

---

## 5. Cổng Kiểm soát Chuyển đổi Production (Production Gate)

> [!CAUTION]
> **QUY TẮC BẮT BUỘC:** Tuyệt đối không tự ý chạy lệnh deploy hoặc migration production khi chưa có sự xác nhận bằng văn bản từ Quản lý / Khách hàng.

Khi nhận được lệnh xác nhận chính thức chuyển sang Production, quy trình được thực hiện theo thứ tự nghiêm ngặt sau:

### Quy trình Chuyển đổi Production:
```bash
# BƯỚC P1: Khởi tạo tài nguyên Production trên Cloudflare
pnpm --filter @edgecart/api exec wrangler d1 create edgecart-d1-prod
pnpm --filter @edgecart/api exec wrangler kv namespace create edgecart-kv-prod
pnpm --filter @edgecart/api exec wrangler r2 bucket create edgecart-media-prod

# BƯỚC P2: Cập nhật UUID của D1 và KV Prod vào wrangler.jsonc (phần root)

# BƯỚC P3: Thiết lập Secret Production độc lập
pnpm --filter @edgecart/api exec wrangler secret put JWT_SECRET
# (Nhập secret production mạnh độc lập với staging)

# BƯỚC P4: Áp dụng Migration lên D1 Production
pnpm --filter @edgecart/api run db:migrate:prod

# BƯỚC P5: Deploy Backend Worker Production
pnpm --filter @edgecart/api run deploy

# BƯỚC P6: Build Frontend với Production API URL & Deploy Pages Main
echo "VITE_API_BASE_URL=https://api.edgecart.com/api/v1" > frontend/.env.production
pnpm --filter @edgecart/frontend run build
pnpm --filter @edgecart/frontend run deploy:prod
```

---

## 6. Quy trình Sao lưu & Phục hồi Sự cố (Rollback Procedures)

### 6.1 Rollback Frontend (Cloudflare Pages)
- **Cách 1 (UI Dashboard - Nhanh nhất 30 giây):**
  1. Đăng nhập Cloudflare Dashboard -> **Compute (Workers & Pages)** -> Chọn dự án `edgecart-frontend`.
  2. Vào mục **Deployments**, tìm bản deploy ổn định gần nhất trước đó.
  3. Bấm biểu tượng 3 chấm `...` -> Chọn **Rollback to this deployment**.
- **Cách 2 (CLI):**
  Chạy lại lệnh deploy với mã nguồn git commit trước:
  ```bash
  git checkout <previous_stable_commit>
  pnpm --filter @edgecart/frontend run build
  pnpm --filter @edgecart/frontend run deploy:prod
  ```

### 6.2 Rollback Backend API (Cloudflare Workers)
Cloudflare Workers quản lý phiên bản theo Version Deployments:
- **Xem lịch sử phiên bản Worker:**
  ```bash
  # Xem deployments của Staging
  pnpm --filter @edgecart/api exec wrangler deployments list --env staging

  # Xem deployments của Production
  pnpm --filter @edgecart/api exec wrangler deployments list
  ```
- **Rollback về phiên bản trước (Zero-downtime):**
  ```bash
  # Rollback Worker Staging về Version ID cụ thể
  pnpm --filter @edgecart/api exec wrangler rollback <VERSION_ID> --env staging --message "Rollback to stable version"

  # Rollback Worker Production
  pnpm --filter @edgecart/api exec wrangler rollback <VERSION_ID> --message "Rollback to stable version"
  ```

### 6.3 Quy trình Sao lưu & Rollback Cơ sở Dữ liệu D1 (Safe Database Backup & Restore)
Cloudflare D1 cung cấp 2 cơ chế bảo vệ dữ liệu cực kỳ mạnh mẽ:

#### 1. Tạo Snapshot Backup trước khi Migration (Chủ động):
```bash
# Tạo bản sao lưu tức thì trước khi chạy migration
pnpm --filter @edgecart/api exec wrangler d1 backup create edgecart-d1-staging

# Xem danh sách các bản backup đã tạo
pnpm --filter @edgecart/api exec wrangler d1 backup list edgecart-d1-staging

# Khôi phục từ backup ID nếu migration phát sinh lỗi
pnpm --filter @edgecart/api exec wrangler d1 backup restore edgecart-d1-staging <BACKUP_ID>
```

#### 2. Phục hồi Điểm thời gian (Time Travel / Point-in-Time Recovery):
D1 tự động ghi nhận mọi transaction theo bookmarks. Khi xảy ra sự cố ngoài ý muốn:
```bash
# Xem thông tin bookmark và timestamp hiện tại
pnpm --filter @edgecart/api exec wrangler d1 info edgecart-d1-staging

# Khôi phục database về thời điểm timestamp chính xác (RFC3339) trước khi lỗi xảy ra
pnpm --filter @edgecart/api exec wrangler d1 time-travel restore edgecart-d1-staging --timestamp="2026-10-28T14:00:00Z"
```

---

## 7. Tổng kết Đánh giá Mức độ Sẵn sàng (Go-Live Readiness Sign-off)

1. **Bảo mật Secrets:** Đã loại bỏ hoàn toàn `JWT_SECRET` khỏi `wrangler.jsonc` và git. Sử dụng Cloudflare Encrypted Secrets (`wrangler secret put`).
2. **CORS Nghiêm ngặt:** Chặn tuyệt đối các domain `*.pages.dev` tùy tiện bên ngoài. Chỉ chấp nhận `c.env.APP_URL`, `http://localhost:5173`, `http://localhost:3000`, `*.edgecart.com` và dự án chính thức `*.edgecart-frontend.pages.dev`.
3. **Cơ sở dữ liệu:** 14 bảng, 15 chỉ mục, migration an toàn với `CREATE TABLE/INDEX IF NOT EXISTS`, tuyệt đối không có câu lệnh phá hủy dữ liệu.
4. **Trạng thái:** Dự án **ở trạng thái sẵn sàng 100%**. Chờ thông tin tài khoản Cloudflare và xác nhận từ bạn để tiến hành khởi tạo!
