-- ── 034_update_late_returned_workflow.sql ─────────────────────────────────────
-- Mise à jour du workflow "Retard – Régularisé" (late_returned)
-- Basé sur Process 6 – Résolution d'une anomalie – Matériel rendu en retard
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE return_workflows
SET
  name        = 'R11-22A – Retard – Régularisé',
  description = 'Tout le matériel a été rendu, avec du retard',
  steps       = '[
    {
      "id": "1784532402923",
      "type": "instruction",
      "title": "Identifier la commande return_order",
      "description": "Demande de quelle commande de retour il s''agit"
    },
    {
      "id": "1",
      "type": "action",
      "title": "Récupérer les données de la commande",
      "description": "Récupère les détails complets de la commande depuis Booqable.",
      "booqable_action": "fetch_order"
    },
    {
      "id": "2",
      "type": "action",
      "title": "Changer la date de retour",
      "description": "Dans Booqable : change la date de retour de la commande d''origine par celle du jour"
    },
    {
      "id": "3",
      "type": "action",
      "title": "Retourner le matériel",
      "description": "Dans Booqable : retourne tous les articles de la commande"
    },
    {
      "id": "4",
      "type": "action",
      "title": "Remplacer le tag",
      "description": "Supprimer R21_OPEN, ajouter R22_WAIVED",
      "booqable_action": "add_tag",
      "parameters": { "tags_remove": ["R21_OPEN"], "tags_add": ["R22_WAIVED"] }
    },
    {
      "id": "1784532590048",
      "type": "action",
      "title": "Proposer un brouillon d''email",
      "description": "Proposer un email de confirmation au client",
      "booqable_action": "draft_email",
      "parameters": { "template_id": "retour_ok" }
    },
    {
      "id": "1784532617339",
      "type": "action",
      "title": "Envoyer l''email",
      "description": "Envoie l''email via Booqable après confirmation de l''opérateur",
      "booqable_action": "send_email"
    }
  ]',
  prompt      = $$WORKFLOW : RETARD – RÉGULARISÉ (R11-22A)
Tout le matériel a été rendu, mais avec du retard.
Ce workflow régularise la commande de retour return_order directement.

Règles :
- Ne pas créer de nouvel order.
- Ne pas facturer de pénalités.
- Pour les étapes manuelles (changer la date, retourner le matériel), demander confirmation à l''opérateur avant de continuer.
- Utiliser le template r11_22a_retard_regularise pour le brouillon email.
- Envoyer l''email uniquement après validation explicite de l''opérateur.$$,
  updated_at  = NOW()
WHERE slug = 'late_returned';
