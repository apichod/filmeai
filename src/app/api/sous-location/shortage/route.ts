import { NextResponse } from 'next/server'

const SUBDOMAIN = process.env.BOOQABLE_SUBDOMAIN || ''
const KEY       = process.env.BOOQABLE_API_KEY    || ''
const BASE_BM   = `https://${SUBDOMAIN}.booqable.com/api/boomerang`

function headers() {
  return {
    Authorization:  `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Accept:         'application/json',
  }
}

export type ShortageRow = {
  id:           string
  number:       number
  status:       string
  starts_at:    string
  stops_at:     string
  customer_name: string
  item_count:   number
  grand_total_with_tax_in_cents: number
  url:          string
}

/**
 * GET /api/sous-location/shortage
 *
 * Commandes en pénurie (location_shortage=true, statuts draft ou reserved).
 */
export async function GET() {
  const PAGE_SIZE = 100
  const baseUrl =
    `${BASE_BM}/orders` +
    `?sort=-starts_at` +
    `&filter[statuses][]=draft` +
    `&filter[statuses][]=reserved` +
    `&filter[location_shortage]=true` +
    `&include=customer` +
    `&page[size]=${PAGE_SIZE}`

  const allData:     V4Resource[] = []
  const allIncluded: V4Resource[] = []
  let pageNum = 1

  while (true) {
    const res = await fetch(`${baseUrl}&page[number]=${pageNum}`, {
      headers: headers(),
      signal:  AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Booqable ${res.status}: ${text}` }, { status: 500 })
    }
    const data = await res.json() as V4Response
    allData.push(...(data.data || []))
    allIncluded.push(...(data.included || []))
    if ((data.data || []).length < PAGE_SIZE) break
    pageNum++
  }

  const customerMap = new Map<string, string>()
  for (const item of allIncluded) {
    if (item.type === 'customers') {
      customerMap.set(item.id, String((item.attributes as CustomerAttrs).name ?? '—'))
    }
  }

  const rows: ShortageRow[] = allData.map(order => {
    const a = order.attributes as OrderAttrs
    return {
      id:           order.id,
      number:       Number(a.number ?? 0),
      status:       String(a.status ?? ''),
      starts_at:    String(a.starts_at ?? ''),
      stops_at:     String(a.stops_at  ?? ''),
      customer_name: customerMap.get(String(a.customer_id ?? '')) ?? '—',
      item_count:   Number(a.item_count ?? 0),
      grand_total_with_tax_in_cents: Number(a.grand_total_with_tax_in_cents ?? 0),
      url:          `https://${SUBDOMAIN}.booqable.com/orders/${order.id}`,
    }
  })

  return NextResponse.json({ rows, total: rows.length })
}

type V4Resource = { id: string; type: string; attributes: Record<string, unknown> }
type V4Response = { data?: V4Resource[]; included?: V4Resource[] }
type OrderAttrs = {
  number?: number
  status?: string
  starts_at?: string
  stops_at?: string
  customer_id?: string
  item_count?: number
  grand_total_with_tax_in_cents?: number
}
type CustomerAttrs = { name?: string }
