-- ── return_workflows : procédures éditables par l'admin ──────────────────────
CREATE TABLE IF NOT EXISTS return_workflows (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT    UNIQUE NOT NULL,          -- 'manquant' | 'casse'
  name        TEXT    NOT NULL,
  description TEXT,
  prompt      TEXT    NOT NULL DEFAULT '',      -- instructions IA libres (éditables admin)
  steps       JSONB   NOT NULL DEFAULT '[]',    -- étapes structurées
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── return_cases : journal des anomalies ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS return_cases (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number         SERIAL  UNIQUE,
  origin_order        TEXT,                     -- numéro d'order d'origine
  origin_order_id     TEXT,                     -- ID Booqable de l'order d'origine
  sav_order_id        TEXT,                     -- ID Booqable de la SAV order créée
  problem_type        TEXT,                     -- 'manquant' | 'casse'
  problem_description TEXT,
  status              TEXT    NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','in_progress','resolved')),
  metadata            JSONB   NOT NULL DEFAULT '{}',  -- assurance, caution, cas, etc.
  messages            JSONB   NOT NULL DEFAULT '[]',  -- historique de la conversation
  actions_taken       JSONB   NOT NULL DEFAULT '[]',  -- actions Booqable effectuées
  workflow_id         UUID    REFERENCES return_workflows(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS return_cases_status_idx   ON return_cases(status);
CREATE INDEX IF NOT EXISTS return_cases_created_idx  ON return_cases(created_at DESC);

-- ── Pré-remplir les deux workflows ───────────────────────────────────────────
INSERT INTO return_workflows (slug, name, description, prompt, steps) VALUES

('manquant', 'Matériel manquant', 'Un ou plusieurs articles sont absents du retour',
$$Tu es un assistant de gestion des retours pour une société de location de matériel audiovisuel (Filme).
Tu guides le responsable de stock à travers la procédure de gestion des anomalies, étape par étape.
Tu exécutes les actions Booqable directement via les outils disponibles.

PROCÉDURE — MATÉRIEL MANQUANT :
1. Récupère l'order d'origine avec fetch_order (numéro fourni par l'utilisateur)
2. Identifie les articles manquants (demande si pas précisé)
3. Ajoute une note interne à l'order d'origine avec le détail des articles manquants
4. Indique à l'utilisateur de retourner manuellement les éléments manquants dans l'order d'origine dans Booqable
5. Crée une nouvelle order SAV : même client, début = aujourd'hui, fin = J+30, remise 100%, caution = aucune
6. Renseigne dans la SAV order : Order origine SAV = numéro de l'order initiale (via commentaire SAV)
7. Ajoute le tag LATE à la SAV order
8. Indique à l'utilisateur d'envoyer l'email "Contrôle retour – matériel manquant"
9. Logue le cas avec log_case

RÈGLES :
- Après chaque action réussie, confirme avec ✓ et passe à l'étape suivante sans attendre
- Si une action échoue, explique le problème et propose une solution
- Pose UNE question à la fois si tu as besoin d'informations
- Sois concis et professionnel$$,
'[
  {"id":"1","type":"action","title":"Récupérer l''order","description":"Récupère les détails de l''order d''origine depuis Booqable","booqable_action":"fetch_order"},
  {"id":"2","type":"question","title":"Articles manquants","description":"Identifie quels articles sont manquants","variable":"missing_items"},
  {"id":"3","type":"action","title":"Note interne","description":"Ajoute une note interne avec le détail des articles manquants","booqable_action":"add_internal_note"},
  {"id":"4","type":"instruction","title":"Retour manuel","description":"L''utilisateur doit retourner les éléments manquants dans l''order d''origine dans Booqable"},
  {"id":"5","type":"action","title":"Créer SAV order","description":"Crée une nouvelle order SAV (même client, J+30, remise 100%, caution = aucune)","booqable_action":"create_sav_order"},
  {"id":"6","type":"action","title":"Commentaire SAV","description":"Renseigne l''Order origine SAV et le détail du problème","booqable_action":"add_sav_comment"},
  {"id":"7","type":"action","title":"Tag LATE","description":"Ajoute le tag LATE à la SAV order","booqable_action":"add_tag"},
  {"id":"8","type":"instruction","title":"Email","description":"Envoie l''email ''Contrôle retour – matériel manquant''"},
  {"id":"9","type":"action","title":"Logger le cas","description":"Enregistre le cas dans le tableau de suivi","booqable_action":"log_case"}
]'::jsonb),

('casse', 'Matériel cassé', 'Un ou plusieurs articles sont revenus endommagés',
$$Tu es un assistant de gestion des retours pour une société de location de matériel audiovisuel (Filme).
Tu guides le responsable de stock à travers la procédure de gestion des anomalies, étape par étape.
Tu exécutes les actions Booqable directement via les outils disponibles.

PROCÉDURE — MATÉRIEL CASSÉ :
0. Pose d''abord ces deux questions : (1) Y a-t-il une assurance ? (2) Y a-t-il une caution ?
   Détermine le cas applicable :
   - Cas 1 : Assurance ✓ + Pas de caution
   - Cas 2 : Assurance ✓ + Caution ✓
   - Cas 3 : Pas d''assurance + Pas de caution
   - Cas 4 : Pas d''assurance + Caution ✓
1. Récupère l''order d''origine avec fetch_order
2. Identifie les articles abîmés (demande si pas précisé)
3. Ajoute une note interne à l''order d''origine avec le détail des articles abîmés
4. Indique à l''utilisateur de retourner manuellement les éléments abîmés dans l''order d''origine dans Booqable
5. Crée une nouvelle order SAV : même client, début = aujourd''hui, fin = J+30
6. Renseigne dans la SAV order : Order origine SAV = numéro de l''order initiale + cas applicable (Cas 1/2/3/4)
7. Ajoute le tag TOBEREPAIRED à la SAV order
8. Indique à l''utilisateur d''envoyer l''email "Contrôle retour – matériel cassé"
9. Logue le cas avec log_case (inclure assurance, caution, cas dans les métadonnées)

RÈGLES :
- Après chaque action réussie, confirme avec ✓ et passe à l''étape suivante sans attendre
- Si une action échoue, explique le problème et propose une solution
- Pose UNE question à la fois si tu as besoin d''informations
- Sois concis et professionnel$$,
'[
  {"id":"0","type":"question","title":"Assurance & caution","description":"Demande si assurance et si caution pour déterminer le cas","variable":"insurance_deposit"},
  {"id":"1","type":"action","title":"Récupérer l''order","description":"Récupère les détails de l''order d''origine depuis Booqable","booqable_action":"fetch_order"},
  {"id":"2","type":"question","title":"Articles abîmés","description":"Identifie quels articles sont endommagés","variable":"damaged_items"},
  {"id":"3","type":"action","title":"Note interne","description":"Ajoute une note interne avec le détail des articles abîmés","booqable_action":"add_internal_note"},
  {"id":"4","type":"instruction","title":"Retour manuel","description":"L''utilisateur doit retourner les éléments abîmés dans l''order d''origine dans Booqable"},
  {"id":"5","type":"action","title":"Créer SAV order","description":"Crée une nouvelle order SAV (même client, J+30)","booqable_action":"create_sav_order"},
  {"id":"6","type":"action","title":"Commentaire SAV","description":"Renseigne l''Order origine SAV, le cas et le détail du problème","booqable_action":"add_sav_comment"},
  {"id":"7","type":"action","title":"Tag TOBEREPAIRED","description":"Ajoute le tag TOBEREPAIRED à la SAV order","booqable_action":"add_tag"},
  {"id":"8","type":"instruction","title":"Email","description":"Envoie l''email ''Contrôle retour – matériel cassé''"},
  {"id":"9","type":"action","title":"Logger le cas","description":"Enregistre le cas dans le tableau de suivi","booqable_action":"log_case"}
]'::jsonb)

ON CONFLICT (slug) DO NOTHING;
