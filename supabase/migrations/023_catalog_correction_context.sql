-- ─────────────────────────────────────────────────────────────────────────────
-- 023_catalog_correction_context.sql
-- Ajoute le contexte global reçu avant extraction dans les logs de correction.
-- Indispensable pour comprendre les erreurs de monture/contexte inter-lignes.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.catalog_correction_events
  ADD COLUMN IF NOT EXISTS request_context TEXT;

CREATE INDEX IF NOT EXISTS catalog_correction_events_context_fts_idx
  ON public.catalog_correction_events
  USING GIN (to_tsvector('french', COALESCE(request_context, '')));

NOTIFY pgrst, 'reload schema';
