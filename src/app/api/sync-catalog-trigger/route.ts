/**
 * POST /api/sync-catalog-trigger
 * Proxy interne — appelé par le dashboard.
 * Transfère vers /api/sync-catalog en ajoutant le SYNC_SECRET côté serveur.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = process.env.SYNC_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'SYNC_SECRET non configuré.' }, { status: 500 })
  }

  const origin = new URL(req.url).origin
  const res = await fetch(`${origin}/api/sync-catalog`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  })

  const data = await res.json() as unknown
  return NextResponse.json(data, { status: res.status })
}
