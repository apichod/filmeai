-- ── 045_r11_full_code.sql ────────────────────────────────────────────────────
-- R11-21 : workflow quasi-intégralement en code, comme U01.
--
-- Changements vs version précédente :
--   ✗ Supprimé : question "Articles manquants", check, search_products,
--                add_internal_note, add_new_product_line
--   ✓ Ajouté   : choose_article (boutons multi-select — user choisit les manquants)
--   ✓ Ajouté   : add_missing_lines (code — ajoute les articles cochés à la return order)
--   ✓ add_sav_comment passe en code (auto-généré depuis les articles cochés)
--
-- Steps AI restants (non contournables) :
--   1. question "Commande d'origine" — demande le numéro
--   2. question "Retour Booqable"    — demande à l'opérateur de cliquer Return dans Booqable
--   3. draft_email / send_email / log_case — email + log (LLM-only tools)
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE return_workflows
SET
  steps = '[
    {
      "id": "1784454182624",
      "type": "question",
      "title": "Commande d''origine",
      "description": "Demande quel est le numéro de la commande d''origine",
      "execution": "ai"
    },
    {
      "id": "1",
      "type": "action",
      "title": "Récupérer la commande d''origine",
      "execution": "code",
      "order_context": "original",
      "booqable_action": "fetch_order"
    },
    {
      "id": "2",
      "type": "action",
      "title": "Articles manquants",
      "description": "Sélectionnez les articles qui n''ont pas été retournés",
      "execution": "code",
      "order_context": "original",
      "booqable_action": "choose_article"
    },
    {
      "id": "4",
      "type": "question",
      "title": "Retour Booqable",
      "description": "⚠️ Retournez manuellement les articles manquants dans la commande d''origine dans Booqable (clic sur Return), puis confirmez avec ''ok''.",
      "execution": "ai"
    },
    {
      "id": "5",
      "type": "action",
      "title": "Créer commande de retour",
      "execution": "code",
      "order_context": "original",
      "output_context": "parent",
      "booqable_action": "create_new_return_order"
    },
    {
      "id": "NEW1",
      "type": "action",
      "title": "Ajouter les articles manquants",
      "execution": "code",
      "order_context": "original",
      "output_context": "parent",
      "booqable_action": "add_missing_lines"
    },
    {
      "id": "6",
      "type": "action",
      "title": "Renseigner la commande d''origine",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "set_original_order"
    },
    {
      "id": "1784291226154",
      "type": "action",
      "title": "Commentaire SAV",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "add_sav_comment"
    },
    {
      "id": "7",
      "type": "action",
      "title": "Tags r11_late et r21_open",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "add_tag",
      "parameters": { "tags_add": ["r11_late", "r21_open"] }
    },
    {
      "id": "1784556285795",
      "type": "action",
      "title": "Réserve la commande",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "reserve_order"
    },
    {
      "id": "1784556286379",
      "type": "action",
      "title": "Pickup la commande",
      "execution": "code",
      "order_context": "parent",
      "booqable_action": "start_order"
    },
    {
      "id": "8",
      "type": "action",
      "title": "Préparer un brouillon d''email client",
      "execution": "ai",
      "booqable_action": "draft_email",
      "parameters": { "template_id": "r11_21_retard_constat" }
    },
    {
      "id": "1784459551449",
      "type": "action",
      "title": "Envoyer l''email",
      "execution": "ai",
      "booqable_action": "send_email"
    },
    {
      "id": "9",
      "type": "action",
      "title": "Logger le cas",
      "execution": "ai",
      "booqable_action": "log_case",
      "parameters": { "problem_type": "manquant" }
    }
  ]',
  updated_at = NOW()
WHERE slug = 'r11_21_late_open';
