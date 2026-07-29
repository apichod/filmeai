import { NextRequest, NextResponse } from 'next/server'

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

export type CreateTemporaireItem = {
  product_id:  string
  location_id: string
  quantity:    number
  starts_at:   string  // ISO — from order
  stops_at:    string  // ISO — from order
}

/**
 * POST /api/sous-location/create-temporaire
 *
 * Pour chaque article en shortage sélectionné :
 * - from  = starts_at − 4h (temps pour récupérer le matériel avant le début)
 * - till  = stops_at  + 4h (temps pour le rendre après la fin)
 *
 * Fonctionne pour bulk ET trackable via /api/boomerang/stock_adjustments.
 */
export async function POST(req: NextRequest) {
  const { items } = await req.json() as { items: CreateTemporaireItem[] }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Aucun article fourni' }, { status: 400 })
  }

  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

  const results = await Promise.all(items.map(async item => {
    const from = new Date(new Date(item.starts_at).getTime() - FOUR_HOURS_MS).toISOString()
    const till = new Date(new Date(item.stops_at).getTime()  + FOUR_HOURS_MS).toISOString()

    const body = {
      stock_adjustment: {
        product_id:             item.product_id,
        location_id:            item.location_id,
        quantity:               item.quantity,
        from,
        till,
        purchase_cost_in_cents: null,
        purchased_at:           null,
      },
      data: {
        type: 'stock_adjustments',
        attributes: {
          product_id:             item.product_id,
          location_id:            item.location_id,
          quantity:               item.quantity,
          from,
          till,
          purchase_cost_in_cents: null,
          purchased_at:           null,
        },
      },
    }

    try {
      const res = await fetch(`${BASE_BM}/stock_adjustments`, {
        method:  'POST',
        headers: headers(),
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        const text = await res.text()
        let detail = text
        try { detail = (JSON.parse(text) as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail ?? text } catch { /* ignore */ }
        return { product_id: item.product_id, success: false, error: detail }
      }
      return { product_id: item.product_id, success: true }
    } catch (e) {
      return { product_id: item.product_id, success: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
    }
  }))

  const failed  = results.filter(r => !r.success)
  const created = results.filter(r => r.success).length

  if (failed.length === results.length) {
    return NextResponse.json({ error: failed[0]?.error ?? 'Échec', results }, { status: 422 })
  }

  return NextResponse.json({ created, failed: failed.length, results })
}
