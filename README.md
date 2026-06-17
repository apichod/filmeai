# FilmeAI — latest patch bundle

Ce dossier regroupe les derniers fichiers patchés pour FilmeAI, avec la même arborescence que le projet Next.js.

## Ce que ça contient

- Recherche/parsing IA strict : `src/app/api/parse-request/route.ts`
- Création devis Booqable + sauvegarde structurée : `src/app/api/create-quote/route.ts`
- API conversations/devis :
  - `src/app/api/conversations/route.ts`
  - `src/app/api/conversations/[id]/route.ts`
- Sync catalogue Booqable product_groups + bundles : `src/app/api/sync-catalog/route.ts`
- Pages back-office :
  - `src/app/(app)/requests/page.tsx`
  - `src/app/(app)/requests/[id]/page.tsx`
  - `src/app/(app)/requests/new/page.tsx`
- Migration Supabase : `supabase/migrations/005_quote_details.sql`

## Installation dans le vrai repo

Depuis le terminal :

```bash
cd ~/Library/"Application Support"/Claude/local-agent-mode-sessions/2ac46ffc-200a-4ed8-a58a-133f5ed438a5/f7188d5b-99bf-4100-a49e-c57bd72db035/local_4cfb652f-e662-4ea2-840e-b40fe22f55ac/outputs/renkko

rsync -av "/Users/aurelien/Documents/Codex/2026-06-17/renkko-website-code/outputs/filmeai-latest-patch/" ./

git add src/app/api/parse-request/route.ts \
  src/app/api/create-quote/route.ts \
  src/app/api/conversations/route.ts \
  "src/app/api/conversations/[id]/route.ts" \
  src/app/api/sync-catalog/route.ts \
  "src/app/(app)/requests/page.tsx" \
  "src/app/(app)/requests/[id]/page.tsx" \
  "src/app/(app)/requests/new/page.tsx" \
  supabase/migrations/005_quote_details.sql

git commit -m "feat: structured quote requests and Booqable catalog flow"

git push origin main
```

## Supabase

Avant ou après le push, ouvrir `supabase/migrations/005_quote_details.sql`, copier le SQL dans Supabase SQL Editor, puis Run.
