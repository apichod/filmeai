-- ── 031_processes.sql ────────────────────────────────────────────────────────
-- Table pour les process métier (infographies éditables)

create table if not exists processes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  subtitle    text,
  steps       jsonb not null default '[]',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Seed : Process #3 – Matériel manquant
insert into processes (slug, title, subtitle, sort_order, steps) values (
  'materiel_manquant',
  'Contrôle retour : Matériel manquant',
  'Process #3 · Gestion d''une anomalie',
  1,
  '[
    {"id":"1","type":"step","text":"Note les problèmes dans **Notes internes** de l''order d''origine"},
    {"id":"2","type":"step","text":"Retourne les éléments manquants dans l''order d''origine","badge":{"label":"Return","color":"green"}},
    {"id":"3","type":"step","text":"Crée une nouvelle order","badge":{"label":"Add order","color":"blue"}},
    {"id":"4","type":"info","lines":["Même client","Début = aujourd''hui, retour = dernier jour de l''année","Ajoute les produits concernés avec leurs IDs"],"pills":[{"label":"Reserve","color":"blue"},{"label":"Pickup","color":"amber"}]},
    {"id":"5","type":"step","text":"Renseigne **Order origine SAV**"},
    {"id":"6","type":"info","lines":["= numéro de l''order initiale"]},
    {"id":"7","type":"step","text":"Détaille le problème en **Commentaire problème**"},
    {"id":"8","type":"step","text":"Ajoute uniquement le tag **LATE**"},
    {"id":"9","type":"step","text":"Envoi email **Contrôle retour – matériel manquant**","badge":{"label":"Send email","color":"blue"}}
  ]'
) on conflict (slug) do nothing;

-- Seed : Process #3 – Matériel cassé
insert into processes (slug, title, subtitle, sort_order, steps) values (
  'materiel_casse',
  'Contrôle retour : Matériel cassé',
  'Process #3 · Gestion d''une anomalie',
  2,
  '[
    {"id":"1","type":"step","text":"Note les problèmes dans **Notes internes** de l''order d''origine"},
    {"id":"2","type":"step","text":"Retourne les éléments abîmés dans l''order d''origine","badge":{"label":"Return","color":"green"}},
    {"id":"3","type":"step","text":"Crée une nouvelle order","badge":{"label":"Add order","color":"blue"}},
    {"id":"4","type":"info","lines":["Même client","Début = aujourd''hui, retour = J+7","Ajoute les produits concernés avec leurs IDs"],"pills":[{"label":"Reserve","color":"blue"},{"label":"Pickup","color":"amber"}]},
    {"id":"5","type":"step","text":"Renseigne **Order origine SAV**"},
    {"id":"6","type":"info","lines":["= numéro de l''order initiale"]},
    {"id":"7","type":"step","text":"Détaille le problème en **Commentaire problème**"},
    {"id":"8","type":"step","text":"Ajoute le tag **DAMAGE**"},
    {"id":"9","type":"step","text":"Envoi email **Contrôle retour – matériel cassé**","badge":{"label":"Send email","color":"blue"}},
    {"id":"10","type":"cases","title":"Choisis le bon cas de figure, efface les autres :","lines":["Cas 1 – Assurance + Caution","Cas 2 – Assurance + Pas de caution","Cas 3 – Pas d''assurance + Caution","Cas 4 – Pas d''assurance + Pas de caution"]}
  ]'
) on conflict (slug) do nothing;
