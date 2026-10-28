# EdgeCart ⚡

EdgeCart là nền tảng thương mại điện tử (E-commerce) thế hệ mới được thiết kế hoàn toàn theo kiến trúc **Edge-Native Serverless** trên hạ tầng toàn cầu của Cloudflare.

## 🚀 Công nghệ Sử dụng (Tech Stack)

- **Frontend**: Vue 3 (Composition API, `<script setup>`), TypeScript, Vite, Tailwind CSS, Pinia, Vue Router, TanStack Vue Query.
- **Backend Edge API**: Hono.js trên Cloudflare Workers runtime (V8 Isolates siêu nhẹ, cold-start < 5ms).
- **Database**: Cloudflare D1 (SQLite distributed database tại Edge).
- **Cache & Session**: Cloudflare KV (Độ trễ đọc ~5-15ms tại 330+ PoPs).
- **Object Storage**: Cloudflare R2 (Tương thích S3 API, $0 phí Egress cho hình ảnh sản phẩm).

---

## 📁 Cấu trúc Thư mục Monorepo

```
EdgeCart/
├── apps/
│   ├── api/               # Hono.js Edge Worker API (Cloudflare Workers)
│   │   ├── migrations/    # Cloudflare D1 SQLite Migrations
│   │   ├── src/           # Controllers, Services, Middlewares, WebCrypto
│   │   └── wrangler.jsonc # Cloudflare Workers bindings (D1, KV, R2)
│   └── web/               # Vue 3 SPA Storefront & Admin Portal (Cloudflare Pages)
│       └── src/           # Components, Pages, Stores (Pinia), Router
├── packages/
│   ├── shared/            # DTOs, Zod Schemas, Constants dùng chung
│   └── tsconfig/          # Cấu hình TypeScript cơ sở
├── docs/                  # Toàn bộ tài liệu Thiết kế & Đặc tả Kỹ thuật
│   ├── PRD.md             # Product Requirements Document
│   ├── ARCHITECTURE.md    # System Architecture & Flow Diagrams
│   ├── DATABASE.md        # D1 Database Schema, ERD & Indexing Strategy
│   ├── API_SPEC.md        # REST API Specification (RFC 7807)
│   ├── TEST_PLAN.md       # Edge Testing Strategy (Vitest, Miniflare, Playwright)
│   ├── IMPLEMENTATION_PLAN.md # Roadmap & Multi-Environment Strategy
│   ├── QA_REPORT.md           # Báo cáo Kiểm thử Chất lượng (36/36 tests passed)
│   └── DEPLOYMENT_PLAN.md     # Kế hoạch Triển khai Cloudflare & Quy trình Rollback
├── frontend/                  # Vue 3 SPA Storefront & Admin Portal (Cloudflare Pages)
└── TODO.md                    # Tiến độ thực hiện theo từng giai đoạn
```

---

## 🛠️ Hướng dẫn Khởi chạy (Local Development)

### Yêu cầu Tiên quyết
- Node.js >= 20
- pnpm >= 10
- Cloudflare Wrangler CLI (đã tích hợp sẵn qua pnpm dependencies)

### Cài đặt Dependencies
```bash
pnpm install
```

### Chạy Local D1 Migrations
```bash
pnpm --filter @edgecart/api db:migrate:local
```

### Chạy Môi trường Phát triển (API & Web song song)
```bash
pnpm dev
# Frontend: http://localhost:5173
# Backend API: http://localhost:8787
```

### Chạy Kiểm thử & Build
```bash
# Kiểm tra TypeScript toàn bộ monorepo (0 errors)
pnpm run typecheck

# Chạy Unit & Integration Tests (36 tests passed)
pnpm run test

# Kiểm tra cú pháp và kiểu dữ liệu
pnpm run lint

# Build đóng gói Production
pnpm run build
```

---

## ☁️ Quy trình Triển khai Cloudflare (Deployment Guide)

Chi tiết quy trình xem tại [DEPLOYMENT_PLAN.md](file:///d:/EdgeCart/docs/DEPLOYMENT_PLAN.md).

### 1. Đăng nhập Cloudflare CLI
```bash
pnpm --filter @edgecart/api exec wrangler login
```

### 2. Triển khai Môi trường Staging
```bash
# 1. Áp dụng migration lên D1 Staging từ xa
pnpm --filter @edgecart/api run db:migrate:staging

# 2. Cài đặt JWT_SECRET cho Staging (Không lưu vào git)
pnpm --filter @edgecart/api exec wrangler secret put JWT_SECRET --env staging

# 3. Deploy Backend API Worker lên Staging
pnpm --filter @edgecart/api run deploy:staging

# 4. Build và Deploy Frontend lên Cloudflare Pages Staging
pnpm --filter @edgecart/frontend run deploy:staging
```

### 3. Triển khai Môi trường Production (Chỉ thực hiện khi có xác nhận)
```bash
# 1. Áp dụng migration lên D1 Production từ xa
pnpm --filter @edgecart/api run db:migrate:prod

# 2. Cài đặt JWT_SECRET cho Production
pnpm --filter @edgecart/api exec wrangler secret put JWT_SECRET

# 3. Deploy Backend Worker Production
pnpm --filter @edgecart/api run deploy

# 4. Deploy Frontend lên Cloudflare Pages Production
pnpm --filter @edgecart/frontend run deploy:prod
```

---

## 🔄 Quy trình Phục hồi Sự cố (Rollback Procedures)

- **Rollback Frontend (Cloudflare Pages):** Vào Cloudflare Dashboard -> **Compute (Workers & Pages)** -> `edgecart-frontend` -> **Deployments** -> Bấm vào bản deploy ổn định trước đó -> Chọn **Rollback to this deployment** (hoặc redeploy commit trước).
- **Rollback Backend Worker:** `pnpm --filter @edgecart/api exec wrangler rollback <VERSION_ID> --env staging` (hoặc bỏ `--env staging` cho Production).
- **Tạo Snapshot D1 trước Migration:** `pnpm --filter @edgecart/api exec wrangler d1 backup create edgecart-d1-staging`
- **Khôi phục D1 từ Backup Snapshot:** `pnpm --filter @edgecart/api exec wrangler d1 backup restore edgecart-d1-staging <BACKUP_ID>`
- **Khôi phục D1 theo Điểm thời gian (Time Travel):** `pnpm --filter @edgecart/api exec wrangler d1 time-travel restore edgecart-d1-staging --timestamp="<RFC3339_TIMESTAMP>"`
