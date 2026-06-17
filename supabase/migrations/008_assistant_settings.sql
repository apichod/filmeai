-- Migration 008: assistant_settings
CREATE TABLE IF NOT EXISTS public.assistant_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Apparence
  primary_color       TEXT    NOT NULL DEFAULT '#000000',
  bubble_icon         TEXT    NOT NULL DEFAULT 'bubble',
  position            TEXT    NOT NULL DEFAULT 'right',
  size                TEXT    NOT NULL DEFAULT 'standard',
  assistant_name      TEXT    NOT NULL DEFAULT 'FilmeAI',
  show_teaser         BOOLEAN NOT NULL DEFAULT false,
  teaser_text         TEXT    NOT NULL DEFAULT '',
  teaser_delay        INTEGER NOT NULL DEFAULT 2,
  attract_attention   BOOLEAN NOT NULL DEFAULT false,
  show_branding       BOOLEAN NOT NULL DEFAULT true,

  -- Comportement
  language            TEXT    NOT NULL DEFAULT 'fr',
  greeting_message    TEXT    NOT NULL DEFAULT '',
  internal_persona    TEXT    NOT NULL DEFAULT '',
  forbidden_topics    TEXT[]  NOT NULL DEFAULT '{}',

  -- Conditions
  delivery_enabled    BOOLEAN  NOT NULL DEFAULT false,
  delivery_pricing    TEXT     NOT NULL DEFAULT 'fixed',
  round_trip          BOOLEAN  NOT NULL DEFAULT true,
  delivery_fee        NUMERIC  NOT NULL DEFAULT 0,
  delivery_zones      TEXT[]   NOT NULL DEFAULT '{}',
  booking_delay       TEXT     NOT NULL DEFAULT '24h',
  payment_methods     TEXT[]   NOT NULL DEFAULT '{}',

  -- Devis
  quote_mode          TEXT    NOT NULL DEFAULT 'validation',
  out_of_stock        TEXT    NOT NULL DEFAULT 'devis_validation',
  upsell_mode         TEXT    NOT NULL DEFAULT 'disabled',
  accessories_mode    TEXT    NOT NULL DEFAULT 'disabled',
  list_mode           TEXT    NOT NULL DEFAULT 'assistant',

  -- Intégration
  allowed_domains     TEXT[]  NOT NULL DEFAULT '{}',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id)
);

-- RLS
ALTER TABLE public.assistant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can manage assistant_settings" ON public.assistant_settings;
CREATE POLICY "org members can manage assistant_settings"
  ON public.assistant_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);
