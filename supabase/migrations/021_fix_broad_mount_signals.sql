-- 021_fix_broad_mount_signals.sql
-- À lancer dans Supabase SQL Editor, WITHOUT RLS.
-- Objectif : empêcher les signaux trop larges de forcer une monture ou une série.
-- Important : on NE mappe PAS "24-70 Canon" vers RF ou EF ici.
-- La monture doit être choisie par le reranking en fonction de la caméra présente dans la liste.

-- 1) Désactiver les signaux trop larges : ils court-circuitent le reranking.
UPDATE public.catalog_signals
SET
  approved = FALSE,
  updated_at = NOW()
WHERE lower(regexp_replace(trim(COALESCE(normalized_term, term)), '\s+', ' ', 'g')) IN (
  'canon rf',
  'camera canon rf',
  'caméra canon rf',
  'canon rf camera',
  'canon rf caméra',
  'canon ef',
  'sony fe',
  'sony e',
  'rf',
  'ef',
  'fe'
);

-- Si une version précédente de ce correctif a créé ces signaux trop directifs,
-- on les désactive aussi : “Canon” seul ne choisit pas RF sans contexte.
UPDATE public.catalog_signals
SET
  approved = FALSE,
  updated_at = NOW()
WHERE lower(regexp_replace(trim(COALESCE(normalized_term, term)), '\s+', ' ', 'g')) IN (
  '24-70 canon',
  'canon 24-70'
)
AND product_name = 'Canon RF 24-70mm F2.8L IS USM';

-- 2) Garder uniquement des signaux explicites où la monture est écrite par le client.
WITH org AS (
  SELECT id AS organization_id
  FROM public.organizations
  ORDER BY created_at ASC
  LIMIT 1
), rows(term, product_name, confidence) AS (
  VALUES
    ('blackmagic 6k pro', 'Blackmagic Pocket Cinema Camera 6K Pro – pack essentiel', 0.990),
    ('bmpcc 6k pro', 'Blackmagic Pocket Cinema Camera 6K Pro – pack essentiel', 0.990),

    -- RF explicite uniquement.
    ('24-70 rf', 'Canon RF 24-70mm F2.8L IS USM', 0.990),
    ('rf 24-70', 'Canon RF 24-70mm F2.8L IS USM', 0.990),
    ('canon rf 24-70', 'Canon RF 24-70mm F2.8L IS USM', 0.990),
    ('24-70 canon rf', 'Canon RF 24-70mm F2.8L IS USM', 0.990),

    -- EF explicite uniquement.
    ('24-70 ef', 'Canon EF 24-70mm F2.8L II USM', 0.990),
    ('ef 24-70', 'Canon EF 24-70mm F2.8L II USM', 0.990),
    ('canon ef 24-70', 'Canon EF 24-70mm F2.8L II USM', 0.990),
    ('24-70 canon ef', 'Canon EF 24-70mm F2.8L II USM', 0.990)
)
INSERT INTO public.catalog_signals (
  organization_id,
  term,
  normalized_term,
  product_id,
  product_name,
  source,
  confidence,
  approved,
  occurrences,
  created_at,
  updated_at,
  last_seen_at
)
SELECT
  org.organization_id,
  rows.term,
  lower(regexp_replace(trim(rows.term), '\s+', ' ', 'g')) AS normalized_term,
  NULL AS product_id,
  rows.product_name,
  'manual_sql' AS source,
  rows.confidence,
  TRUE AS approved,
  20 AS occurrences,
  NOW(),
  NOW(),
  NOW()
FROM org
CROSS JOIN rows
ON CONFLICT (organization_id, normalized_term, product_name)
DO UPDATE SET
  term = EXCLUDED.term,
  confidence = GREATEST(COALESCE(public.catalog_signals.confidence, 0), EXCLUDED.confidence),
  approved = TRUE,
  occurrences = GREATEST(public.catalog_signals.occurrences, EXCLUDED.occurrences),
  source = 'manual_sql',
  updated_at = NOW(),
  last_seen_at = NOW();

NOTIFY pgrst, 'reload schema';
