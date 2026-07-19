-- ─────────────────────────────────────────────────────────────────────────────
-- 033_email_templates_slug.sql
-- Ajout d'un slug éditable par variante de template email
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS slug TEXT;
