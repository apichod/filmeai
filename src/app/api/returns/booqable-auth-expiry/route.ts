import { NextRequest, NextResponse } from 'next/server'

const KEY       = process.env.BOOQABLE_API_KEY
const SUBDOMAIN = process.env.BOOQABLE_SUBDOMAIN || ''

export type AuthExpiry = {
  found:                  boolean
  captureBefore:          string | null   // ISO date string
  daysLeft:               number | null   // jours entiers jusqu'à expiration
  capturableAmountCents:  number
}

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('order_id')
  if (!orderId) return NextResponse.json({ error: 'order_id requis' }, { status: 400 })

  const url = `https://${SUBDOMAIN}.booqable.com/api/boomerang/orders/${orderId}?include=payments,payments.payment_method`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
  })

  if (!res.ok) return NextResponse.json({ error: `Booqable ${res.status}` }, { status: 502 })

  const json = await res.json() as { included?: unknown[] }
  const included = Array.isArray(json.included) ? json.included : []

  const now = new Date()

  const active = (included as Array<{ type: string; attributes: Record<string, unknown> }>)
    .filter(item => {
      if (item.type !== 'payment_authorizations') return false
      const a = item.attributes
      const captureBefore = a.capture_before ? new Date(a.capture_before as string) : null
      return (
        a.status === 'succeeded' &&
        a.provider_method === 'card' &&
        a.capturable === true &&
        Number(a.deposit_capturable_in_cents ?? 0) > 0 &&
        !a.captured_at &&
        !a.expired_at &&
        !a.canceled_at &&
        captureBefore instanceof Date &&
        !isNaN(captureBefore.getTime()) &&
        captureBefore > now
      )
    })
    .sort((a, b) =>
      new Date(a.attributes.capture_before as string).getTime() -
      new Date(b.attributes.capture_before as string).getTime()
    )

  if (active.length === 0) {
    return NextResponse.json({ found: false, captureBefore: null, daysLeft: null, capturableAmountCents: 0 } satisfies AuthExpiry)
  }

  const auth = active[0]
  const captureBefore = auth.attributes.capture_before as string
  const captureDate   = new Date(captureBefore)
  const msLeft        = captureDate.getTime() - now.getTime()
  const daysLeft      = Math.ceil(msLeft / (1000 * 60 * 60 * 24))

  return NextResponse.json({
    found:                 true,
    captureBefore,
    daysLeft,
    capturableAmountCents: Number(auth.attributes.deposit_capturable_in_cents ?? 0),
  } satisfies AuthExpiry)
}
