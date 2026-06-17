-- Migration 009: complète assistant_settings si la table existait déjà
-- À lancer dans Supabase SQL Editor.

ALTER TABLE public.assistant_settings
  ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#000000',
  ADD COLUMN IF NOT EXISTS bubble_icon TEXT NOT NULL DEFAULT 'bubble',
  ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT 'right',
  ADD COLUMN IF NOT EXISTS size TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS assistant_name TEXT NOT NULL DEFAULT 'FilmeAI',
  ADD COLUMN IF NOT EXISTS show_teaser BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS teaser_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS teaser_delay INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS attract_attention BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_branding BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS greeting_message TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS internal_persona TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS forbidden_topics TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_pricing TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS round_trip BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_zones TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS booking_delay TEXT NOT NULL DEFAULT '24h',
  ADD COLUMN IF NOT EXISTS payment_methods TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS quote_mode TEXT NOT NULL DEFAULT 'validation',
  ADD COLUMN IF NOT EXISTS out_of_stock TEXT NOT NULL DEFAULT 'devis_validation',
  ADD COLUMN IF NOT EXISTS upsell_mode TEXT NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS accessories_mode TEXT NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS list_mode TEXT NOT NULL DEFAULT 'assistant',
  ADD COLUMN IF NOT EXISTS allowed_domains TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Si la contrainte unique n'existe pas encore.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assistant_settings_organization_id_key'
      AND conrelid = 'public.assistant_settings'::regclass
  ) THEN
    ALTER TABLE public.assistant_settings
      ADD CONSTRAINT assistant_settings_organization_id_key UNIQUE (organization_id);
  END IF;
END $$;

-- Force Supabase/PostgREST à recharger son cache de schéma.
NOTIFY pgrst, 'reload schema';
