-- ── 035_update_late_workflow.sql ──────────────────────────────────────────────
-- Mise à jour du workflow "R11-21 – Retard – Constat" (late)
-- Ajout des paramètres JSON sur les actions add_tag, draft_email, log_case
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE return_workflows
SET
  name        = 'R11-21 – Retard – Constat',
  description = 'Un ou plusieurs articles sont absents du retour',
  steps       = '[
    {
      "id": "1784454182624",
      "type": "question",
      "title": "Commande d''origine",
      "description": "Demande quel est le numéro de la commande d''origine"
    },
    {
      "id": "1",
      "type": "action",
      "title": "Récupérer la commande d''origine",
      "description": "Récupère les détails complets de la commande depuis Booqable. Mémorise customer_id, les lignes avec product_group_id et stock_item_id.",
      "booqable_action": "fetch_order"
    },
    {
      "id": "2",
      "type": "question",
      "title": "Articles manquants",
      "description": "Demande quels articles sont manquants. Pour chaque article, demande : nom, identifiant physique (ex: camera-sony-fx6-nue-id-1 visible dans la commande), et quantité manquante."
    },
    {
      "id": "1782049928354",
      "type": "action",
      "title": "Identification équipements manquants",
      "description": "Identifie les articles manquants avec product_group_id via la commande déjà récupérée ou search_products si nécessaire",
      "booqable_action": "search_products"
    },
    {
      "id": "3",
      "type": "action",
      "title": "Note interne",
      "description": "Ajoute une note interne sur la commande d''origine avec le détail des articles manquants (commençant par ''Manquant :'')",
      "booqable_action": "add_internal_note"
    },
    {
      "id": "4",
      "type": "instruction",
      "title": "Retour manuel Booqable",
      "description": "L''utilisateur doit retourner les articles manquants dans la commande d''origine dans Booqable (clic sur Return)"
    },
    {
      "id": "5",
      "type": "action",
      "title": "Créer commande de retour",
      "description": "Crée la commande de retour avec le customer_id de la commande d''origine. Date de fin = 31 déc 23h45. Remise 100%, caution = aucune.",
      "booqable_action": "create_new_return_order"
    },
    {
      "id": "1784458973125",
      "type": "action",
      "title": "Ajouter les articles manquants",
      "description": "Ajoute chaque article manquant à la commande de retour avec son product_group_id et stock_item_id (si trackable). Quantité = quantité manquante.",
      "booqable_action": "add_new_product_line"
    },
    {
      "id": "6",
      "type": "action",
      "title": "Renseigner la commande d''origine",
      "description": "Renseigne le champ order_sav sur la commande de retour avec le numéro de la commande d''origine",
      "booqable_action": "set_original_order"
    },
    {
      "id": "1784291226154",
      "type": "action",
      "title": "Commentaire SAV",
      "description": "Renseigne le commentaire SAV sur la commande de retour (commençant par ''Manquant :'')",
      "booqable_action": "add_sav_comment"
    },
    {
      "id": "7",
      "type": "action",
      "title": "Tags r11_late et r21_open",
      "description": "Ajoute les tags r11_late et r21_open à la commande de retour",
      "booqable_action": "add_tag",
      "parameters": { "tags_add": ["r11_late", "r21_open"] }
    },
    {
      "id": "8",
      "type": "action",
      "title": "Préparer un brouillon d''email client",
      "description": "Rédige l''email basé sur le template R11_21_Retard_Constat",
      "booqable_action": "draft_email",
      "parameters": { "template_id": "r11_21_retard_constat" }
    },
    {
      "id": "1784459551449",
      "type": "action",
      "title": "Envoyer l''email",
      "description": "Envoie l''email après confirmation de l''opérateur",
      "booqable_action": "send_email"
    },
    {
      "id": "9",
      "type": "action",
      "title": "Logger le cas",
      "description": "Enregistre le cas dans le tableau de suivi FilmeAI",
      "booqable_action": "log_case",
      "parameters": { "problem_type": "manquant" }
    }
  ]',
  updated_at  = NOW()
WHERE slug = 'late';
