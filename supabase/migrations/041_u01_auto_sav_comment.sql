-- ── 041_u01_auto_sav_comment.sql ─────────────────────────────────────────────
-- Refonte U01 : add_sav_comment devient un code step (execution:'code')
-- placé APRÈS choose_problem_tag pour pouvoir lire chosen_tag automatiquement.
-- Le commentaire est désormais généré automatiquement :
--   Manquant / Perdu / Volé / Cassé : [liste des produits conservés]
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE return_workflows
SET
  steps = '[
    {
      "id": "p1",
      "type": "action",
      "title": "Récupérer la commande (Parent)",
      "description": "Récupère les détails de la commande parent — lignes, customer_id, tags",
      "booqable_action": "fetch_order",
      "order_context": "parent",
      "execution": "code"
    },
    {
      "id": "p2",
      "type": "action",
      "title": "Repasser en draft (Parent)",
      "description": "Repasse la commande parent en état draft pour pouvoir la modifier",
      "booqable_action": "revert_to_concept",
      "order_context": "parent",
      "execution": "code"
    },
    {
      "id": "p3",
      "type": "action",
      "title": "Choisir l''article à conserver (Parent)",
      "description": "Affiche les articles de la commande parent — l''opérateur clique sur celui à conserver",
      "booqable_action": "choose_article",
      "order_context": "parent",
      "execution": "code"
    },
    {
      "id": "p4",
      "type": "action",
      "title": "Supprimer les autres articles (Parent)",
      "description": "Supprime toutes les lignes de la commande parent sauf l''article sélectionné",
      "booqable_action": "remove_other_lines",
      "order_context": "parent",
      "execution": "code"
    },
    {
      "id": "p5",
      "type": "action",
      "title": "Type de problème (Parent)",
      "description": "L''opérateur choisit le type de problème : Retard / Perte / Vol / Dommage",
      "booqable_action": "choose_problem_tag",
      "order_context": "parent",
      "execution": "code"
    },
    {
      "id": "p6",
      "type": "action",
      "title": "Commentaire SAV (Parent)",
      "description": "Renseigne automatiquement le commentaire SAV selon le type de problème et l''article conservé",
      "booqable_action": "add_sav_comment",
      "order_context": "parent",
      "execution": "code"
    },
    {
      "id": "p7",
      "type": "action",
      "title": "Supprimer les tags (Parent)",
      "description": "Supprime les anciens tags de la commande parent",
      "booqable_action": "clear_tags",
      "order_context": "parent",
      "execution": "code"
    },
    {
      "id": "p8",
      "type": "action",
      "title": "Ajouter le tag problème + r21_open (Parent)",
      "description": "Ajoute le tag du problème choisi et r21_open à la commande parent",
      "booqable_action": "add_tag",
      "order_context": "parent",
      "parameters": { "tags_add": ["r21_open"] },
      "execution": "code"
    },
    {
      "id": "p9",
      "type": "action",
      "title": "Réserver (Parent)",
      "description": "Passe la commande parent en état reserved",
      "booqable_action": "reserve_order",
      "order_context": "parent",
      "execution": "code"
    },
    {
      "id": "p10",
      "type": "action",
      "title": "Démarrer (Parent)",
      "description": "Passe la commande parent en état started (pick-up stock items)",
      "booqable_action": "start_order",
      "order_context": "parent",
      "execution": "code"
    },
    {
      "id": "c1",
      "type": "action",
      "title": "Dupliquer la commande (Child)",
      "description": "Duplique la commande parent pour créer la commande child",
      "booqable_action": "duplicate_order",
      "order_context": "parent",
      "output_context": "child",
      "execution": "code"
    },
    {
      "id": "c2",
      "type": "action",
      "title": "Récupérer la commande (Child)",
      "description": "Récupère les détails de la commande child — lignes pour le choix d''article",
      "booqable_action": "fetch_order",
      "order_context": "child",
      "execution": "code"
    },
    {
      "id": "c3",
      "type": "action",
      "title": "Repasser en draft (Child)",
      "description": "Repasse la commande child en état draft",
      "booqable_action": "revert_to_concept",
      "order_context": "child",
      "execution": "code"
    },
    {
      "id": "c4",
      "type": "action",
      "title": "Choisir l''article à conserver (Child)",
      "description": "Affiche les articles de la commande child — l''opérateur clique sur celui à conserver",
      "booqable_action": "choose_article",
      "order_context": "child",
      "execution": "code"
    },
    {
      "id": "c5",
      "type": "action",
      "title": "Supprimer les autres articles (Child)",
      "description": "Supprime toutes les lignes de la commande child sauf l''article sélectionné",
      "booqable_action": "remove_other_lines",
      "order_context": "child",
      "execution": "code"
    },
    {
      "id": "c6",
      "type": "action",
      "title": "Type de problème (Child)",
      "description": "L''opérateur choisit le type de problème : Retard / Perte / Vol / Dommage",
      "booqable_action": "choose_problem_tag",
      "order_context": "child",
      "execution": "code"
    },
    {
      "id": "c7",
      "type": "action",
      "title": "Commentaire SAV (Child)",
      "description": "Renseigne automatiquement le commentaire SAV selon le type de problème et l''article conservé",
      "booqable_action": "add_sav_comment",
      "order_context": "child",
      "execution": "code"
    },
    {
      "id": "c8",
      "type": "action",
      "title": "Supprimer les tags (Child)",
      "description": "Supprime les anciens tags de la commande child",
      "booqable_action": "clear_tags",
      "order_context": "child",
      "execution": "code"
    },
    {
      "id": "c9",
      "type": "action",
      "title": "Ajouter le tag problème + r21_open (Child)",
      "description": "Ajoute le tag du problème choisi et r21_open à la commande child",
      "booqable_action": "add_tag",
      "order_context": "child",
      "parameters": { "tags_add": ["r21_open"] },
      "execution": "code"
    },
    {
      "id": "c10",
      "type": "action",
      "title": "Réserver (Child)",
      "description": "Passe la commande child en état reserved",
      "booqable_action": "reserve_order",
      "order_context": "child",
      "execution": "code"
    },
    {
      "id": "c11",
      "type": "action",
      "title": "Démarrer (Child)",
      "description": "Passe la commande child en état started (pick-up stock items)",
      "booqable_action": "start_order",
      "order_context": "child",
      "execution": "code"
    }
  ]',
  updated_at = NOW()
WHERE slug = 'u01_split_return_order';
