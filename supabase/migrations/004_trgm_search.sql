-- ─────────────────────────────────────────────────────────────────────────────
-- 004_trgm_search.sql
-- Recherche hybride améliorée : trigram (références produit) + vector + full-text
-- ─────────────────────────────────────────────────────────────────────────────

-- Active pg_trgm pour la correspondance floue sur les références (FX6, 70-200, etc.)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index trigram sur le nom produit
CREATE INDEX IF NOT EXISTS products_name_trgm
  ON products_cache USING GIN (name gin_trgm_ops);

-- Index trigram sur enriched_text (synonymes, usages)
CREATE INDEX IF NOT EXISTS products_enriched_trgm
  ON products_cache USING GIN (enriched_text gin_trgm_ops);

-- ── Fonction hybride améliorée ────────────────────────────────────────────────
-- Combinaison : vector cosinus (45%) + full-text (30%) + trigram (25%)
-- Le trigram est crucial pour les références produit (FX6, 70-200, ATEM, etc.)

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
    AND p.embedding IS NOT NULL
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
