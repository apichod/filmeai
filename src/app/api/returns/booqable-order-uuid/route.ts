import { NextRequest, NextResponse } from 'next/server'

const KEY       = process.env.BOOQABLE_API_KEY
const SUBDOMAIN = process.env.BOOQABLE_SUBDOMAIN || ''

export async function GET(req: NextRequest) {
  const number = req.nextUrl.searchParams.get('number')
  if (!number) return NextResponse.json({ error: 'number requis' }, { status: 400 })

  const url = `https://${SUBDOMAIN}.booqable.com/api/4/orders?filter[number][eq]=${encodeURIComponent(number)}&fields[orders]=number`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
  })

  if (!res.ok) return NextResponse.json({ error: `Booqable ${res.status}` }, { status: 502 })

  const json = await res.json() as { data?: { id: string }[] }
  const id   = json.data?.[0]?.id
  if (!id) return NextResponse.json({ error: `Order #${number} introuvable` }, { status: 404 })

  return NextResponse.json({ id, url: `https://${SUBDOMAIN}.booqable.com/orders/${id}` })
}
