-- ─────────────────────────────────────────────────────────────────────────────
-- 017_seed_catalog_signals_glossary.sql
-- Seed du glossaire initial Filme : aliases client → requêtes catalogue.
-- Relançable sans doublons grâce au ON CONFLICT.
-- Nécessite la migration 016_catalog_signals.sql.
-- ─────────────────────────────────────────────────────────────────────────────

WITH org AS (
  SELECT id AS organization_id
  FROM public.organizations
  ORDER BY created_at ASC
  LIMIT 1
), aliases(term, product_name) AS (
  VALUES
    ('fx6', 'Sony FX6 caméra'),
    ('fx3', 'Sony FX3 caméra'),
    ('fx9', 'Sony FX9 caméra'),
    ('c400', 'Canon EOS C400 caméra'),
    ('c50', 'Canon EOS C50 caméra'),
    ('c70', 'Canon EOS C70 caméra'),
    ('c300', 'Canon EOS C300 caméra'),
    ('ce sont des Canon', 'appliquer Canon aux modèles C400/C50/C70 et aux optiques RF de la liste précédente'),
    ('Canon', 'appliquer Canon aux modèles C400/C50/C70 et aux optiques RF de la liste précédente'),
    ('24-70 RF', 'Canon RF 24-70mm objectif'),
    ('24-105 RF 2.8', 'Canon RF 24-105mm f/2.8 objectif'),
    ('24-105 RF', 'Canon RF 24-105mm objectif'),
    ('indie 5', 'Atomos Shogun Indie 5 moniteur enregistreur'),
    ('cine 24', 'moniteur vidéo 24 pouces'),
    ('bpu', 'batterie Sony BP-U'),
    ('vlock', 'batterie V-Lock V-Mount'),
    ('v-lock', 'batterie V-Lock V-Mount'),
    ('bpu vers vlock', 'adaptateur BP-U vers V-Mount'),
    ('bpu vers v-lock', 'adaptateur BP-U vers V-Mount'),
    ('secteur', 'alimentation secteur caméra'),
    ('70-200', 'objectif zoom 70-200mm'),
    ('24-70', 'objectif zoom 24-70mm'),
    ('16-35', 'objectif zoom 16-35mm'),
    ('black promist 82mm', 'filtre Black Pro-Mist 82mm'),
    ('black pro-mist 82mm', 'filtre Black Pro-Mist 82mm'),
    ('solidcom c1', 'intercom Hollyland Solidcom C1'),
    ('hollyland hub', 'hub Hollyland Solidcom C1'),
    ('atem sdi', 'mélangeur vidéo Blackmagic ATEM SDI'),
    ('macbook', 'Apple MacBook'),
    ('usbc vers rj45', 'adaptateur USB-C Ethernet RJ45'),
    ('usb-c vers rj45', 'adaptateur USB-C Ethernet RJ45'),
    ('512gb', 'SSD 512 Go'),
    ('512 go', 'SSD 512 Go'),
    ('hotswap double', 'système hotswap double V-Mount'),
    ('trépied léger type sachtler', 'trépied vidéo léger Sachtler'),
    ('trepied leger type sachtler', 'trépied vidéo léger Sachtler'),
    ('pieds roulettes', 'pieds à roulettes / stand wheels'),
    ('magliner', 'chariot Magliner'),
    ('touret bnc 50m', 'touret câble BNC SDI 50m'),
    ('air remote', 'télécommande Profoto Air Remote'),
    ('pro 11', 'générateur flash Profoto Pro-11'),
    ('pro11', 'générateur flash Profoto Pro-11'),
    ('prohead', 'tête flash Profoto ProHead'),
    ('bol zoom', 'bol réflecteur Profoto Zoom Reflector'),
    ('profoto d2', 'flash Profoto D2'),
    ('rallonges de tête', 'rallonge de tête Profoto'),
    ('rallonges de tete', 'rallonge de tête Profoto'),
    ('octa 5', 'softbox Profoto Octa 5 pieds'),
    ('speedring', 'bague Speedring Profoto'),
    ('para l white', 'Broncolor Para L blanc'),
    ('pied 126', 'pied lumière Avenger 126'),
    ('c-stand', 'C-stand complet'),
    ('cstands', 'C-stand complet'),
    ('c stands', 'C-stand complet'),
    ('spigot 16-28mm', 'spigot 16-28 mm'),
    ('poly 8x4', 'cadre poly 8x4 et porte poly'),
    ('porte poly', 'cadre poly 8x4 et porte poly'),
    ('16 amp extensions', 'rallonge électrique 16A'),
    ('gueuses', 'gueuse / sandbag'),
    ('gueuse', 'gueuse / sandbag'),
    ('sandbag', 'gueuse / sandbag'),
    ('multi 5gang', 'multiprise 5 gang'),
    ('multi 5 gang', 'multiprise 5 gang'),
    ('aputure 600x', 'Aputure LS 600X Pro'),
    ('aputure 1200d', 'Aputure LS 1200D Pro'),
    ('ballast aputure 1200d', 'ballast Aputure 1200D'),
    ('cable torche aputure 1200', 'câble tête Aputure 1200D'),
    ('câble torche aputure 1200', 'câble tête Aputure 1200D')
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
  'seed_glossary',
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
