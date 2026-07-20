-- ── 038_cleanup_legacy_workflows.sql ─────────────────────────────────────────
-- Supprime les anciens slugs legacy et renomme split_v2 → u01_split_return_order
-- RÈGLE : ne jamais modifier un ancien fichier de migration — toujours créer un
--         nouveau fichier. Sinon Supabase détecte le changement de hash et re-exécute.
-- ─────────────────────────────────────────────────────────────────────────────

-- Supprimer les workflows legacy (anciens slugs remplacés par la nomenclature R/U)
DELETE FROM return_workflows
WHERE slug IN (
  'late',
  'late_returned',
  'late_partial',
  'missing',
  'damage',
  'split'
);

-- Renommer split_v2 → u01_split_return_order (si pas encore fait)
UPDATE return_workflows
SET
  slug       = 'u01_split_return_order',
  name       = 'U01 – Utilitaire – Séparer une commande en deux',
  updated_at = NOW()
WHERE slug = 'split_v2';
