/**
 * POST /api/sync-catalog-trigger
 * SSE — stream de progression pour le dashboard.
 * Appelle /api/sync-catalog avec le SYNC_SECRET côté serveur.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function sse(controller: ReadableStreamDefaultController, event: string, data: object) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  controller.enqueue(new TextEncoder().encode(payload))
}

export async function POST(req: Request) {
  const secret = process.env.SYNC_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'SYNC_SECRET non configuré.' }, { status: 500 })
  }

  const origin = new URL(req.url).origin

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Étape 1 — lancement
        sse(controller, 'progress', { pct: 5, label: 'Connexion à Booqable…' })

        // Tick progressif pendant que le serveur travaille
        let pct = 5
        const STAGES = [
          { target: 20, label: 'Récupération du catalogue…', delay: 1500 },
          { target: 45, label: 'Récupération des bundles…', delay: 2000 },
          { target: 60, label: 'Génération des embeddings…', delay: 2500 },
          { target: 80, label: 'Génération des embeddings…', delay: 3000 },
          { target: 90, label: 'Mise à jour de la base de données…', delay: 2000 },
        ]

        let stageIdx = 0
        const ticker = setInterval(() => {
          if (stageIdx >= STAGES.length) return
          const { target, label } = STAGES[stageIdx]
          pct = Math.min(pct + 3, target)
          sse(controller, 'progress', { pct, label })
          if (pct >= target) stageIdx++
        }, 800)

        // Appel réel
        const res = await fetch(`${origin}/api/sync-catalog`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}` },
        })

        clearInterval(ticker)

        const data = await res.json() as Record<string, unknown>

        if (!res.ok) {
          sse(controller, 'error', { message: (data.error as string) ?? 'Erreur lors de la synchronisation.' })
        } else {
          sse(controller, 'progress', { pct: 100, label: 'Synchronisation terminée ✓' })
          sse(controller, 'done', data)
          // Log activity (best-effort)
          try {
            await fetch(`${origin}/api/activity`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'Catalogue synchronisé' }),
            })
          } catch { /* silently ignore */ }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        sse(controller, 'error', { message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
