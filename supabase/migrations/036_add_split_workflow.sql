-- ── 036_add_split_workflow.sql ───────────────────────────────────────────────
-- Workflow "R11-22B – Split Order" : plusieurs problèmes sur la même commande
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO return_workflows (slug, name, description, is_active, steps, prompt)
VALUES (
  'split',
  'R11-22B – Split Order',
  'Plusieurs problèmes sur la même commande de retour — split en 2 commandes distinctes',
  true,
  '[
    {
      "id": "1",
      "type": "question",
      "title": "Identifier la commande à splitter",
      "description": "Demande le numéro de la commande de retour (return_order) à splitter"
    },
    {
      "id": "2",
      "type": "action",
      "title": "Récupérer la commande",
      "description": "Récupère les détails complets de la commande (lignes, client, IDs)",
      "booqable_action": "fetch_order"
    },
    {
      "id": "3",
      "type": "instruction",
      "title": "Dupliquer manuellement 2 fois dans Booqable",
      "description": "Dans Booqable : dupliquer la commande 2 fois pour obtenir return_order_1 et return_order_2. Attendre confirmation de l''opérateur."
    },
    {
      "id": "4",
      "type": "question",
      "title": "Numéros des 2 nouvelles commandes",
      "description": "Demande les numéros des 2 nouvelles commandes créées par duplication (return_order_1 et return_order_2)"
    },
    {
      "id": "5",
      "type": "action",
      "title": "Annuler la commande d''origine",
      "description": "Annule la commande return_order originale (devenue inutile après duplication)",
      "booqable_action": "cancel_order"
    },
    {
      "id": "6",
      "type": "action",
      "title": "Lister les articles de la commande N°1",
      "description": "Récupère les détails de return_order_1 — mémorise les line_id pour suppression",
      "booqable_action": "fetch_order"
    },
    {
      "id": "7",
      "type": "question",
      "title": "Articles à conserver dans la commande N°1",
      "description": "Demande quels articles concernent le problème N°1. Les autres seront supprimés."
    },
    {
      "id": "8",
      "type": "action",
      "title": "Supprimer les lignes non concernées (commande N°1)",
      "description": "Supprime une à une les lignes de return_order_1 qui ne concernent pas le problème N°1. Utiliser les line_id de fetch_order.",
      "booqable_action": "remove_product_line"
    },
    {
      "id": "9",
      "type": "question",
      "title": "Type de problème pour la commande N°1",
      "description": "Demande de choisir entre : retard, perte, vol, dommage"
    },
    {
      "id": "10",
      "type": "action",
      "title": "Commentaire SAV (commande N°1)",
      "description": "Écrit le commentaire SAV sur return_order_1 : ''Manquant'', ''Perdu'', ''Volé'' ou ''Cassé'' suivi des produits concernés",
      "booqable_action": "add_sav_comment"
    },
    {
      "id": "11",
      "type": "action",
      "title": "Tag problème (commande N°1)",
      "description": "Ajoute le tag correspondant au problème N°1 sur return_order_1",
      "booqable_action": "add_tag",
      "parameters": {
        "tags_map": {
          "retard":  ["r11_late",    "r21_open"],
          "perte":   ["r12_missing", "r21_open"],
          "vol":     ["r13_theft",   "r21_open"],
          "dommage": ["r14_damage",  "r21_open"]
        }
      }
    },
    {
      "id": "12",
      "type": "action",
      "title": "Réserver la commande N°1",
      "description": "Passe return_order_1 en ''reserved''",
      "booqable_action": "reserve_order"
    },
    {
      "id": "13",
      "type": "action",
      "title": "Démarrer (pick-up) la commande N°1",
      "description": "Passe return_order_1 en ''started''",
      "booqable_action": "start_order"
    },
    {
      "id": "14",
      "type": "action",
      "title": "Lister les articles de la commande N°2",
      "description": "Récupère les détails de return_order_2 — mémorise les line_id pour suppression",
      "booqable_action": "fetch_order"
    },
    {
      "id": "15",
      "type": "question",
      "title": "Articles à conserver dans la commande N°2",
      "description": "Demande quels articles concernent le problème N°2. Les autres seront supprimés."
    },
    {
      "id": "16",
      "type": "action",
      "title": "Supprimer les lignes non concernées (commande N°2)",
      "description": "Supprime une à une les lignes de return_order_2 qui ne concernent pas le problème N°2. Utiliser les line_id de fetch_order.",
      "booqable_action": "remove_product_line"
    },
    {
      "id": "17",
      "type": "question",
      "title": "Type de problème pour la commande N°2",
      "description": "Demande de choisir entre : retard, perte, vol, dommage"
    },
    {
      "id": "18",
      "type": "action",
      "title": "Commentaire SAV (commande N°2)",
      "description": "Écrit le commentaire SAV sur return_order_2 : ''Manquant'', ''Perdu'', ''Volé'' ou ''Cassé'' suivi des produits concernés",
      "booqable_action": "add_sav_comment"
    },
    {
      "id": "19",
      "type": "action",
      "title": "Tag problème (commande N°2)",
      "description": "Ajoute le tag correspondant au problème N°2 sur return_order_2",
      "booqable_action": "add_tag",
      "parameters": {
        "tags_map": {
          "retard":  ["r11_late",    "r21_open"],
          "perte":   ["r12_missing", "r21_open"],
          "vol":     ["r13_theft",   "r21_open"],
          "dommage": ["r14_damage",  "r21_open"]
        }
      }
    },
    {
      "id": "20",
      "type": "action",
      "title": "Réserver la commande N°2",
      "description": "Passe return_order_2 en ''reserved''",
      "booqable_action": "reserve_order"
    },
    {
      "id": "21",
      "type": "action",
      "title": "Démarrer (pick-up) la commande N°2",
      "description": "Passe return_order_2 en ''started''",
      "booqable_action": "start_order"
    }
  ]',
  $$WORKFLOW : SPLIT ORDER (R11-22B)
Il y a plusieurs problèmes distincts sur la même commande de retour.
Ce workflow crée 2 commandes distinctes, une par type de problème.

TERMINOLOGIE :
- return_order : la commande de retour originale à splitter.
- return_order_1 / return_order_2 : les 2 copies créées manuellement dans Booqable.

RÈGLES :
- La duplication est manuelle (non automatisable via API) — demander confirmation avant de continuer.
- Après fetch_order, mémoriser les line_id de chaque ligne pour pouvoir supprimer les lignes non concernées.
- Pour chaque commande, supprimer toutes les lignes sauf celles qui concernent le problème de cette commande.
- Tags selon le problème : retard → r11_late | perte → r12_missing | vol → r13_theft | dommage → r14_damage. Toujours ajouter r21_open en plus.
- Réserver puis démarrer chaque commande dans l'ordre (N°1 entièrement, puis N°2).$$
)
ON CONFLICT (slug) DO NOTHING;
