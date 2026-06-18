-- FAQ items
CREATE TABLE public.faq_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL DEFAULT '',
  synced      BOOLEAN NOT NULL DEFAULT false,
  position    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX faq_items_org ON public.faq_items (organization_id, position);
ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members" ON public.faq_items USING (
  organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

-- Knowledge URLs (crawl ciblé)
CREATE TABLE public.knowledge_urls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  title       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | crawling | done | error
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX knowledge_urls_org ON public.knowledge_urls (organization_id, created_at DESC);
ALTER TABLE public.knowledge_urls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members" ON public.knowledge_urls USING (
  organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);
