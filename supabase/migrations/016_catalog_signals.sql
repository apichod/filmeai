-- ─────────────────────────────────────────────────────────────────────────────
-- 016_catalog_signals.sql
-- Glossaire/signaux appris : association terme client → produit catalogue.
-- Utilisé pour améliorer l'extraction de listes et le matching catalogue.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  normalized_term TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  confidence NUMERIC(4,3),
  approved BOOLEAN NOT NULL DEFAULT TRUE,
  occurrences INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_signals_unique_alias
  ON public.catalog_signals (organization_id, normalized_term, product_name);

CREATE INDEX IF NOT EXISTS catalog_signals_org_updated
  ON public.catalog_signals (organization_id, updated_at DESC);

ALTER TABLE public.catalog_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members" ON public.catalog_signals;
CREATE POLICY "org members" ON public.catalog_signals USING (
  organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

NOTIFY pgrst, 'reload schema';
