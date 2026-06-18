-- ─────────────────────────────────────────────────────────────────────────────
-- 013_products_cache_visibility.sql
-- Rend le cache catalogue explicite : visibilité Booqable + type de ressource.
-- À lancer dans Supabase SQL Editor AVANT la prochaine sync catalogue.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE products_cache
  ADD COLUMN IF NOT EXISTS show_in_store BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE products_cache
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'product_group';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_cache_source_type_check'
  ) THEN
    ALTER TABLE products_cache
      ADD CONSTRAINT products_cache_source_type_check
      CHECK (source_type IN ('product_group', 'bundle'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_cache_visible_idx
  ON products_cache (archived, show_in_store, source_type);

-- Nettoie les anciennes lignes archivées qui donnaient l'impression de doublons.
DELETE FROM products_cache
WHERE archived = TRUE;

-- Recherche hybride : on ne renvoie que les lignes actives ET visibles.
CREATE OR REPLACE FUNCTION search_products(
  query_text      TEXT,
  query_embedding vector(1536),
  match_count     INT DEFAULT 10
)
RETURNS TABLE (
  id            TEXT,
  name          TEXT,
  description   TEXT,
  price_per_day DECIMAL,
  deposit       DECIMAL,
  photo_url     TEXT,
  similarity    FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.name,
    p.description,
    p.price_per_day,
    p.deposit,
    p.photo_url,
    (
      -- 45% similarité cosinus (compréhension sémantique)
      (1 - (p.embedding <=> query_embedding)) * 0.45
      +
      -- 30% full-text search français (sur nom + enriched_text + description)
      LEAST(
        ts_rank(
          to_tsvector('french',
            p.name || ' ' ||
            COALESCE(p.enriched_text, '') || ' ' ||
            COALESCE(p.description, '')
          ),
          websearch_to_tsquery('french', query_text)
        ) * 0.30,
        0.30
      )
      +
      -- 25% trigram (références exactes : FX6, 70-200, ATEM, Profoto B10X…)
      GREATEST(
        similarity(p.name, query_text),
        similarity(COALESCE(p.enriched_text, ''), query_text)
      ) * 0.25
    ) AS similarity
  FROM products_cache p
  WHERE
    p.archived = FALSE
    AND p.show_in_store = TRUE
    AND p.embedding IS NOT NULL
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
