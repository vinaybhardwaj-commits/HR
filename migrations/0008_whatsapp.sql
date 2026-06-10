-- 0008_whatsapp: Twilio WhatsApp distribution — appraiser phone + send log
-- (employee.phone already exists from 0001)
ALTER TABLE appraiser ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS wa_send_log (
  id serial PRIMARY KEY,
  cycle_id int NOT NULL REFERENCES cycle(id),
  recipient_role text NOT NULL CHECK (recipient_role IN ('employee','hod')),
  holder_id int NOT NULL,
  recipient_name text NOT NULL,
  phone text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('invite','reminder')),
  message_sid text,
  status text NOT NULL DEFAULT 'queued',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_send_cycle ON wa_send_log(cycle_id);
CREATE INDEX IF NOT EXISTS idx_wa_send_sid ON wa_send_log(message_sid);
