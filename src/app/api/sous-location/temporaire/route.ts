import { NextResponse } from 'next/server'

const SUBDOMAIN = process.env.BOOQABLE_SUBDOMAIN || ''
const KEY       = process.env.BOOQABLE_API_KEY    || ''
const BASE_V4   = `https://${SUBDOMAIN}.booqable.com/api/4`

function headers() {
  return {
    Authorization:  `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Accept:         'application/json',
  }
}

export type TemporaireRow = {
  id:               string
  product_id:       string
  product_group_id: string
  product_name:     string
  tracking_type:    'trackable' | 'bulk'
  location_id:      string
  location_name:    string
  stock_count:      number
  from:             string | null
  till:             string | null
  status:           'expected' | 'in_stock' | 'expired'
}

function computeStatus(from: string | null, till: string | null): TemporaireRow['status'] {
  const now  = Date.now()
  const tillMs = till ? new Date(till).getTime() : null
  const fromMs = from ? new Date(from).getTime() : null
  if (tillMs && tillMs <= now) return 'expired'
  if (fromMs && fromMs > now) return 'expected'
  return 'in_stock'
}

/**
 * GET /api/sous-location/temporaire
 *
 * Utilise stock_counts V4 : tous les enregistrements ayant une date till
 * sont des stocks temporaires (sous-locations).
 * On filtre till[gt]=2020-01-01 pour ne récupérer que les lignes ayant un till.
 */
export async function GET() {
  const PAGE_SIZE = 100
  // Filtre : tout stock avec un till > 2020 = temporaire (passé, présent, futur)
  const baseUrl =
    `${BASE_V4}/stock_counts` +
    `?filter[till][gt]=2020-01-01T00:00:00Z` +
    `&include=product,location` +
    `&sort=from` +
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
      return NextResponse.json(
        { error: `Booqable ${res.status}: ${text}` },
        { status: 500 },
      )
    }
    const data = await res.json() as V4Response
    allData.push(...(data.data || []))
    allIncluded.push(...(data.included || []))
    if ((data.data || []).length < PAGE_SIZE) break
    pageNum++
  }

  // Index products et locations depuis included
  const productMap  = new Map<string, { name: string; tracking_type: string; product_group_id: string }>()
  const locationMap = new Map<string, string>()

  for (const item of allIncluded) {
    if (item.type === 'products' || item.type === 'product_groups') {
      const a = item.attributes as ProductAttrs
      productMap.set(item.id, {
        name:             a.name ?? a.slug ?? item.id,
        tracking_type:    a.tracking_type ?? 'bulk',
        product_group_id: String(a.product_group_id ?? item.id),
      })
    }
    if (item.type === 'locations') {
      const a = item.attributes as LocationAttrs
      locationMap.set(item.id, a.name ?? item.id)
    }
  }

  const rows: TemporaireRow[] = allData
    .filter(item => {
      // Ne garder que les lignes avec un till (= stock temporaire)
      const a = item.attributes as StockCountAttrs
      return !!a.till
    })
    .map(item => {
      const a              = item.attributes as StockCountAttrs
      const productId      = String(a.product_id ?? a.item_id ?? '')
      const locationId     = String(a.location_id ?? '')
      const product        = productMap.get(productId)
      const locName        = locationMap.get(locationId) ?? locationId
      const fromVal        = a.from ?? null
      const tillVal        = a.till ?? null

      return {
        id:               item.id,
        product_id:       productId,
        product_group_id: product?.product_group_id ?? productId,
        product_name:     product?.name ?? productId,
        tracking_type:    (product?.tracking_type === 'trackable' ? 'trackable' : 'bulk') as 'trackable' | 'bulk',
        location_id:      locationId,
        location_name:    locName,
        stock_count:      Number(a.quantity ?? a.stock_count ?? 0),
        from:             fromVal,
        till:             tillVal,
        status:           computeStatus(fromVal, tillVal),
      }
    })

  // Tri : actifs d'abord, puis à venir, puis expirés
  const ORDER: Record<string, number> = { in_stock: 0, expected: 1, expired: 2 }
  rows.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.product_name.localeCompare(b.product_name))

  return NextResponse.json({ rows, total: rows.length })
}

// ── Types internes ─────────────────────────────────────────────────────────────

type V4Resource = {
  id:         string
  type:       string
  attributes: Record<string, unknown>
}

type V4Response = {
  data?:     V4Resource[]
  included?: V4Resource[]
}

type StockCountAttrs = {
  product_id?:  string
  item_id?:     string
  location_id?: string
  quantity?:    number
  stock_count?: number
  from?:        string | null
  till?:        string | null
}

type ProductAttrs = {
  name?:             string
  slug?:             string
  tracking_type?:    string
  product_group_id?: string
}

type LocationAttrs = {
  name?: string
}
