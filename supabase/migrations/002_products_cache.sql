-- ─────────────────────────────────────────────────────────────────────────────
-- 002_products_cache.sql
-- Cache du catalogue Booqable avec embeddings pour recherche hybride
-- ─────────────────────────────────────────────────────────────────────────────

-- pgvector doit être activé dans Supabase Dashboard → Extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Table catalogue ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products_cache (
  id              TEXT PRIMARY KEY,          -- ID Booqable
  name            TEXT NOT NULL,
  description     TEXT,
  price_per_day   DECIMAL(10, 2),
  deposit         DECIMAL(10, 2),
  photo_url       TEXT,
  archived        BOOLEAN DEFAULT FALSE,
  enriched_text   TEXT,                      -- texte concaténé pour embedding
  embedding       vector(1536),              -- text-embedding-3-small
  last_synced_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index HNSW pour la recherche vectorielle (rapide même sur petit catalogue)
CREATE INDEX IF NOT EXISTS products_embedding_hnsw
  ON products_cache USING hnsw (embedding vector_cosine_ops);

-- Index full-text search en français
CREATE INDEX IF NOT EXISTS products_fts
  ON products_cache USING GIN (
    to_tsvector('french', name || ' ' || COALESCE(description, ''))
  );

-- ── Fonction hybrid search ───────────────────────────────────────────────────
-- Combine similarité vectorielle (60%) + full-text search (40%)
-- Utilisation : SELECT * FROM search_products('profoto', '[0.1,0.2,...]', 10)
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
      -- Similarité cosinus (0→1, plus c'est haut plus c'est proche)
      (1 - (p.embedding <=> query_embedding)) * 0.6
      +
      -- Score full-text normalisé
      LEAST(
        ts_rank(
          to_tsvector('french', p.name || ' ' || COALESCE(p.description, '')),
          websearch_to_tsquery('french', query_text)
        ) * 0.4,
        0.4
      )
    ) AS similarity
  FROM products_cache p
  WHERE
    p.archived = FALSE
    AND p.embedding IS NOT NULL
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
