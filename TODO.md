# EdgeCart Project Tasks & Implementation Tracker

## Giai đoạn 1: Khởi tạo Nền tảng & Cấu hình Monorepo (Hoàn thành)
- [x] Thiết lập pnpm workspace (`pnpm-workspace.yaml`, root `package.json`, `.gitignore`).
- [x] Cấu hình chia sẻ TypeScript base (`packages/tsconfig/base.json`).
- [x] Tạo gói chia sẻ `@edgecart/shared` (Zod schemas, Constants, TypeScript DTOs).
- [x] Khởi tạo Edge Worker API Hono.js (`apps/api`) với `wrangler.jsonc`.
- [x] Thiết lập schema migration Cloudflare D1 (`apps/api/migrations/0001_initial_schema.sql`).
- [x] Xây dựng các tiện ích Edge: WebCrypto PBKDF2 Password Hashing, JWT HMAC-SHA256, Middlewares (CORS, Error, Auth).
- [x] Viết unit tests cho crypto, JWT và health check endpoint.
- [x] Chạy migration D1 thành công 36 câu lệnh trên local SQLite.

---

## Triển khai Ứng dụng Frontend Riêng biệt (`frontend/`) (Hoàn thành)
- [x] Thiết lập Vue 3, TypeScript, Vite, Tailwind CSS, Pinia, Vue Router, Axios tại `frontend/`.
- [x] Kiến trúc API Client tầng Service (`services/api.ts` với `VITE_API_BASE_URL`, interceptor tự động nạp Bearer token & refresh token khi 401).
- [x] Xây dựng đầy đủ các Service module: `auth.service.ts`, `product.service.ts`, `cart.service.ts`, `order.service.ts`, `admin.service.ts`, `upload.service.ts`.
- [x] Quản lý State với Pinia: `auth.ts`, `cart.ts` (đồng bộ giỏ hàng, tính ngưỡng free shipping, optimistic updates), `toast.ts`.
- [x] Thiết kế Mobile-First Layouts:
  - `DefaultLayout.vue` với `Navbar.vue` và `MobileBottomNav.vue` (thanh điều hướng dưới tối ưu cho smartphone).
  - `AuthLayout.vue` tinh gọn cho Đăng nhập / Đăng ký.
  - `AdminLayout.vue` sidebar quản trị với responsive drawer cho tablet/mobile.
- [x] Xây dựng đầy đủ 10 trang giao diện chính:
  - `HomePage.vue`: Hero banner, giá trị cốt lõi, danh mục, sản phẩm nổi bật, trạng thái loading/empty.
  - `ProductsPage.vue`: Tìm kiếm từ khóa, faceted filter theo danh mục/khoảng giá, sắp xếp, drawer bộ lọc mobile, phân trang.
  - `ProductDetailPage.vue`: Gallery ảnh thumbnail, bộ chọn biến thể (SKU), hiển thị tồn kho thời gian thực, bộ chọn số lượng, thêm vào giỏ hàng.
  - `CartPage.vue`: Bảng sản phẩm, thanh tiến trình miễn phí vận chuyển, nút tăng giảm số lượng, xóa sản phẩm, tính tổng tiền.
  - `CheckoutPage.vue`: Form địa chỉ nhận hàng với validation chuẩn Việt Nam, bộ chọn thanh toán (COD, VNPAY, MOMO, STRIPE, BANK_TRANSFER), header `Idempotency-Key` chống trùng lặp đơn hàng, màn hình thành công.
  - `LoginPage.vue`: Form đăng nhập với validation, ghi nhớ phiên, tự động merge giỏ hàng khách vãng lai sau đăng nhập.
  - `RegisterPage.vue`: Form đăng ký thành viên với kiểm tra khớp mật khẩu.
  - `ProfilePage.vue`: Thông tin tài khoản cá nhân, vai trò phân quyền (Role badge), quản lý sổ địa chỉ giao hàng.
  - `OrdersPage.vue`: Danh sách đơn hàng với status badge (Chờ duyệt, Đang giao, Đã giao, Đã hủy), xem chi tiết modal, hủy đơn hàng PENDING.
  - `AdminDashboardPage.vue`: Thống kê doanh thu, đơn hàng, tồn kho cảnh báo thấp, bảng đơn hàng gần nhất.
  - `AdminProductsPage.vue`: Danh sách sản phẩm, tạo sản phẩm mới, xóa sản phẩm.
  - `AdminOrdersPage.vue`: Quản trị tất cả đơn hàng, đổi trạng thái đơn kèm ghi chú lịch sử.
  - `AdminInventoryPage.vue`: Theo dõi số lượng tồn từng SKU, modal nhập/xuất/điều chỉnh kho ghi sổ cái.
  - `NotFoundPage.vue`: Trang 404 thân thiện.
- [x] Viết Unit Tests (`tests/cart.store.test.ts`, `tests/empty-state.test.ts`, `tests/product-card.test.ts`). Đạt 8/8 tests passed.
- [x] Kiểm tra Typecheck (`vue-tsc --noEmit`), Build bundle tối ưu (initial JS ~13KB gzip, code-splitting toàn bộ routes).

---

## Giai đoạn 2: Backend Edge API D1 Repositories & KV Cache (Hoàn thành)
- [x] Xây dựng D1 Repositories cho Categories và Products trong `apps/api`.
- [x] Triển khai Hono REST API:
  - [x] `GET /api/v1/categories` (Hierarchical tree & KV cache với TTL)
  - [x] `GET /api/v1/products` (Faceted search, filter khoảng giá, sort, pagination)
  - [x] `GET /api/v1/products/:slug` (Product detail với biến thể variants & images)
  - [x] `POST /api/v1/uploads/presigned-url` (Tạo presigned URL upload lên Cloudflare R2)

---

## Giai đoạn 3: Backend Auth, KV Session & Cart API (Hoàn thành)
- [x] API Đăng ký, Đăng nhập, Profile (`/api/v1/auth/*`).
- [x] Quản lý phiên và blacklist thu hồi token trong Cloudflare KV.
- [x] API Giỏ hàng trên D1 (`/api/v1/cart/*`) và kiểm soát tồn kho tối đa khi thêm vào giỏ.

---

## Giai đoạn 4: Backend Atomic Checkout & Flash-Sale Concurrency (Hoàn thành)
- [x] Header `Idempotency-Key` với Cloudflare KV chống duplicate order và trừ tiền đúp.
- [x] Atomic conditional `UPDATE variants SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?` chống over-selling trong `db.batch([...])`.
- [x] Ghi nhận sổ cái `inventory_logs` với type `ORDER_RESERVED`.
- [x] API Checkout (`POST /api/v1/checkout`) và quản lý đơn hàng (`/api/v1/orders/*`).
- [x] API Admin (`/api/v1/admin/*`): Dashboard thống kê, CRUD sản phẩm, cập nhật trạng thái đơn, điều chỉnh tồn kho.

---

## Giai đoạn 5: Toàn diện Kiểm thử & Đảm bảo Chất lượng (QA Verification) (Hoàn thành)
- [x] Viết 28 integration tests cho Backend API (`apps/api/tests/`):
  - [x] `crypto.test.ts` (2 tests - WebCrypto PBKDF2)
  - [x] `jwt.test.ts` (3 tests - HMAC-SHA256)
  - [x] `health.test.ts` (2 tests - Health check & 404 handler)
  - [x] `auth.test.ts` (6 tests - Register, Duplicate email, Login, Profile, 401 unauthorized)
  - [x] `catalog-kv.test.ts` (4 tests - Categories, KV cache hit/miss, Faceted search, Product detail slug)
  - [x] `cart.test.ts` (4 tests - Cart init, Add item, Stock ceiling limit, Quantity update, Delete item)
  - [x] `checkout-concurrency.test.ts` (3 tests - Atomic checkout, Idempotency duplicate protection, Concurrency flash-sale race condition prevention)
  - [x] `security.test.ts` (4 tests - SQL Injection neutralization, RFC 7807 422 validation, RBAC admin enforcement, CORS & Security headers)
- [x] Viết 8 frontend component & store tests (`frontend/tests/`):
  - [x] `cart.store.test.ts` (4 tests)
  - [x] `empty-state.test.ts` (2 tests)
  - [x] `product-card.test.ts` (2 tests)
- [x] Chạy kiểm tra Typecheck toàn diện (`pnpm run typecheck`): 5/5 packages thành công 0 lỗi.
- [x] Chạy kiểm tra Linting (`pnpm run lint`): Thành công.
- [x] Chạy production build (`pnpm run build`): Thành công 100%, bundle tối ưu (~13KB initial JS).
- [x] Tạo tài liệu báo cáo chất lượng chi tiết tại `docs/QA_REPORT.md`.

---

## Giai đoạn 6: Triển khai Staging & Tối ưu Biên (Chờ phê duyệt)
- [ ] Cấu hình Cloudflare Turnstile CAPTCHA sitekey/secret khi có credentials.
- [ ] Rate Limiting Middleware tại Edge với Cloudflare KV.
- [ ] Webhook HMAC signature verification cho cổng thanh toán thật (VNPay/Stripe).
- [ ] Triển khai lên Cloudflare Workers (API) & Cloudflare Pages (Frontend) môi trường Staging (`--env staging`).
