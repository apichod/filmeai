-- ── 041_u01_auto_sav_comment.sql ─────────────────────────────────────────────
-- Workflow U01 : passe add_sav_comment (id:9 Parent, id:19 Child)
-- de execution:"ai" → execution:"code" pour auto-génération du commentaire.
-- Structure des steps identique à la version live — seul execution change.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE return_workflows
SET
  steps = '[
    {
      "id": "2",
      "type": "action",
      "title": "Récupérer la commande parent",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "fetch_order"
    },
    {
      "id": "3",
      "type": "action",
      "title": "Dupliquer la commande",
      "execution": "code",
      "order_context": "parent",
      "output_context": "child",
      "booqable_action": "duplicate_order"
    },
    {
      "id": "5",
      "type": "action",
      "title": "Revert to draft (Parent)",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "revert_to_concept"
    },
    {
      "id": "6",
      "type": "action",
      "title": "Choisir article à conserver (Parent)",
      "description": "Quel article souhaitez-vous conserver sur la commande parent ? Les autres seront supprimés automatiquement.",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "choose_article"
    },
    {
      "id": "7",
      "type": "action",
      "title": "Supprimer les autres lignes (Parent)",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "remove_other_lines"
    },
    {
      "id": "8",
      "type": "action",
      "title": "Type de problème (Parent)",
      "description": "Quel est le type de problème pour la commande parent ?",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "choose_problem_tag",
      "parameters": {
        "options": [
          { "tag": "r11_late",    "label": "Retard"   },
          { "tag": "r12_missing", "label": "Perte"    },
          { "tag": "r13_theft",   "label": "Vol"      },
          { "tag": "r14_damage",  "label": "Dommage"  }
        ]
      }
    },
    {
      "id": "9",
      "type": "action",
      "title": "Commentaire SAV (Parent)",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "add_sav_comment"
    },
    {
      "id": "10",
      "type": "action",
      "title": "Supprimer les tags (Parent)",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "clear_tags"
    },
    {
      "id": "12",
      "type": "action",
      "title": "Ajouter le tag problème + r21_open (Parent)",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "add_tag",
      "parameters": { "tags_add": ["r21_open"] }
    },
    {
      "id": "13",
      "type": "action",
      "title": "Réserver (Parent)",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "reserve_order"
    },
    {
      "id": "14",
      "type": "action",
      "title": "Démarrer (Parent)",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "start_order"
    },
    {
      "id": "15",
      "type": "action",
      "title": "Récupérer la commande Child",
      "execution": "code",
      "order_context": "child",
      "booqable_action": "fetch_order"
    },
    {
      "id": "16",
      "type": "action",
      "title": "Choisir article à conserver (Child)",
      "description": "Quel article souhaitez-vous conserver sur la commande child ? Les autres seront supprimés automatiquement.",
      "execution": "code",
      "order_context": "child",
      "booqable_action": "choose_article"
    },
    {
      "id": "17",
      "type": "action",
      "title": "Supprimer les autres lignes (Child)",
      "execution": "code",
      "order_context": "child",
      "booqable_action": "remove_other_lines"
    },
    {
      "id": "18",
      "type": "action",
      "title": "Type de problème (Child)",
      "description": "Quel est le type de problème pour la commande child ?",
      "execution": "code",
      "order_context": "child",
      "booqable_action": "choose_problem_tag",
      "parameters": {
        "options": [
          { "tag": "r11_late",    "label": "Retard"   },
          { "tag": "r12_missing", "label": "Perte"    },
          { "tag": "r13_theft",   "label": "Vol"      },
          { "tag": "r14_damage",  "label": "Dommage"  }
        ]
      }
    },
    {
      "id": "19",
      "type": "action",
      "title": "Commentaire SAV (Child)",
      "execution": "code",
      "order_context": "child",
      "booqable_action": "add_sav_comment"
    },
    {
      "id": "20",
      "type": "action",
      "title": "Supprimer les tags (Child)",
      "execution": "code",
      "order_context": "child",
      "booqable_action": "clear_tags"
    },
    {
      "id": "22",
      "type": "action",
      "title": "Ajouter le tag problème + r21_open (Child)",
      "execution": "code",
      "order_context": "child",
      "booqable_action": "add_tag",
      "parameters": { "tags_add": ["r21_open"] }
    },
    {
      "id": "23",
      "type": "action",
      "title": "Réserver (Child)",
      "execution": "code",
      "order_context": "child",
      "booqable_action": "reserve_order"
    },
    {
      "id": "24",
      "type": "action",
      "title": "Démarrer (Child)",
      "execution": "code",
      "order_context": "child",
      "booqable_action": "start_order"
    }
  ]',
  updated_at = NOW()
WHERE slug = 'u01_split_return_order';
