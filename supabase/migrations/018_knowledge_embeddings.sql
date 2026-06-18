-- Vectorisation réelle de la base de connaissances (FAQ + pages web ciblées)
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.faq_items
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

ALTER TABLE public.knowledge_urls
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS last_crawled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('faq', 'url', 'file')),
  source_id UUID NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  url TEXT,
  chunk_index INT NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_type, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_org_source_idx
  ON public.knowledge_chunks (organization_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw
  ON public.knowledge_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS knowledge_chunks_fts_idx
  ON public.knowledge_chunks USING GIN (
    to_tsvector('french', COALESCE(title, '') || ' ' || content)
  );

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members" ON public.knowledge_chunks;
CREATE POLICY "org members" ON public.knowledge_chunks USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.search_knowledge(
  query_text TEXT,
  query_embedding vector(1536),
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  source_id UUID,
  title TEXT,
  content TEXT,
  url TEXT,
  similarity FLOAT
)
LANGUAGE sql
STABLE
AS $$
  WITH scored AS (
    SELECT
      kc.id,
      kc.source_type,
      kc.source_id,
      kc.title,
      kc.content,
      kc.url,
      GREATEST(0, 1 - (kc.embedding <=> query_embedding)) AS vector_score,
      CASE
        WHEN query_text IS NULL OR length(trim(query_text)) = 0 THEN 0
        ELSE ts_rank_cd(
          to_tsvector('french', COALESCE(kc.title, '') || ' ' || kc.content),
          websearch_to_tsquery('french', query_text)
        )
      END AS text_score
    FROM public.knowledge_chunks kc
    WHERE kc.embedding IS NOT NULL
  )
  SELECT
    scored.id,
    scored.source_type,
    scored.source_id,
    scored.title,
    scored.content,
    scored.url,
    ((scored.vector_score * 0.75) + (LEAST(scored.text_score, 1) * 0.25))::FLOAT AS similarity
  FROM scored
  WHERE ((scored.vector_score * 0.75) + (LEAST(scored.text_score, 1) * 0.25)) > 0.22
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
