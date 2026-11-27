-- EdgeCart Migration 0004: Add address label for Vietnam address management
-- Purely additive: alters addresses table without table recreation or data loss.

ALTER TABLE addresses ADD COLUMN label TEXT DEFAULT 'HOME';
