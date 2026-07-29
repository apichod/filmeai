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

export type CancelRequest = {
  tracking_type:    'trackable' | 'bulk'
  product_id:       string
  product_group_id: string
  location_id:      string
  stock_count:      number
  from:             string | null
  till:             string | null
  confirm_shortage?: boolean
}

/**
 * POST /api/sous-location/temporaire/cancel
 *
 * Annule un stock temporaire Booqable.
 *
 * — Produit trackable : archive les stock_items temporaires associés
 *   via POST /api/boomerang/stock_item_archivations
 *
 * — Produit bulk : crée un ajustement de stock inverse
 *   via POST /api/4/stock_adjustments avec quantity négative
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as CancelRequest
  const { tracking_type, product_id, product_group_id, location_id, stock_count, from, till, confirm_shortage = false } = body

  if (!product_id || !location_id) {
    return NextResponse.json({ error: 'product_id et location_id requis' }, { status: 400 })
  }

  // ── Trackable ──────────────────────────────────────────────────────────────
  if (tracking_type === 'trackable') {
    // 1. Récupère les stock_items temporaires pour ce produit/location/période
    let stockItemsUrl = `${BASE_BM}/stock_items?filter[product_id]=${product_id}&filter[location_id]=${location_id}&filter[archived]=false`
    if (from) stockItemsUrl += `&filter[from][gt]=${encodeURIComponent(from)}`
    if (till) stockItemsUrl += `&filter[till][lt]=${encodeURIComponent(till)}`

    const siRes = await fetch(stockItemsUrl, { headers: headers(), signal: AbortSignal.timeout(10000) })
    if (!siRes.ok) {
      const text = await siRes.text()
      return NextResponse.json({ error: `Booqable stock_items ${siRes.status}: ${text}` }, { status: 500 })
    }

    const siData = await siRes.json() as { data?: Array<{ id: string; attributes: { tracking_identifier?: string; from?: string | null; till?: string | null } }> }
    const stockItems = siData.data ?? []

    if (stockItems.length === 0) {
      return NextResponse.json({ error: 'Aucun stock_item temporaire trouvé pour ce produit et cette période.' }, { status: 404 })
    }

    // 2. Archive chaque stock_item
    const errors: string[] = []
    for (const si of stockItems) {
      const archRes = await fetch(`${BASE_BM}/stock_item_archivations`, {
        method:  'POST',
        headers: headers(),
        body: JSON.stringify({
          include: 'stock_item',
          stock_item_archivation: {
            stock_item_id:    si.id,
            confirm_shortage: confirm_shortage,
          },
          data: {
            type: 'stock_item_archivations',
            attributes: {
              stock_item_id:    si.id,
              confirm_shortage: confirm_shortage,
            },
          },
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (!archRes.ok) {
        const text = await archRes.text()
        let detail = text
        try { detail = (JSON.parse(text) as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail ?? text } catch { /* ignore */ }
        errors.push(`stock_item ${si.id}: ${detail}`)
      }
    }

    if (errors.length > 0 && errors.length === stockItems.length) {
      // Tous ont échoué
      const isShortage = errors.some(e => e.toLowerCase().includes('shortage') || e.toLowerCase().includes('pénurie'))
      return NextResponse.json({ error: errors[0], shortage: isShortage }, { status: 422 })
    }

    return NextResponse.json({
      success: true,
      archived: stockItems.length - errors.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  }

  // ── Bulk : ajustement inverse ──────────────────────────────────────────────
  // Essaie product_group_id en priorité (attendu par boomerang stock_adjustments),
  // puis product_id si le premier échoue.
  const effectiveProductId = product_group_id || product_id

  async function tryAdjustment(pid: string) {
    const body = {
      data: {
        type: 'stock_adjustments',
        attributes: {
          product_id:       pid,
          location_id,
          quantity:         -Math.abs(stock_count),
          ...(from ? { from } : {}),
          ...(till ? { till } : {}),
          confirm_shortage,
        },
      },
    }
    return fetch(`${BASE_BM}/stock_adjustments`, {
      method:  'POST',
      headers: headers(),
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(10000),
    })
  }

  let adjRes = await tryAdjustment(effectiveProductId)

  // Si le premier échoue avec l'erreur "products/product group" et qu'on a un fallback, réessaie
  if (!adjRes.ok && effectiveProductId !== product_id) {
    const peek = await adjRes.text()
    if (peek.includes('product')) {
      adjRes = await tryAdjustment(product_id)
    } else {
      // Autre erreur — parse et retourne
      let detail = peek
      try { detail = (JSON.parse(peek) as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail ?? peek } catch { /* ignore */ }
      const isShortage = detail.toLowerCase().includes('shortage')
      return NextResponse.json({ error: detail, shortage: isShortage }, { status: 422 })
    }
  }

  if (!adjRes.ok) {
    const text = await adjRes.text()
    let detail = text
    try { detail = (JSON.parse(text) as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail ?? text } catch { /* ignore */ }
    const isShortage = detail.toLowerCase().includes('shortage')
    return NextResponse.json({ error: detail, shortage: isShortage }, { status: 422 })
  }

  return NextResponse.json({ success: true })
}
