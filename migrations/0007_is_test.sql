-- 0007_is_test: cycle-level test/sandbox flag (B5)
-- Test cycles are excluded from dashboard counts and report defaults, and can be purged.
ALTER TABLE cycle ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
