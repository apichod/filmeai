/**
 * GET /api/item-price?id=ITEM_ID
 *
 * Retourne le prix journalier de base d'un item Booqable (produit ou bundle).
 * Utilise l'endpoint v4 /item_prices pour les bundles dont le prix n'est pas
 * stocké directement dans le cache catalogue.
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type JsonRecord = Record<string, unknown>

function asRecord(v: unknown): JsonRecord | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonRecord) : null
}
function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return isFinite(n) ? n : null
  }
  return null
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const subdomain = process.env.BOOQABLE_SUBDOMAIN
  const apiKey    = process.env.BOOQABLE_API_KEY
  if (!subdomain || !apiKey) return NextResponse.json({ error: 'Config Booqable manquante' }, { status: 500 })

  const headers = { Authorization: `Bearer ${apiKey}` }
  const base = `https://${subdomain}.booqable.com`

  // ── 1. Essai v4 item_prices ──────────────────────────────────────────────
  try {
    const url = `${base}/api/4/item_prices?filter[item_id]=${id}`
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const json = await res.json() as { data?: unknown[] }
      const first = asRecord(json.data?.[0])
      const attrs = first ? asRecord(first.attributes) : null
      if (attrs) {
        // Priorité : original_charge_as_decimal → price_each_as_decimal → price_in_cents / 100
        const priceStr =
          (typeof attrs.original_charge_as_decimal === 'string' ? attrs.original_charge_as_decimal : null) ||
          (typeof attrs.price_each_as_decimal === 'string' ? attrs.price_each_as_decimal : null)
        if (priceStr) {
          const price = asNumber(priceStr)
          if (price !== null && price > 0) return NextResponse.json({ price_per_day: price })
        }
        const cents = asNumber(attrs.price_each_in_cents ?? attrs.original_charge_in_cents ?? null)
        if (cents !== null && cents > 0) return NextResponse.json({ price_per_day: cents / 100 })
      }
    }
  } catch { /* try next */ }

  // ── 2. Fallback v1 product_group ─────────────────────────────────────────
  try {
    const url = `${base}/api/1/product_groups/${id}?api_key=${apiKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const json = await res.json() as { product_group?: JsonRecord }
      const pg = asRecord(json.product_group)
      if (pg) {
        const price = asNumber(pg.base_price_as_decimal)
        if (price !== null && price > 0) return NextResponse.json({ price_per_day: price })
      }
    }
  } catch { /* try next */ }

  // ── 3. Fallback v1 bundle ────────────────────────────────────────────────
  try {
    const url = `${base}/api/1/bundles/${id}?api_key=${apiKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const json = await res.json() as { bundle?: JsonRecord }
      const bundle = asRecord(json.bundle)
      if (bundle) {
        const price = asNumber(bundle.base_price_as_decimal ?? bundle.price_as_decimal)
        if (price !== null && price > 0) return NextResponse.json({ price_per_day: price })
      }
    }
  } catch { /* give up */ }

  return NextResponse.json({ price_per_day: null })
}
