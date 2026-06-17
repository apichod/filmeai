import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const BOOQABLE_BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/1`
const BOOQABLE_KEY = process.env.BOOQABLE_API_KEY

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type BooqableRawProduct = {
  id: string
  name: string
  description?: string
  base_price_as_decimal?: string
  deposit_as_decimal?: string
  photo_url?: string
  archived?: boolean
}

// Fetch all Booqable product_groups (catalog-level items: individual rentals + packs)
// We use product_groups, NOT /products (which are individual stock SKUs — subsets of groups)
// This avoids duplicates and gives us customer-facing names & pricing
async function fetchAllBooqableProductGroups(): Promise<BooqableRawProduct[]> {
  const all: BooqableRawProduct[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const res = await fetch(
      `${BOOQABLE_BASE}/product_groups?api_key=${BOOQABLE_KEY}&per=200&page=${page}`
    )
    if (!res.ok) throw new Error(`product_groups fetch error: ${res.status}`)
    const data = await res.json()
    const groups: BooqableRawProduct[] = data.product_groups || []
    all.push(...groups)
    hasMore = groups.length === 200
    page++
  }

  return all
}

// Build enriched text for embedding — nom + description nettoyée
function buildEnrichedText(p: BooqableRawProduct): string {
  const cleanDesc = p.description
    ? p.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    : ''
  return `${p.name}. ${cleanDesc}`.slice(0, 2000)
}

// Generate embeddings in batches (max 2048 inputs per call)
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const BATCH = 100
  const embeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    })
    embeddings.push(...res.data.map(d => d.embedding))
    console.log(`Embeddings ${i + batch.length}/${texts.length}`)
  }

  return embeddings
}

export async function POST(req: NextRequest) {
  // Protect with a secret (set SYNC_SECRET in Vercel env vars)
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.SYNC_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('Fetching Booqable product_groups...')
    const allRaw = await fetchAllBooqableProductGroups()
    const active = allRaw.filter(p => !p.archived)
    console.log(`Found ${allRaw.length} product_groups (${active.length} active)`)

    // Build enriched texts
    const enrichedTexts = active.map(buildEnrichedText)

    // Generate embeddings
    console.log('Generating embeddings...')
    const embeddings = await generateEmbeddings(enrichedTexts)

    // Upsert to Supabase
    const supabase = getSupabaseAdmin()
    const rows = active.map((p, i) => ({
      id: p.id,
      name: p.name,
      description: p.description
        ? p.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
        : null,
      price_per_day: p.base_price_as_decimal ? parseFloat(p.base_price_as_decimal) : null,
      deposit: p.deposit_as_decimal ? parseFloat(p.deposit_as_decimal) : null,
      photo_url: p.photo_url || null,
      archived: false,
      enriched_text: enrichedTexts[i],
      embedding: JSON.stringify(embeddings[i]), // pgvector accepts JSON array string
      last_synced_at: new Date().toISOString(),
    }))

    // Upsert in batches of 50
    let upserted = 0
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50)
      const { error } = await supabase
        .from('products_cache')
        .upsert(batch, { onConflict: 'id' })

      if (error) throw new Error(`Supabase upsert error: ${error.message}`)
      upserted += batch.length
    }

    // Mark archived products as archived in cache
    const activeIds = active.map(p => p.id)
    await supabase
      .from('products_cache')
      .update({ archived: true })
      .not('id', 'in', `(${activeIds.map(id => `'${id}'`).join(',')})`)

    return NextResponse.json({
      success: true,
      product_groups: allRaw.length,
      active: active.length,
      upserted,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Sync error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET — quick status check
export async function GET() {
  const supabase = getSupabaseAdmin()
  const { count } = await supabase
    .from('products_cache')
    .select('*', { count: 'exact', head: true })
    .eq('archived', false)

  return NextResponse.json({ cached_products: count ?? 0 })
}
