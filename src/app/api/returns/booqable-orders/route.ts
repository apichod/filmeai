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

  // Index des ressources incluses
  const included = data.included || []
  const customerMap  = new Map<string, string>()             // id → name
  const propsByOrder = new Map<string, Map<string, string>>() // orderId → {identifier: value}

  for (const item of included) {
    if (item.type === 'customers') {
      customerMap.set(item.id, (item.attributes as CustomerAttrs).name || '—')
    }
    if (item.type === 'properties') {
      const attrs   = item.attributes as PropAttrs
      const ownerId = (item.relationships as PropRels)?.owner?.data?.id
      if (ownerId) {
        if (!propsByOrder.has(ownerId)) propsByOrder.set(ownerId, new Map())
        propsByOrder.get(ownerId)!.set(attrs.identifier || '', attrs.value || '')
      }
    }
  }

  const rows: BooqableOrderRow[] = (data.data || []).map(order => {
    const attrs  = order.attributes as OrderAttrs
    const custId = (order.relationships as OrderRels)?.customer?.data?.id
    const props  = propsByOrder.get(order.id) || new Map()

    return {
      id:            order.id,
      number:        attrs.number ?? '',
      customer_name: custId ? (customerMap.get(custId) || '—') : '—',
      order_sav:     props.get('order_sav')  || props.get('order_origin') || '',
      notes_sav:     props.get('notes_sav')  || props.get('note_interne') || '',
      starts_at:     attrs.starts_at || '',
      stops_at:      attrs.stops_at  || '',
      status:        attrs.status    || '',
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

type OrderAttrs    = { number?: string | number; status?: string; starts_at?: string; stops_at?: string; tag_list?: string | string[] }
type OrderRels     = { customer?: { data?: { id: string } } }
type CustomerAttrs = { name?: string }
type PropAttrs     = { identifier?: string; value?: string }
type PropRels      = { owner?: { data?: { id: string } } }
