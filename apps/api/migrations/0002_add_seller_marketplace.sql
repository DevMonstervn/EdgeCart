-- EdgeCart Migration 0002: Purely Additive Seller Marketplace Schema
-- Safe for Cloudflare D1: No DROP TABLE, no table recreation, preserves all existing rows, FKs, and indexes.

-- 1. Additive Seller capability flag on users (preserves existing role CHECK & all child table FKs)
ALTER TABLE users ADD COLUMN is_seller INTEGER NOT NULL DEFAULT 0 CHECK (is_seller IN (0, 1));
CREATE INDEX IF NOT EXISTS idx_users_is_seller ON users(is_seller) WHERE is_seller = 1;

-- 2. Stores (each approved Seller owns at most one store)
CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    phone TEXT,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_stores_owner_user_id ON stores(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);

-- 3. Seller Requests (approval workflow: CUSTOMER submits -> SUPER_ADMIN approves or rejects)
CREATE TABLE IF NOT EXISTS seller_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    store_name TEXT NOT NULL,
    store_slug TEXT NOT NULL COLLATE NOCASE,
    store_description TEXT,
    phone TEXT,
    business_email TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    rejection_reason TEXT,
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_seller_requests_user_status ON seller_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_seller_requests_status_created ON seller_requests(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_requests_one_pending_per_user
    ON seller_requests(user_id) WHERE status = 'PENDING';

-- 4. Product ownership (NULL = Admin / Official Platform Product; non-null = Seller Store Product)
ALTER TABLE products ADD COLUMN store_id TEXT REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_store_active ON products(store_id, is_active);

-- 5. Order item store attribution & per-store fulfillment tracking (NULL = Legacy / Admin Official Item)
ALTER TABLE order_items ADD COLUMN store_id TEXT REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (fulfillment_status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPING', 'DELIVERED', 'CANCELLED', 'RETURNED'));
CREATE INDEX IF NOT EXISTS idx_order_items_store_order ON order_items(store_id, order_id);
