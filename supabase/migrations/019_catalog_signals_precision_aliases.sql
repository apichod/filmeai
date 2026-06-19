-- ─────────────────────────────────────────────────────────────────────────────
-- 019_catalog_signals_precision_aliases.sql
-- Signaux métier supplémentaires pour les cas qui doivent rester contrôlables
-- depuis /assistant/knowledge > Signaux, pas codés en dur dans les prompts.
-- Relançable sans doublons.
-- ─────────────────────────────────────────────────────────────────────────────

WITH org AS (
  SELECT id AS organization_id
  FROM public.organizations
  ORDER BY created_at ASC
  LIMIT 1
), aliases(term, product_name) AS (
  VALUES
    ('vari nd', 'filtre Vari ND'),
    ('vari nd 82mm', 'filtre Vari ND 82mm'),
    ('vari nd 1-5 82mm', 'filtre Vari ND 1-5 82mm'),
    ('variable nd', 'filtre Vari ND'),
    ('angelbird 256go', 'carte mémoire Angelbird 256 Go'),
    ('angelbird 256gb', 'carte mémoire Angelbird 256 Go'),
    ('angelbird 512go', 'carte mémoire Angelbird 512 Go'),
    ('angelbird 512gb', 'carte mémoire Angelbird 512 Go'),
    ('ronin rs4', 'DJI Ronin RS 4'),
    ('ronin rs 4', 'DJI Ronin RS 4'),
    ('rs4', 'DJI Ronin RS 4'),
    ('300x', 'Aputure LS 300X'),
    ('aputure 300x', 'Aputure LS 300X'),
    ('softbox octa white 90cm', 'softbox Profoto Octa 90 cm'),
    ('profoto softbox octa white 90cm', 'softbox Profoto Octa 90 cm'),
    ('lastolite réflecteur pliable 5 en 1', 'réflecteur pliable 5-en-1'),
    ('lastolite reflecteur pliable 5 en 1', 'réflecteur pliable 5-en-1'),
    ('tether tools 10m', 'câble Tether Tools USB-C 10m'),
    ('tetherpro cable 10m', 'câble Tether Tools USB-C 10m'),
    ('hyperjuice', 'batterie HyperJuice'),
    ('feuille cto 1/4', 'feuille CTO 1/4')
), normalized AS (
  SELECT
    org.organization_id,
    aliases.term,
    lower(
      trim(
        regexp_replace(
          replace(replace(replace(aliases.term, '–', '-'), '—', '-'), '−', '-'),
          '\\s+',
          ' ',
          'g'
        )
      )
    ) AS normalized_term,
    aliases.product_name
  FROM org
  CROSS JOIN aliases
)
INSERT INTO public.catalog_signals (
  organization_id,
  term,
  normalized_term,
  product_name,
  source,
  approved,
  confidence,
  occurrences,
  created_at,
  updated_at,
  last_seen_at
)
SELECT
  organization_id,
  term,
  normalized_term,
  product_name,
  'seed_precision_aliases',
  TRUE,
  1,
  1,
  NOW(),
  NOW(),
  NOW()
FROM normalized
ON CONFLICT (organization_id, normalized_term, product_name)
DO UPDATE SET
  term = EXCLUDED.term,
  source = EXCLUDED.source,
  approved = TRUE,
  confidence = 1,
  updated_at = NOW(),
  last_seen_at = NOW();

NOTIFY pgrst, 'reload schema';
