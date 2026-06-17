-- 005_quote_details.sql
-- Full conversations schema patch for structured quote/request storage.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS booqable_order_id TEXT,
  ADD COLUMN IF NOT EXISTS booqable_order_url TEXT,
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
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS conversations_contact_email_idx
  ON public.conversations(contact_email);

CREATE INDEX IF NOT EXISTS conversations_status_idx
  ON public.conversations(status);

CREATE INDEX IF NOT EXISTS conversations_quote_status_idx
  ON public.conversations(quote_status);

CREATE INDEX IF NOT EXISTS conversations_starts_at_idx
  ON public.conversations(starts_at);

CREATE INDEX IF NOT EXISTS conversations_expires_at_idx
  ON public.conversations(expires_at);

NOTIFY pgrst, 'reload schema';

-- Organization compatibility for older schema.
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Filme',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.organizations (name)
SELECT 'Filme'
WHERE NOT EXISTS (SELECT 1 FROM public.organizations LIMIT 1);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS organization_id UUID;

UPDATE public.conversations
SET organization_id = (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1)
WHERE organization_id IS NULL;

NOTIFY pgrst, 'reload schema';
