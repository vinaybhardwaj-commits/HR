-- 0006: store AES-256-GCM-encrypted token secret so admins can re-copy links.
-- Lookup remains by sha256 hash; decryption requires the JWT_SECRET-derived key (not in DB).
ALTER TABLE token ADD COLUMN IF NOT EXISTS secret_enc text;
