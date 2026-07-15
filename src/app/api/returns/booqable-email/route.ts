import { NextRequest, NextResponse } from 'next/server'

const BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`
const KEY  = process.env.BOOQABLE_API_KEY

function headers() {
  return {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

export type BooqableEmail = {
  id: string
  subject: string | null
  body: string | null
  created_at: string | null
  sent_at: string | null
  recipients: string | null
}

/**
 * GET /api/returns/booqable-email?order_id=<id>
 * Retourne le dernier email envoyé via Booqable pour une commande donnée.
 */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('order_id')
  if (!orderId) return NextResponse.json({ error: 'order_id param required' }, { status: 400 })

  const url =
    `${BASE}/emails` +
    `?filter[order_id]=${encodeURIComponent(orderId)}` +
    `&sort=-created_at` +
    `&page[number]=1&page[size]=5`

  const res = await fetch(url, {
    method: 'GET',
    headers: headers(),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Booqable error ${res.status}: ${text}` }, { status: 500 })
  }

  const data = await res.json() as {
    data?: Array<{
      id: string
      attributes: {
        subject?: string | null
        body?: string | null
        created_at?: string | null
        sent_at?: string | null
        recipient?: string | null
        recipients?: string | null
      }
    }>
  }

  const emails: BooqableEmail[] = (data.data || []).map(e => ({
    id:         e.id,
    subject:    e.attributes.subject    ?? null,
    body:       e.attributes.body       ?? null,
    created_at: e.attributes.created_at ?? null,
    sent_at:    e.attributes.sent_at    ?? null,
    recipients: (e.attributes.recipients ?? e.attributes.recipient) ?? null,
  }))

  // Log brut pour debug
  if (data.data?.[0]) {
    console.log('[booqable-email] raw attrs:', JSON.stringify(data.data[0].attributes, null, 2))
  }

  return NextResponse.json({ emails })
}
