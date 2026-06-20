-- ─────────────────────────────────────────────────────────────────────────────
-- 022_catalog_correction_events.sql
-- Journal d'apprentissage : diagnostic IA + correction humaine/client.
-- Sert à analyser les erreurs du moteur de matching sans perdre le contexte.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_correction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  source TEXT NOT NULL DEFAULT 'unknown',
  correction_type TEXT NOT NULL,

  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  quote_draft_id UUID,
  quote_item_uid TEXT,

  requested_text TEXT,
  matching_raw TEXT,
  search_query TEXT,
  section TEXT,
  quantity INTEGER,

  ai_selected_product_id TEXT,
  ai_selected_product_name TEXT,
  ai_confidence NUMERIC(5,4),
  ai_selected_by TEXT,
  ai_reason TEXT,

  corrected_product_id TEXT,
  corrected_product_name TEXT,

  diagnostic JSONB,
  candidates JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_correction_events_org_created_idx
  ON public.catalog_correction_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS catalog_correction_events_requested_fts_idx
  ON public.catalog_correction_events
  USING GIN (to_tsvector('french', COALESCE(requested_text, '') || ' ' || COALESCE(search_query, '')));

CREATE INDEX IF NOT EXISTS catalog_correction_events_diagnostic_gin_idx
  ON public.catalog_correction_events USING GIN (diagnostic);

ALTER TABLE public.catalog_correction_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members" ON public.catalog_correction_events;
CREATE POLICY "org members" ON public.catalog_correction_events USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';
