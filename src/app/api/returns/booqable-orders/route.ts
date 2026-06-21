import { NextRequest, NextResponse } from 'next/server'

const BASE      = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`
const KEY       = process.env.BOOQABLE_API_KEY
const SUBDOMAIN = process.env.BOOQABLE_SUBDOMAIN || ''

export type BooqableOrderRow = {
  id: string
  number: string | number
  customer_name: string
  order_sav: string
  notes_sav: string
  date_sav: string
  starts_at: string
  stops_at: string
  status: string
  url: string
}

function headers() {
  return {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

/**
 * GET /api/returns/booqable-orders?tag=LATE
 *
 * Utilise l'API boomerang de Booqable (API interne utilisée par le web app).
 * Filtre par tag avec filter[tag_list][]=<tag_en_minuscule>.
 */
export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get('tag')
  if (!tag) return NextResponse.json({ error: 'tag param required' }, { status: 400 })

  // Booqable stocke les tags en minuscule
  const tagLower = tag.toLowerCase()

  const url =
    `${BASE}/orders` +
    `?sort=-number` +
    `&filter[tag_list][]=${encodeURIComponent(tagLower)}` +
    `&filter[statuses][not_eq][]=canceled` +
    `&filter[statuses][not_eq][]=archived` +
    `&filter[statuses][not_eq][]=new` +
    `&include=customer,properties` +
    `&page[number]=1&page[size]=100`

  const res = await fetch(url, {
    method: 'GET',
    headers: headers(),
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Booqable error ${res.status}: ${text}` }, { status: 500 })
  }

  const data = await res.json() as V4Response

  // Index des customers depuis included
  const customerMap = new Map<string, string>() // id → name
  for (const item of (data.included || [])) {
    if (item.type === 'customers') {
      customerMap.set(item.id, (item.attributes as CustomerAttrs).name || '—')
    }
  }

  const rows: BooqableOrderRow[] = (data.data || []).map(order => {
    const attrs  = order.attributes as OrderAttrs
    // Properties sont directement dans attributes.properties (pas dans included)
    const props  = attrs.properties || {}
    const custId = attrs.customer_id

    return {
      id:            order.id,
      number:        attrs.number ?? '',
      customer_name: custId ? (customerMap.get(custId) || '—') : '—',
      order_sav:     props.order_sav  || '',
      notes_sav:     props.notes_sav  || '',
      date_sav:      props.date_sav   || '',
      starts_at:     attrs.starts_at  || '',
      stops_at:      attrs.stops_at   || '',
      status:        attrs.status     || '',
      url:           `https://${SUBDOMAIN}.booqable.com/orders/${order.id}`,
    }
  })

  return NextResponse.json({ orders: rows })
}

// ── Types internes (JSON:API) ──────────────────────────────────────────────────

type V4Resource = {
  id: string
  type: string
  attributes: Record<string, unknown>
  relationships?: Record<string, unknown>
}

type V4Response = {
  data?: V4Resource[]
  included?: V4Resource[]
  meta?: Record<string, unknown>
}

type OrderProps = {
  order_sav?: string | null
  notes_sav?: string | null
  date_sav?:  string | null
  [key: string]: string | null | undefined
}
type OrderAttrs    = { number?: string | number; status?: string; starts_at?: string; stops_at?: string; tag_list?: string | string[]; properties?: OrderProps; customer_id?: string }
type CustomerAttrs = { name?: string }
