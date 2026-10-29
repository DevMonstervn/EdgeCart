-- EdgeCart Migration 0003: Additive user avatar URL
-- Purely additive: alters users table without table recreation or data loss.

ALTER TABLE users ADD COLUMN avatar_url TEXT;
