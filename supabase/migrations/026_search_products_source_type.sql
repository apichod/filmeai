-- Ajoute source_type dans la fonction search_products
-- pour distinguer product_group et bundle dans les résultats de recherche.

DROP FUNCTION IF EXISTS search_products(text, vector, integer);

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
  source_type   TEXT,
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
    p.source_type,
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
