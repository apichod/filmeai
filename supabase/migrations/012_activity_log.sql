-- Journal d'activité
CREATE TABLE IF NOT EXISTS public.activity_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID      NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_email    TEXT,
  action        TEXT        NOT NULL,
  target_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_log_org_created
  ON public.activity_log (organization_id, created_at DESC);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read activity"
  ON public.activity_log FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );
