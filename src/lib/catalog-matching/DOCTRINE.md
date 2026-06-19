# Doctrine du moteur de matching catalogue FilmeAI

Ce document est la boussole du moteur `src/lib/catalog-matching`.
Avant toute modification du matching, privilégier ces principes plutôt que des exceptions produit par produit.

## Objectif

Transformer une demande client libre en lignes catalogue fiables, éditables et explicables.
Le moteur doit aider l'équipe Filme, pas inventer une certitude.

## Principe 1 — Règles générales avant exceptions

Ne pas coder une exception du type :

```txt
DJI Transmission => Récepteur vidéo DJI Transmission
```

Préférer une règle généralisable :

```txt
Si “récepteur / receiver / RX” est demandé, chercher aussi “récepteur vidéo” et “RX”.
```

Cette règle doit pouvoir servir pour DJI, Teradek, Accsoon, Hollyland, etc.

## Principe 2 — Les signaux métier ne sont pas absolus

Un signal validé côté interface, par exemple :

```txt
sony fx6 → Sony FX6 – pack essentiel
```

est valable quand le client demande la caméra :

```txt
Sony FX6
Caméra FX6
FX6 pack
```

Mais il ne doit pas écraser une demande d'accessoire :

```txt
câble déclencheur pour Sony FX6
batterie FX6
cage FX6
poignée FX6
```

Le signal doit être validé par l'intention de la ligne.

## Principe 3 — Le texte client exact reste sacré

Toujours conserver le texte exact client dans le diagnostic et l'interface :

```txt
Demandé : 1 Câble déclencheur pour Sony FX6
```

Le moteur peut produire un terme nettoyé et une query enrichie :

```txt
Terme matching : câble déclencheur pour Sony FX6
Query : câble déclencheur Sony FX6
```

Mais il ne doit jamais effacer l'intention d'origine.

## Principe 4 — Les caractéristiques techniques sont discriminantes

Ces éléments ne sont pas décoratifs. S'ils sont demandés, ils doivent être respectés ou rendre le match incertain :

```txt
SDI / HDMI
TX / RX
3000 / 1500 / 750
GM / GM II
1/8 / 1/4 / 1/2
82mm
256Go / 512Go
F1.2 / F1.4 / F2.8 / F4
RF / EF / FE / PL
```

Exemples :

```txt
ATEM SDI ≠ ATEM HDMI / non-SDI
GM II ≠ GM
Glimmerglass 1/4 ≠ Glimmerglass 1
Teradek Bolt 3000 TX/RX ≠ Teradek Bolt 750 RX seul
```

## Principe 5 — Les familles produit ne sont pas interchangeables

Ne jamais substituer automatiquement une famille par une autre :

```txt
Vari ND ≠ Pro-Mist
Glimmerglass ≠ Black Pro-Mist
Hollywood Black Magic ≠ Black Pro-Mist sauf signal humain explicite
Récepteur ≠ antenne / batterie / chargeur
Caméra ≠ cage / rig / poignée / câble
Pack caméra ≠ accessoire caméra
Objectif RF ≠ objectif EF ≠ objectif FE ≠ objectif PL
```

## Principe 6 — Le moteur fonctionne en couches

Ordre conceptuel :

```txt
1. Extraction liste
2. Application des signaux pertinents
3. Recherche hybride
   - direct / exact
   - fuzzy / variantes textuelles
   - vectorielle
4. Filtrage sécurité général
5. Reranking IA
6. Score déterministe en secours
7. Diagnostic explicable
```

Important : le déterministe ne doit jamais sauver un candidat dangereux.

## Principe 7 — Le reranking IA choisit, il n'invente pas

Le reranker ne peut choisir que parmi les candidats fournis.
S'il n'y a pas de candidat cohérent, il doit retourner `null`.

Le prompt de reranking est éditable côté interface, mais le code doit conserver des garde-fous bas niveau pour empêcher les erreurs manifestes.

## Principe 8 — Les prompts front pilotent le comportement métier

Les règles métier éditables doivent vivre dans :

```txt
/assistant/behavior
/assistant/knowledge/signaux
```

Le backend ne doit contenir que :

- normalisation technique ;
- expansion générique ;
- garde-fous bas niveau ;
- diagnostic ;
- orchestration.

Si une règle dépend d'une préférence Filme spécifique, préférer un signal ou un prompt éditable.

## Principe 9 — Le diagnostic est obligatoire

Chaque ligne doit pouvoir expliquer :

```txt
- le texte demandé exact ;
- le terme matching ;
- la query finale ;
- les influences de query ;
- les signaux utilisés ;
- les stats de recherche ;
- les candidats rejetés ;
- les raisons unsafe ;
- la source du choix final.
```

Le diagnostic est l'outil principal pour améliorer le moteur sans le casser.

## Principe 10 — Quand un bug apparaît

Avant de patcher :

1. Lire le diagnostic complet.
2. Identifier la couche fautive : extraction, signaux, recherche, safety, rerank, déterministe.
3. Chercher une règle générale.
4. Éviter l'exception produit si une règle métier générale suffit.
5. Ajouter la raison dans le diagnostic quand un candidat est rejeté.
6. Lancer lint + TypeScript.

## Anti-patterns interdits

Éviter :

```txt
Produit X => Produit Y codé en dur dans safety/search
Mot vague partagé => match fort
Signal front appliqué sans vérifier l'intention
Pack choisi juste parce que le client a écrit “kit”
Accessoire choisi pour une caméra demandée
Caméra choisie pour un accessoire demandé
```

## Phrase de rappel

> Généraliser l'intention, respecter les détails techniques, expliquer chaque décision.
