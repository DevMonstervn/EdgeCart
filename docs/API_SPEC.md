# API Specification Document - EdgeCart (Hono.js Edge API)

## 1. Chuẩn Thiết kế API & Quy ước Chung (Design Conventions)

- **Base Path**: `/api/v1`
- **Protocol**: HTTPS / HTTP/3
- **Định dạng dữ liệu**: `application/json; charset=utf-8`
- **Headers Chuẩn**:
  - `Authorization`: `Bearer <Access_Token>` (dành cho authenticated routes).
  - `Idempotency-Key`: Chuỗi UUIDv4 (bắt buộc cho `POST /checkout` và `POST /inventory/adjust`).
  - `X-Request-Id`: UUID tạo tại Edge PoP phục vụ việc tracing và debug log.

### 1.1 Cấu trúc Phản hồi Chuẩn (Response Envelope)

#### Thành công (Success Response):
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 128,
    "totalPages": 7
  }
}
```

#### Lỗi (Error Response - RFC 7807 Compliant):
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Sản phẩm Áo Thun Trắng (Size L) chỉ còn 2 sản phẩm trong kho.",
    "details": [
      {
        "field": "items[0].quantity",
        "requested": 5,
        "available": 2
      }
    ]
  }
}
```

---

## 2. Bảng Danh mục Mã lỗi (Error Codes Dictionary)

| HTTP Status | Error Code | Ý nghĩa / Ngữ cảnh |
| :--- | :--- | :--- |
| **400** | `BAD_REQUEST` | Tham số query hoặc request body không đúng định dạng. |
| **401** | `AUTH_UNAUTHORIZED` | Thiếu token hoặc token không hợp lệ. |
| **401** | `AUTH_TOKEN_EXPIRED` | Access Token đã hết hạn (Client cần gọi `/auth/refresh`). |
| **401** | `AUTH_INVALID_CREDENTIALS` | Sai email hoặc mật khẩu đăng nhập. |
| **403** | `FORBIDDEN_ACCESS` | Người dùng không đủ quyền truy cập (Role không khớp). |
| **404** | `RESOURCE_NOT_FOUND` | Không tìm thấy sản phẩm, danh mục hoặc đơn hàng tương ứng. |
| **409** | `CONFLICT_EMAIL_EXISTS` | Email đăng ký đã tồn tại trong hệ thống. |
| **409** | `INSUFFICIENT_STOCK` | Tồn kho không đủ để đáp ứng số lượng đặt hàng. |
| **409** | `IDEMPOTENCY_LOCKED` | Giao dịch với Idempotency-Key này đang trong tiến trình xử lý. |
| **422** | `VALIDATION_ERROR` | Lỗi kiểm tra dữ liệu đầu vào (Zod Schema validation failed). |
| **429** | `RATE_LIMIT_EXCEEDED` | Vượt quá số lượng request cho phép tại điểm biên (Edge Rate Limiter). |
| **500** | `INTERNAL_SERVER_ERROR` | Lỗi máy chủ hoặc ngoại lệ hệ thống không mong muốn. |

---

## 3. Đặc tả Chi tiết các Nhóm Endpoints

### 3.1 Nhóm Xác thực (Authentication API)

#### `POST /api/v1/auth/register`
- **Mục đích**: Đăng ký tài khoản khách hàng mới.
- **Request Body**:
  ```json
  {
    "email": "customer@example.com",
    "password": "StrongPassword123!",
    "fullName": "Nguyễn Văn A",
    "phone": "0912345678"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "usr_01HZX876ABC",
        "email": "customer@example.com",
        "fullName": "Nguyễn Văn A",
        "role": "CUSTOMER"
      },
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi..."
    }
  }
  ```

#### `POST /api/v1/auth/login`
- **Mục đích**: Đăng nhập hệ thống (Storefront & Admin Portal).
- **Request Body**:
  ```json
  {
    "email": "customer@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "usr_01HZX876ABC",
        "email": "customer@example.com",
        "fullName": "Nguyễn Văn A",
        "role": "CUSTOMER"
      },
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi..."
    }
  }
  ```

#### `POST /api/v1/auth/refresh`
- **Mục đích**: Làm mới Access Token khi hết hạn mà không bắt người dùng đăng nhập lại.
- **Request Body**:
  ```json
  {
    "refreshToken": "eyJhbGciOi..."
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "eyJhbGciOi..."
    }
  }
  ```

#### `POST /api/v1/auth/logout`
- **Mục đích**: Thu hồi phiên đăng nhập (vô hiệu hóa Refresh Token trong KV).
- **Headers**: `Authorization: Bearer <Token>`
- **Response (200 OK)**: `{ "success": true, "message": "Đăng xuất thành công" }`

---

### 3.2 Nhóm Danh mục & Sản phẩm (Catalog API - Public Storefront)

#### `GET /api/v1/categories`
- **Mục đích**: Lấy toàn bộ cây danh mục phục vụ Menu / Navigation. Phản hồi được cache tại Edge.
- **Headers Response**: `Cache-Control: public, max-age=60, s-maxage=1800`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "cat_01",
        "name": "Thời Trang Nam",
        "slug": "thoi-trang-nam",
        "children": [
          { "id": "cat_02", "name": "Áo Thun", "slug": "ao-thun" },
          { "id": "cat_03", "name": "Quần Jeans", "slug": "quan-jeans" }
        ]
      }
    ]
  }
  ```

#### `GET /api/v1/products`
- **Mục đích**: Tìm kiếm, lọc và phân trang danh sách sản phẩm.
- **Query Parameters**:
  - `category`: Slug của danh mục (e.g. `ao-thun`).
  - `q`: Từ khóa tìm kiếm (e.g. `cotton`).
  - `minPrice`, `maxPrice`: Lọc theo khoảng giá (VNĐ).
  - `sort`: `price_asc` | `price_desc` | `newest` | `popular`.
  - `page`: Số trang (mặc định 1).
  - `limit`: Số bản ghi mỗi trang (mặc định 20, max 50).
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "prd_01",
        "name": "Áo Thun Basic Cotton",
        "slug": "ao-thun-basic-cotton",
        "basePrice": 250000,
        "salePrice": 199000,
        "thumbnail": "https://cdn.edgecart.com/products/ao-thun-1.webp",
        "hasStock": true
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 }
  }
  ```

#### `GET /api/v1/products/:slug`
- **Mục đích**: Lấy chi tiết toàn bộ thông tin sản phẩm, danh sách biến thể (SKU) và album ảnh.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "prd_01",
      "name": "Áo Thun Basic Cotton",
      "slug": "ao-thun-basic-cotton",
      "description": "Chất liệu 100% cotton thoáng mát...",
      "contentMarkdown": "## Chi tiết sản phẩm...",
      "category": { "id": "cat_02", "name": "Áo Thun", "slug": "ao-thun" },
      "images": [
        { "id": "img_01", "url": "https://cdn.edgecart.com/p1.webp", "alt": "Mặt trước" }
      ],
      "variants": [
        {
          "id": "var_01",
          "sku": "AT-DEN-M",
          "title": "Đen / M",
          "options": { "Color": "Đen", "Size": "M" },
          "price": 199000,
          "compareAtPrice": 250000,
          "stockQuantity": 15
        }
      ]
    }
  }
  ```

---

### 3.3 Nhóm Giỏ hàng (Cart API)

#### `GET /api/v1/cart`
- **Headers**: `Authorization: Bearer <Token>` (hoặc session cookie).
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "crt_01",
      "items": [
        {
          "id": "cit_01",
          "variantId": "var_01",
          "productName": "Áo Thun Basic Cotton",
          "variantTitle": "Đen / M",
          "unitPrice": 199000,
          "quantity": 2,
          "totalPrice": 398000,
          "currentStock": 15
        }
      ],
      "subtotal": 398000,
      "totalItems": 2
    }
  }
  ```

#### `POST /api/v1/cart/items`
- **Request Body**:
  ```json
  {
    "variantId": "var_01",
    "quantity": 1
  }
  ```
- **Response (200 OK)**: Trả về trạng thái giỏ hàng mới nhất.

#### `POST /api/v1/cart/merge`
- **Mục đích**: Gộp giỏ hàng từ LocalStorage khi khách đăng nhập.
- **Request Body**:
  ```json
  {
    "guestItems": [
      { "variantId": "var_01", "quantity": 2 },
      { "variantId": "var_02", "quantity": 1 }
    ]
  }
  ```
- **Response (200 OK)**: Trả về giỏ hàng hợp nhất.

---

### 3.4 Nhóm Checkout & Đơn hàng (Checkout & Orders API)

#### `POST /api/v1/checkout`
- **Headers**:
  - `Authorization: Bearer <Token>`
  - `Idempotency-Key: 7b34b9d0-23b9-4fa2-8b4b-9e4b60e657c1` (Bắt buộc)
- **Request Body**:
  ```json
  {
    "shippingAddress": {
      "recipientName": "Nguyễn Văn A",
      "phone": "0912345678",
      "province": "Hà Nội",
      "district": "Cầu Giấy",
      "ward": "Dịch Vọng",
      "streetAddress": "Số 123 Đường Cầu Giấy"
    },
    "paymentMethod": "VNPAY",
    "notes": "Giao giờ hành chính"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "orderId": "ord_01HZX989712",
      "orderNumber": "EC-20261028-0042",
      "totalAmount": 398000,
      "paymentMethod": "VNPAY",
      "paymentUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?..."
    }
  }
  ```

#### `GET /api/v1/orders`
- **Mục đích**: Lịch sử đơn hàng của khách hàng hiện tại.
- **Response (200 OK)**: Danh sách đơn hàng sắp xếp `created_at DESC`.

#### `POST /api/v1/orders/:id/cancel`
- **Mục đích**: Khách hàng hủy đơn (chỉ khả dụng khi trạng thái là `PENDING` hoặc `CONFIRMED`).
- **Response (200 OK)**: Trả về thông báo hủy thành công và hoàn trả tồn kho tự động trong D1.

---

### 3.5 Nhóm Tải lên Tệp tin (Cloudflare R2 Direct Upload API)

#### `POST /api/v1/uploads/presigned-url`
- **Headers**: `Authorization: Bearer <Token>` (Role: Admin / Staff)
- **Request Body**:
  ```json
  {
    "fileName": "product-image.webp",
    "contentType": "image/webp",
    "fileSize": 245000
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "uploadUrl": "https://r2.edgecart.com/products/2026/10/img_uuid.webp?X-Amz-Signature=...",
      "publicUrl": "https://cdn.edgecart.com/products/2026/10/img_uuid.webp",
      "r2Key": "products/2026/10/img_uuid.webp"
    }
  }
  ```

---

### 3.6 Nhóm Quản trị (Admin Portal API)

- `GET /api/v1/admin/dashboard/stats`: Thống kê doanh thu, đơn hàng, biểu đồ tăng trưởng.
- `GET /api/v1/admin/products`: Danh sách sản phẩm đầy đủ giá vốn, tồn kho, trạng thái.
- `POST /api/v1/admin/products`: Tạo mới sản phẩm và các biến thể SKU.
- `PUT /api/v1/admin/products/:id`: Chỉnh sửa sản phẩm và tự động xóa KV cache liên quan.
- `DELETE /api/v1/admin/products/:id`: Xóa mềm sản phẩm (`is_active = 0`).
- `GET /api/v1/admin/orders`: Quản lý toàn bộ danh sách đơn hàng với bộ lọc trạng thái.
- `PATCH /api/v1/admin/orders/:id/status`: Chuyển đổi trạng thái đơn (`PENDING` -> `CONFIRMED` -> `SHIPPING` -> `DELIVERED`).
- `POST /api/v1/admin/inventory/adjust`: Điều chỉnh tồn kho thủ công (ghi nhận vào `inventory_logs`).
