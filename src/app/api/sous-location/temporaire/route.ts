import { NextResponse } from 'next/server'

const SUBDOMAIN = process.env.BOOQABLE_SUBDOMAIN || ''
const KEY       = process.env.BOOQABLE_API_KEY    || ''
const BASE_V4   = `https://${SUBDOMAIN}.booqable.com/api/4`
const BASE_BM   = `https://${SUBDOMAIN}.booqable.com/api/boomerang`

function headers() {
  return {
    Authorization:  `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Accept:         'application/json',
  }
}

export type TemporaireRow = {
  id:             string
  product_id:     string
  product_name:   string
  tracking_type:  'trackable' | 'bulk'
  location_id:    string
  location_name:  string
  stock_count:    number
  from:           string | null
  till:           string | null
  status:         'expected' | 'in_stock' | 'expired'
}

/**
 * GET /api/sous-location/temporaire
 *
 * Retourne tous les stocks temporaires Booqable (attendus + actifs + expirés).
 * Utilise l'API V4 inventory_breakdowns avec filter[inventory_breakdown_type]=temporary.
 */
async function fetchByStatus(status: string): Promise<{ data: V4Resource[]; included: V4Resource[]; error?: string }> {
  const PAGE_SIZE = 100
  const baseUrl =
    `${BASE_V4}/inventory_breakdowns` +
    `?filter[inventory_breakdown_type]=temporary` +
    `&filter[status]=${status}` +
    `&include=product,location` +
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
      return { data: [], included: [], error: `Booqable ${res.status}: ${text}` }
    }
    const data = await res.json() as V4Response
    allData.push(...(data.data || []))
    allIncluded.push(...(data.included || []))
    if ((data.data || []).length < PAGE_SIZE) break
    pageNum++
  }
  return { data: allData, included: allIncluded }
}

export async function GET() {
  // Booqable exige filter[status] — on fait 3 appels en parallèle
  const [resInStock, resExpected, resExpired] = await Promise.all([
    fetchByStatus('in_stock'),
    fetchByStatus('expected'),
    fetchByStatus('expired'),
  ])

  const firstError = resInStock.error ?? resExpected.error ?? resExpired.error
  if (firstError) {
    return NextResponse.json({ error: firstError }, { status: 500 })
  }

  const allData     = [...resInStock.data,     ...resExpected.data,     ...resExpired.data]
  const allIncluded = [...resInStock.included, ...resExpected.included, ...resExpired.included]

  // Index products et locations depuis included
  const productMap  = new Map<string, { name: string; tracking_type: string }>()
  const locationMap = new Map<string, string>()

  for (const item of allIncluded) {
    if (item.type === 'products') {
      const a = item.attributes as ProductAttrs
      productMap.set(item.id, {
        name:          a.name          ?? a.slug ?? item.id,
        tracking_type: a.tracking_type ?? 'bulk',
      })
    }
    if (item.type === 'locations') {
      const a = item.attributes as LocationAttrs
      locationMap.set(item.id, a.name ?? item.id)
    }
  }

  // Si des product_id ne sont pas dans included, fetch batch
  const missingProductIds = Array.from(new Set(
    allData
      .map(r => String((r.attributes as BreakdownAttrs).product_id ?? ''))
      .filter(id => id && !productMap.has(id))
  ))

  if (missingProductIds.length > 0) {
    try {
      const ids   = missingProductIds.join(',')
      const pRes  = await fetch(
        `${BASE_BM}/products?filter[id][]=${ids.split(',').join('&filter[id][]=')}`,
        { headers: headers(), signal: AbortSignal.timeout(10000) },
      )
      if (pRes.ok) {
        const pData = await pRes.json() as { data?: V4Resource[] }
        for (const p of pData.data ?? []) {
          const a = p.attributes as ProductAttrs
          productMap.set(p.id, {
            name:          a.name          ?? a.slug ?? p.id,
            tracking_type: a.tracking_type ?? 'bulk',
          })
        }
      }
    } catch { /* silencieux */ }
  }

  const rows: TemporaireRow[] = allData.map(item => {
    const a          = item.attributes as BreakdownAttrs
    const productId  = String(a.product_id  ?? '')
    const locationId = String(a.location_id ?? '')
    const product    = productMap.get(productId)
    const locName    = locationMap.get(locationId) ?? locationId

    return {
      id:            item.id,
      product_id:    productId,
      product_name:  product?.name ?? productId,
      tracking_type: (product?.tracking_type === 'trackable' ? 'trackable' : 'bulk') as 'trackable' | 'bulk',
      location_id:   locationId,
      location_name: locName,
      stock_count:   Number(a.stock_count ?? a.quantity ?? 0),
      from:          a.from  ?? null,
      till:          a.till  ?? null,
      status:        (a.status ?? 'in_stock') as TemporaireRow['status'],
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

type BreakdownAttrs = {
  product_id?:  string
  location_id?: string
  stock_count?: number
  quantity?:    number
  from?:        string | null
  till?:        string | null
  status?:      string
}

type ProductAttrs = {
  name?:          string
  slug?:          string
  tracking_type?: string
}

type LocationAttrs = {
  name?: string
}
