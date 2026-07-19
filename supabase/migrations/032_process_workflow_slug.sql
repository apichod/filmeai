-- Ajoute le lien entre un process et un workflow de retour
ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS workflow_slug text;

COMMENT ON COLUMN processes.workflow_slug IS 'Slug du workflow de retour lié (ex: late, missing, damage). Permet la synchronisation des étapes.';
