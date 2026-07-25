import { NextRequest, NextResponse } from 'next/server'

const KEY       = process.env.BOOQABLE_API_KEY
const SUBDOMAIN = process.env.BOOQABLE_SUBDOMAIN || ''
const BASE      = `https://${SUBDOMAIN}.booqable.com/api/boomerang`

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
 * PATCH /api/boomerang/orders/{id} avec properties_attributes par identifier
 * (même approche que addSAVComment, adapté pour un champ date_field)
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as { order_id?: string; date?: string }
  const { order_id, date } = body

  if (!order_id || !date) {
    return NextResponse.json({ error: 'order_id et date requis' }, { status: 400 })
  }

  // Valeur ISO datetime attendue par Booqable pour un date_field
  const valueISO = `${date}T12:00:00.000Z`

  const res = await fetch(`${BASE}/orders/${order_id}`, {
    method:  'PATCH',
    headers: bqHeaders(),
    body: JSON.stringify({
      order: {
        properties_attributes: [
          {
            identifier:    'date_sav',
            name:          'Date suivi SAV',
            property_type: 'date_field',
            show_on:       [],
            value:         valueISO,
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
