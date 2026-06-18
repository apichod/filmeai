-- ─────────────────────────────────────────────────────────────────────────────
-- 014_assistant_prompt_settings.sql
-- Prompts éditables : chat, extraction de liste, reranking catalogue.
-- À lancer dans Supabase SQL Editor avant de sauvegarder la page Comportement.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.assistant_settings
  ADD COLUMN IF NOT EXISTS chat_system_prompt TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quote_extraction_prompt TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quote_rerank_prompt TEXT NOT NULL DEFAULT '',
  -- Ancien champ conservé pour compatibilité/migration douce.
  ADD COLUMN IF NOT EXISTS quote_backend_prompt TEXT NOT NULL DEFAULT '';

-- Force Supabase/PostgREST à recharger son cache de schéma.
NOTIFY pgrst, 'reload schema';
