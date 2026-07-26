-- Table des catégories parent du chat (niveau 1)
-- Chaque chat_type (retours, planning) a ses propres catégories

CREATE TABLE IF NOT EXISTS chat_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_type   text NOT NULL,           -- 'retours' | 'planning'
  label       text NOT NULL,           -- affiché dans l'interface
  key         text NOT NULL,           -- identifiant slug (ex: 'retard')
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_type, key)
);

-- Seed des catégories retours (actuellement hardcodées dans returns/page.tsx)
INSERT INTO chat_categories (chat_type, label, key, sort_order) VALUES
  ('retours', 'Retard',               'retard',  1),
  ('retours', 'Perte',                'perte',   2),
  ('retours', 'Vol',                  'vol',     3),
  ('retours', 'Dommage',              'dommage', 4),
  ('retours', 'Séparer 2 problèmes', 'split',   5)
ON CONFLICT (chat_type, key) DO NOTHING;
