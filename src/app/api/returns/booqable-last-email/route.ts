import { NextRequest, NextResponse } from 'next/server'

const KEY       = process.env.BOOQABLE_API_KEY
const SUBDOMAIN = process.env.BOOQABLE_SUBDOMAIN || ''

export type LastEmailResult = {
  found:     boolean
  createdAt: string | null   // ISO timestamp
  subject:   string | null
  id:        string | null
}

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('order_id')
  if (!orderId) return NextResponse.json({ error: 'order_id requis' }, { status: 400 })

  const url =
    `https://${SUBDOMAIN}.booqable.com/api/4/emails` +
    `?filter[order_id][eq]=${encodeURIComponent(orderId)}` +
    `&sort=-created_at&page[size]=1`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/vnd.api+json' },
  })

  if (!res.ok) return NextResponse.json({ error: `Booqable ${res.status}` }, { status: 502 })

  const json = await res.json() as { data?: Array<{ id: string; attributes: Record<string, unknown> }> }
  const first = json.data?.[0]

  if (!first) return NextResponse.json({ found: false, createdAt: null, subject: null, id: null } satisfies LastEmailResult)

  return NextResponse.json({
    found:     true,
    createdAt: (first.attributes.created_at as string) ?? null,
    subject:   (first.attributes.subject   as string) ?? null,
    id:        first.id,
  } satisfies LastEmailResult)
}
