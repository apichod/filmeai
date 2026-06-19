# Catalog matching engine — FilmeAI

Ce dossier contient la “boîte grise” du matching catalogue utilisé par `/requests/new`.

## Point d’entrée

- `quoteMatchingEngine.ts`

La route suivante ne fait plus que recevoir la requête HTTP et appeler ce moteur :

- `src/app/api/parse-request/route.ts`

## Ce que fait le moteur

1. Charge les prompts éditables depuis `assistant_settings`.
2. Charge les signaux validés depuis `catalog_signals`.
3. Injecte les signaux dans le prompt d’extraction.
4. Extrait les lignes matériel dans l’ordre exact de la demande.
5. Cherche les candidats dans `products_cache` :
   - signaux validés,
   - recherche directe par nom,
   - recherche hybride vectorielle / texte via `search_products`.
6. Applique les garde-fous bas niveau :
   - modèles sacrés (`FX3`, `FX6`, `24-70`, etc.),
   - familles produit (`Vari ND` ≠ `Pro-Mist`),
   - pack signalé ≠ produit nu,
   - caméra demandée ≠ cage / rig / accessoire.
7. Lance le reranking IA sur les candidats déjà filtrés.
8. Retourne les items, alternatives et le diagnostic IA copiable dans l’interface.

## Règle importante

Les règles métier doivent rester autant que possible dans :

- les prompts visibles dans `/assistant/behavior`,
- les signaux visibles dans `/assistant/knowledge`,
- les migrations SQL de signaux.

Le code ici doit surtout servir de garde-fou technique pour éviter les matchs dangereux.
