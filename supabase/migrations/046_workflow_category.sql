-- Ajoute un champ category aux workflows
-- Valeurs : 'retours' (défaut, existants) | 'planning'

ALTER TABLE return_workflows
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'retours';
