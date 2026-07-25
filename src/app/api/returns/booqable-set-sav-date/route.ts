import { NextRequest, NextResponse } from 'next/server'

const KEY       = process.env.BOOQABLE_API_KEY
const SUBDOMAIN = process.env.BOOQABLE_SUBDOMAIN || ''

/**
 * POST /api/returns/booqable-set-sav-date
 * Body: { order_id: string, date: string } — date au format YYYY-MM-DD
 *
 * Patch le custom field date_sav d'un order Booqable.
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as { order_id?: string; date?: string }
  const { order_id, date } = body

  if (!order_id || !date) {
    return NextResponse.json({ error: 'order_id et date requis' }, { status: 400 })
  }

  const url = `https://${SUBDOMAIN}.booqable.com/api/4/orders/${encodeURIComponent(order_id)}`
  const payload = {
    data: {
      type: 'orders',
      id:   order_id,
      attributes: { custom_fields: { date_sav: date } },
    },
  }

  const res = await fetch(url, {
    method:  'PATCH',
    headers: {
      Authorization:  `Bearer ${KEY}`,
      'Content-Type': 'application/vnd.api+json',
      Accept:         'application/vnd.api+json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Booqable ${res.status}: ${text}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, date })
}
