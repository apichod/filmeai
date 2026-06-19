# Catalog matching engine — FilmeAI

Ce dossier contient la “boîte grise” du matching catalogue utilisé par `/requests/new` et par le chat quand il traite une demande de devis sur liste.

## Point d’entrée

- `quoteMatchingEngine.ts` : orchestrateur principal.

La route HTTP suivante ne fait plus que recevoir la requête et appeler ce moteur :

- `src/app/api/parse-request/route.ts`

## Modules

- `extract.ts` : extraction des lignes matériel depuis le message client, via le prompt “Extraction liste”.
- `signals.ts` : chargement et application des signaux / alias validés dans `/assistant/knowledge`.
- `search.ts` : recherche catalogue.
  - recherche par signaux ;
  - recherche directe par nom ;
  - recherche vectorielle + texte via OpenAI embeddings + Supabase RPC `search_products`.
- `rerank.ts` : reranking IA des candidats déjà trouvés, via le prompt “Reranking catalogue”.
- `safety.ts` : garde-fous bas niveau contre les matchs dangereux.
  - modèle/focale/monture incohérents ;
  - famille produit incompatible ;
  - caméra demandée ≠ cage/rig/accessoire ;
  - signal pack ≠ produit nu.
- `diagnostics.ts` : construction du résultat final, des alternatives et du diagnostic IA copiable.
- `prompts.ts` : lecture des prompts éditables dans `assistant_settings`.
- `db.ts` : client Supabase service role + organisation par défaut.
- `openai.ts` : client OpenAI partagé.
- `text.ts` : normalisation texte, quantités, tokens importants.
- `types.ts` : types et seuils partagés.

## Recherche vectorielle

Elle est dans `search.ts` :

- `createEmbeddingMap()` crée les embeddings avec `text-embedding-3-small`.
- `rpcSearch()` appelle Supabase `search_products(query_text, query_embedding, match_count)`.

Cette recherche vectorielle est combinée avec :

- les signaux validés ;
- la recherche directe par nom ;
- le score déterministe ;
- le reranking IA.

## Règle importante

Les règles métier doivent rester autant que possible dans :

- les prompts visibles dans `/assistant/behavior`,
- les signaux visibles dans `/assistant/knowledge`,
- les migrations SQL de signaux.

Le code ici doit surtout servir de garde-fou technique et rendre le raisonnement inspectable via le diagnostic IA.
