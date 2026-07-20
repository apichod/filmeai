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
      "description": "Identifier la commande return_order à régulariser (numéro fourni par l''opérateur)"
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
      "description": "⚠️ Dans Booqable : changer la date de retour de la commande d''origine par celle du jour"
    },
    {
      "id": "3",
      "type": "action",
      "title": "Retourner le matériel",
      "description": "Dans Booqable : retourner tous les articles de la commande"
    },
    {
      "id": "4",
      "type": "action",
      "title": "Remplacer le tag",
      "description": "add_tag : supprimer R21_OPEN, ajouter R22_WAIVED",
      "booqable_action": "add_tag"
    },
    {
      "id": "1784532590048",
      "type": "action",
      "title": "Proposer un brouillon d''email",
      "description": "draft_email template=r11_22a_retard_regularise → présenter le brouillon à l''opérateur",
      "booqable_action": "draft_email"
    },
    {
      "id": "1784532617339",
      "type": "action",
      "title": "Envoyer l''email validé via Booqable",
      "description": "Envoie l''email après confirmation de l''opérateur",
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
