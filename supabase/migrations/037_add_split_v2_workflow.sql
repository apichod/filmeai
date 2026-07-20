-- ── 037_add_split_v2_workflow.sql ────────────────────────────────────────────
-- Workflow "T1 – Split Order V2" : split d'une commande parent sans l'annuler
-- Chaque étape = un appel API Booqable distinct
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO return_workflows (slug, name, description, is_active, steps, prompt)
VALUES (
  'split_v2',
  'T1 – Split Order V2',
  'Plusieurs problèmes sur la même commande de retour — dupliquer pour résoudre 2 problèmes distincts',
  false,
  '[
    {
      "id": "1",
      "type": "question",
      "title": "Identifier la commande parent",
      "description": "Demande le numéro de la commande parent (parent_return_order)"
    },
    {
      "id": "2",
      "type": "action",
      "title": "Récupérer la commande parent",
      "description": "Récupère les détails de parent_return_order — mémorise line_id, tags, notes_sav",
      "booqable_action": "fetch_order"
    },
    {
      "id": "3",
      "type": "action",
      "title": "Dupliquer la commande Parent",
      "description": "Duplique parent_return_order via Booqable API pour créer child_return_order. Mémorise new_order_id et new_order_number.",
      "booqable_action": "duplicate_order"
    },
    {
      "id": "4",
      "type": "question",
      "title": "Numéro de la commande Child",
      "description": "Confirme le numéro de la commande créée par duplication (child_return_order). Si duplicate_order a réussi, proposer new_order_number, sinon demander à l''opérateur."
    },
    {
      "id": "5",
      "type": "action",
      "title": "Revert to draft la commande Parent",
      "description": "Repasse parent_return_order en état ''concept'' (draft) pour pouvoir la modifier",
      "booqable_action": "revert_to_concept"
    },
    {
      "id": "6",
      "type": "question",
      "title": "Articles à supprimer dans la commande Parent",
      "description": "Demande quels articles sont à supprimer de parent_return_order"
    },
    {
      "id": "7",
      "type": "action",
      "title": "Supprimer les lignes non concernées (Parent)",
      "description": "Supprime une à une les lignes de parent_return_order. Utiliser les line_id de fetch_order.",
      "booqable_action": "remove_product_line"
    },
    {
      "id": "8",
      "type": "question",
      "title": "Confirmer le problème de la commande Parent",
      "description": "Affiche notes_sav actuelle et demande à l''opérateur de confirmer le type de problème (retard, perte, vol, dommage)"
    },
    {
      "id": "9",
      "type": "action",
      "title": "Mettre à jour le commentaire SAV (Parent)",
      "description": "Met à jour notes_sav de parent_return_order",
      "booqable_action": "add_sav_comment"
    },
    {
      "id": "10",
      "type": "action",
      "title": "Supprimer tous les tags (Parent)",
      "description": "Vide la liste de tags de parent_return_order avant de la retagger",
      "booqable_action": "clear_tags"
    },
    {
      "id": "11",
      "type": "action",
      "title": "Choisir le tag du problème (Parent)",
      "description": "Affiche les 4 boutons de choix : Retard / Perte / Vol / Dommage. L''opérateur clique pour sélectionner le tag.",
      "booqable_action": "choose_problem_tag"
    },
    {
      "id": "12",
      "type": "action",
      "title": "Ajouter r21_open (Parent)",
      "description": "Ajoute toujours r21_open à parent_return_order",
      "booqable_action": "add_tag",
      "parameters": {
        "tags_add": ["r21_open"]
      }
    },
    {
      "id": "13",
      "type": "action",
      "title": "Réserver la commande Parent",
      "description": "Passe parent_return_order en ''reserved''",
      "booqable_action": "reserve_order"
    },
    {
      "id": "14",
      "type": "action",
      "title": "Démarrer (pick-up) la commande Parent",
      "description": "Passe parent_return_order en ''started''",
      "booqable_action": "start_order"
    },
    {
      "id": "15",
      "type": "action",
      "title": "Récupérer la commande Child",
      "description": "Récupère les détails de child_return_order — mémorise les line_id pour suppression",
      "booqable_action": "fetch_order"
    },
    {
      "id": "16",
      "type": "question",
      "title": "Articles à supprimer dans la commande Child",
      "description": "Demande quels articles sont à supprimer de child_return_order"
    },
    {
      "id": "17",
      "type": "action",
      "title": "Supprimer les lignes non concernées (Child)",
      "description": "Supprime une à une les lignes de child_return_order. Utiliser les line_id de fetch_order.",
      "booqable_action": "remove_product_line"
    },
    {
      "id": "18",
      "type": "question",
      "title": "Type de problème pour la commande Child",
      "description": "Demande de choisir entre : retard, perte, vol, dommage"
    },
    {
      "id": "19",
      "type": "action",
      "title": "Commentaire SAV (Child)",
      "description": "Écrit le commentaire SAV dans child_return_order",
      "booqable_action": "add_sav_comment"
    },
    {
      "id": "20",
      "type": "action",
      "title": "Supprimer tous les tags (Child)",
      "description": "Vide la liste de tags de child_return_order avant de la retagger",
      "booqable_action": "clear_tags"
    },
    {
      "id": "21",
      "type": "action",
      "title": "Choisir le tag du problème (Child)",
      "description": "Affiche les 4 boutons de choix : Retard / Perte / Vol / Dommage. L''opérateur clique pour sélectionner le tag.",
      "booqable_action": "choose_problem_tag"
    },
    {
      "id": "22",
      "type": "action",
      "title": "Ajouter r21_open (Child)",
      "description": "Ajoute toujours r21_open à child_return_order",
      "booqable_action": "add_tag",
      "parameters": {
        "tags_add": ["r21_open"]
      }
    },
    {
      "id": "23",
      "type": "action",
      "title": "Réserver la commande Child",
      "description": "Passe child_return_order en ''reserved''",
      "booqable_action": "reserve_order"
    },
    {
      "id": "24",
      "type": "action",
      "title": "Démarrer (pick-up) la commande Child",
      "description": "Passe child_return_order en ''started''",
      "booqable_action": "start_order"
    }
  ]',
  $$WORKFLOW : SPLIT ORDER V2 (T1)
Plusieurs problèmes distincts sur la même commande de retour.
On garde la commande parent et on crée une commande child par duplication manuelle.

TERMINOLOGIE :
- parent_return_order : la commande de retour originale (conservée, modifiée).
- child_return_order : la copie créée par duplication manuelle dans Booqable.

RÈGLES :
- La duplication est manuelle — attendre confirmation de l''opérateur avant de continuer.
- Après fetch_order, mémoriser : line_id (pour remove_product_line), tags et notes_sav.
- Faire revert_to_concept sur parent AVANT de supprimer des lignes.
- Tags selon le problème : retard → r11_late | perte → r12_missing | vol → r13_theft | dommage → r14_damage. Toujours ajouter r21_open ensuite.
- Traiter parent entièrement (steps 5→14) avant de passer au child (steps 15→24).$$
)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  steps       = EXCLUDED.steps,
  prompt      = EXCLUDED.prompt,
  updated_at  = NOW();
