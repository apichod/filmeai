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
      "id": "1",
      "type": "action",
      "title": "Identifier la commande",
      "description": "fetch_order — récupérer la commande de retour à régulariser",
      "booqable_action": "fetch_order"
    },
    {
      "id": "2",
      "type": "instruction",
      "title": "Changer la date de retour",
      "description": "⚠️ Dans Booqable : changer la date de retour de la commande d''origine par celle du jour"
    },
    {
      "id": "3",
      "type": "instruction",
      "title": "Retourner le matériel",
      "description": "Dans Booqable : retourner tous les articles de la commande"
    },
    {
      "id": "4",
      "type": "action",
      "title": "Remplacer le tag",
      "description": "add_tag : supprimer R21_OPEN, ajouter R22_WAIVED",
      "booqable_action": "add_tag"
    }
  ]',
  prompt      = $$WORKFLOW : RETARD – RÉGULARISÉ (R11-22A)
Tout le matériel a été rendu, mais avec du retard. Aucun dommage constaté.
Ce workflow régularise la commande d'origine directement — aucune SAV order à créer.

Étapes :
1. fetch_order → identifier la commande et confirmer les articles
2. Demander à l'opérateur de changer la date de retour par celle du jour dans Booqable (⚠️ action manuelle)
3. Demander à l'opérateur de retourner le matériel dans Booqable (action manuelle)
4. add_tag : retirer R21_OPEN, ajouter R22_WAIVED

Règles :
- Ne pas créer de SAV order.
- Ne pas facturer de pénalités sauf indication contraire de l'opérateur.
- Confirmer chaque étape manuelle avec l'opérateur avant de passer à la suivante.$$,
  updated_at  = NOW()
WHERE slug = 'late_returned';
