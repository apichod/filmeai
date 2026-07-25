import { NextRequest, NextResponse } from 'next/server'

const KEY       = process.env.BOOQABLE_API_KEY
const SUBDOMAIN = process.env.BOOQABLE_SUBDOMAIN || ''
// API v1 — même endpoint que addSAVComment (fonctionne avec { order: { properties_attributes } })
const BASE      = `https://${SUBDOMAIN}.booqable.com/api/1`

function bqHeaders() {
  return {
    Authorization:  `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Accept:         'application/json',
  }
}

/**
 * POST /api/returns/booqable-set-sav-date
 * Body: { order_id: string, date: string } — date au format YYYY-MM-DD
 *
 * PATCH /api/1/orders/{id} avec properties_attributes par identifier
 * (même format que addSAVComment)
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as { order_id?: string; date?: string }
  const { order_id, date } = body

  if (!order_id || !date) {
    return NextResponse.json({ error: 'order_id et date requis' }, { status: 400 })
  }

  const res = await fetch(`${BASE}/orders/${order_id}`, {
    method:  'PATCH',
    headers: bqHeaders(),
    body: JSON.stringify({
      order: {
        properties_attributes: [
          {
            identifier: 'date_sav',
            name:       'Date suivi SAV',
            value:      date,
          },
        ],
      },
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Booqable ${res.status}: ${text}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, date })
}
