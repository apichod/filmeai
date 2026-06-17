-- 005_quote_details.sql
-- Adds structured quote/request fields to conversations so generated quotes
-- can be listed, reopened, edited and displayed like Renkko.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stops_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_status TEXT DEFAULT 'pending_validation',
  ADD COLUMN IF NOT EXISTS request_context TEXT,
  ADD COLUMN IF NOT EXISTS quote_items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quote_total NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quote_deposit NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quote_days INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'backoffice',
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS conversations_quote_status_idx
  ON conversations(quote_status);

CREATE INDEX IF NOT EXISTS conversations_starts_at_idx
  ON conversations(starts_at);

CREATE INDEX IF NOT EXISTS conversations_expires_at_idx
  ON conversations(expires_at);
