-- Migration 011: compatibilité sauvegarde conversations depuis le chat/widget
-- Safe à lancer plusieurs fois dans Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Filme',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.organizations (name)
SELECT 'Filme'
WHERE NOT EXISTS (SELECT 1 FROM public.organizations LIMIT 1);

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'widget',
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stops_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS request_context TEXT,
  ADD COLUMN IF NOT EXISTS quote_status TEXT DEFAULT 'pending_validation',
  ADD COLUMN IF NOT EXISTS quote_items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quote_total NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quote_deposit NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quote_days INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS booqable_order_id TEXT,
  ADD COLUMN IF NOT EXISTS booqable_order_url TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE public.conversations
SET organization_id = (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1)
WHERE organization_id IS NULL;

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversations_organization_idx
  ON public.conversations(organization_id);

CREATE INDEX IF NOT EXISTS conversations_updated_at_idx
  ON public.conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS conversations_contact_email_idx
  ON public.conversations(contact_email);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages(conversation_id, created_at);

NOTIFY pgrst, 'reload schema';
