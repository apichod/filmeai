import { NextRequest, NextResponse } from 'next/server'

const KEY       = process.env.BOOQABLE_API_KEY
const SUBDOMAIN = process.env.BOOQABLE_SUBDOMAIN || ''

/**
 * POST /api/returns/booqable-set-sav-date
 * Body: { order_id: string, date: string } — date au format YYYY-MM-DD
 *
 * Patch le champ date_sav via l'API Boomerang (même endpoint que la lecture).
 * L'API v4 n'expose pas les properties en écriture directe.
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as { order_id?: string; date?: string }
  const { order_id, date } = body

  if (!order_id || !date) {
    return NextResponse.json({ error: 'order_id et date requis' }, { status: 400 })
  }

  const url = `https://${SUBDOMAIN}.booqable.com/api/boomerang/orders/${encodeURIComponent(order_id)}`
  const payload = {
    data: {
      type: 'orders',
      id:   order_id,
      attributes: {
        properties_attributes: [
          { identifier: 'date_sav', value: date },
        ],
      },
    },
  }

  const res = await fetch(url, {
    method:  'PATCH',
    headers: {
      Authorization:  `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Booqable ${res.status}: ${text}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, date })
}
