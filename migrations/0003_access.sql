-- 0003_access: tokens, email log, audit log
CREATE TABLE IF NOT EXISTS token (
  id serial PRIMARY KEY,
  token_hash text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('employee','hod')),
  holder_type text NOT NULL CHECK (holder_type IN ('employee','appraiser')),
  holder_id int NOT NULL,
  cycle_id int NOT NULL REFERENCES cycle(id),
  label text,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_hash ON token(token_hash);

CREATE TABLE IF NOT EXISTS email_log (
  id serial PRIMARY KEY,
  appraisal_id text REFERENCES appraisal(id),
  recipient text NOT NULL,
  kind text NOT NULL,
  resend_id text,
  status text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_appraisal ON email_log(appraisal_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id serial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL CHECK (actor_type IN ('admin','employee','hod','system')),
  actor_label text,
  action text NOT NULL,
  appraisal_id text,
  meta jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_appraisal ON audit_log(appraisal_id);
