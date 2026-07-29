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

export type ShortageItem = {
  planning_id:      string
  order_id:         string
  order_number:     number
  customer_name:    string
  item_name:        string
  product_id:       string
  location_id:      string
  quantity:         number
  shortage_amount:  number
  starts_at:        string
  stops_at:         string
  order_url:        string
}

/**
 * GET /api/sous-location/shortage
 *
 * 1. Récupère toutes les commandes avec location_shortage=true (draft + reserved)
 * 2. Pour chaque commande, récupère les articles en pénurie via plannings
 * 3. Retourne une liste plate d'articles en shortage
 */
export async function GET() {
  // ── Étape 1 : commandes en pénurie ──────────────────────────────────────────
  const ordersUrl =
    `${BASE_BM}/orders` +
    `?sort=-starts_at` +
    `&filter[statuses][]=draft` +
    `&filter[statuses][]=reserved` +
    `&filter[location_shortage]=true` +
    `&include=customer` +
    `&page[size]=100`

  const ordersRes = await fetch(ordersUrl, { headers: headers(), signal: AbortSignal.timeout(15000) })
  if (!ordersRes.ok) {
    const text = await ordersRes.text()
    return NextResponse.json({ error: `Booqable orders ${ordersRes.status}: ${text}` }, { status: 500 })
  }

  const ordersData = await ordersRes.json() as V4Response
  const orders     = ordersData.data ?? []
  const included   = ordersData.included ?? []

  const customerMap = new Map<string, string>()
  for (const item of included) {
    if (item.type === 'customers') {
      customerMap.set(item.id, String((item.attributes as CustomerAttrs).name ?? '—'))
    }
  }

  if (orders.length === 0) return NextResponse.json({ items: [], total: 0 })

  // ── Étape 2 : plannings en shortage pour chaque commande (parallèle) ────────
  const results = await Promise.all(orders.map(async order => {
    const a            = order.attributes as OrderAttrs
    const orderNumber  = Number(a.number ?? 0)
    const customerName = customerMap.get(String(a.customer_id ?? '')) ?? '—'
    const orderUrl     = `https://${SUBDOMAIN}.booqable.com/orders/${order.id}`
    const locationId   = String(a.start_location_id ?? '')

    const planUrl =
      `${BASE_BM}/plannings` +
      `?filter[order_id]=${order.id}` +
      `&filter[location_shortage_amount][gt]=0` +
      `&include=item` +
      `&page[size]=100`

    try {
      const planRes = await fetch(planUrl, { headers: headers(), signal: AbortSignal.timeout(10000) })
      if (!planRes.ok) return []

      const planData = await planRes.json() as V4Response
      const plannings = planData.data ?? []
      const planIncluded = planData.included ?? []

      const itemMap = new Map<string, string>()
      for (const inc of planIncluded) {
        if (inc.type === 'products' || inc.type === 'product_groups' || inc.type === 'bundles') {
          itemMap.set(inc.id, String((inc.attributes as ItemAttrs).name ?? inc.id))
        }
      }

      return plannings.map(p => {
        const pa      = p.attributes as PlanningAttrs
        const itemRel = (p.relationships?.item as { data?: { id?: string } } | undefined)?.data
        const itemId  = itemRel?.id ?? ''
        return {
          planning_id:     p.id,
          order_id:        order.id,
          order_number:    orderNumber,
          customer_name:   customerName,
          item_name:       itemMap.get(itemId) ?? itemId,
          product_id:      itemId,
          location_id:     locationId,
          quantity:        Number(pa.quantity             ?? 0),
          shortage_amount: Number(pa.location_shortage_amount ?? 0),
          starts_at:       String(pa.starts_at ?? a.starts_at ?? ''),
          stops_at:        String(pa.stops_at  ?? a.stops_at  ?? ''),
          order_url:       orderUrl,
        } satisfies ShortageItem
      })
    } catch {
      return []
    }
  }))

  const items = results.flat()

  // Tri : date de début décroissante
  items.sort((a, b) => b.starts_at.localeCompare(a.starts_at))

  return NextResponse.json({ items, total: items.length })
}

// ── Types internes ─────────────────────────────────────────────────────────────

type V4Resource = {
  id:            string
  type:          string
  attributes:    Record<string, unknown>
  relationships?: Record<string, unknown>
}
type V4Response = { data?: V4Resource[]; included?: V4Resource[] }

type OrderAttrs    = { number?: number; starts_at?: string; stops_at?: string; customer_id?: string; start_location_id?: string }
type CustomerAttrs = { name?: string }
type PlanningAttrs = { quantity?: number; location_shortage_amount?: number; starts_at?: string; stops_at?: string }
type ItemAttrs     = { name?: string }
