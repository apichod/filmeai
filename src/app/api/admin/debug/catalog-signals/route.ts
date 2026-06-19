import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type SignalRow = {
  id: string
  organization_id: string
  term: string
  normalized_term: string
  product_id: string | null
  product_name: string
  source: string
  confidence: number | null
  approved: boolean
  occurrences: number
  created_at: string
  updated_at: string
  last_seen_at: string
}

type ProductRow = {
  id: string
  name: string
  archived: boolean
  show_in_store: boolean
  source_type: string | null
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.SYNC_SECRET || auth !== `Bearer ${process.env.SYNC_SECRET}`) {
    return unauthorized()
  }

  const supabase = getSupabaseAdmin()
  const searchParams = req.nextUrl.searchParams
  const q = normalize(searchParams.get('q') || '')
  const approvedParam = searchParams.get('approved')
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 200), 1), 1000)

  let query = supabase
    .from('catalog_signals')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (approvedParam === 'true') query = query.eq('approved', true)
  if (approvedParam === 'false') query = query.eq('approved', false)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allSignals = (data || []) as SignalRow[]
  const signals = q
    ? allSignals.filter(signal =>
      normalize(`${signal.term} ${signal.normalized_term || ''} ${signal.product_name || ''}`).includes(q)
    )
    : allSignals

  const productIds = Array.from(new Set(signals.map(signal => signal.product_id).filter(Boolean))) as string[]
  const productNames = Array.from(new Set(signals.map(signal => signal.product_name).filter(Boolean)))

  const productsById = new Map<string, ProductRow>()
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('products_cache')
      .select('id, name, archived, show_in_store, source_type')
      .in('id', productIds)

    for (const product of (products || []) as ProductRow[]) {
      productsById.set(product.id, product)
    }
  }

  const productNamesFound = new Set<string>()
  if (productNames.length > 0) {
    for (const productName of productNames.slice(0, 80)) {
      const { data: matches } = await supabase
        .from('products_cache')
        .select('name')
        .eq('archived', false)
        .eq('show_in_store', true)
        .ilike('name', `%${productName.replace(/[%,]/g, ' ').trim()}%`)
        .limit(1)

      if (matches?.length) productNamesFound.add(productName)
    }
  }

  const enrichedSignals = signals.map(signal => {
    const linkedProduct = signal.product_id ? productsById.get(signal.product_id) || null : null
    return {
      ...signal,
      debug: {
        normalized_runtime_term: normalize(signal.term || ''),
        has_product_id: Boolean(signal.product_id),
        linked_product_exists: signal.product_id ? Boolean(linkedProduct) : null,
        linked_product_visible: linkedProduct ? linkedProduct.archived === false && linkedProduct.show_in_store === true : null,
        linked_product_name: linkedProduct?.name || null,
        product_name_found_in_visible_cache: productNamesFound.has(signal.product_name),
      },
    }
  })

  return NextResponse.json({
    ok: true,
    filters: {
      q: q || null,
      approved: approvedParam || null,
      limit,
    },
    count: enrichedSignals.length,
    signals: enrichedSignals,
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
