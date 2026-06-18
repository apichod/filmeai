import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type CachedProduct = {
  id: string
  name: string
  description: string | null
  enriched_text: string | null
}

// Generate enriched text for a single product via GPT-4o-mini
async function enrichProduct(p: CachedProduct): Promise<string> {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `Tu es expert en location de matériel audiovisuel professionnel.

Pour ce produit de catalogue de location, génère une fiche enrichie en français (150-250 mots) avec :
1. Catégorie principale (caméra / optique / lumière / son / grip / data / énergie / machinerie / accessoire)
2. Marque et références alternatives (variantes d'écriture, abréviations courantes dans la profession)
   Exemples : "Sony FX6" → "FX-6, FX 6, Sony FX6 Mark I" ; "70-200mm" → "70-200, 70200, zoom 70-200"
3. Usages typiques (type de tournage, contexte professionnel)
4. Accessoires souvent associés ou compatibles
5. Alternatives proches dans la même catégorie

Produit : ${p.name}
Description existante : ${p.description ? p.description.slice(0, 500) : 'Aucune'}

Réponds uniquement avec le texte enrichi en prose, sans JSON ni titres formatés. Commence par la catégorie.`,
    }],
    temperature: 0.3,
    max_tokens: 400,
  })
  return res.choices[0].message.content?.trim() || p.name
}

// POST — enrich a batch of products
// Params: ?offset=0&limit=100&force=false
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.SYNC_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '80'), 100)
  const force = req.nextUrl.searchParams.get('force') === 'true'

  const supabase = getSupabaseAdmin()

  try {
    // Fetch products to enrich
    const query = supabase
      .from('products_cache')
      .select('id, name, description, enriched_text')
      .eq('archived', false)
      .eq('show_in_store', true)
      .range(offset, offset + limit - 1)
      .order('name')

    // By default only process products without custom enrichment
    // (enriched_text currently just holds "name. description")
    // force=true re-enriches everything
    if (!force) {
      // Heuristic: if enriched_text is short (≤ name + description + 5 chars), it needs enrichment
      // We filter in JS after fetching since we can't easily do this in SQL
    }

    const { data: products, error } = await query
    if (error) throw new Error(error.message)
    if (!products?.length) {
      return NextResponse.json({ processed: 0, offset, message: 'No products found at this offset' })
    }

    // Filter products that need enrichment (unless force=true)
    const toEnrich: CachedProduct[] = force
      ? products
      : products.filter(p => {
          const et = p.enriched_text || ''
          const baseline = `${p.name}. ${p.description || ''}`.slice(0, 2000)
          // Needs enrichment if enriched_text is basically just name+description
          return et.length < baseline.length + 50
        })

    if (toEnrich.length === 0) {
      return NextResponse.json({
        processed: 0,
        skipped: products.length,
        offset,
        message: 'All products in this batch already enriched. Use ?force=true to re-enrich.',
      })
    }

    // Enrich in parallel (batches of 20 to avoid rate limits)
    const PARALLEL = 20
    const enrichedTexts: string[] = []

    for (let i = 0; i < toEnrich.length; i += PARALLEL) {
      const batch = toEnrich.slice(i, i + PARALLEL)
      const results = await Promise.all(batch.map(p => enrichProduct(p)))
      enrichedTexts.push(...results)
    }

    // Generate new embeddings for enriched texts
    const EMBED_BATCH = 100
    const embeddings: number[][] = []
    for (let i = 0; i < enrichedTexts.length; i += EMBED_BATCH) {
      const batch = enrichedTexts.slice(i, i + EMBED_BATCH)
      const embRes = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
      })
      embeddings.push(...embRes.data.map(d => d.embedding))
    }

    // Update products_cache
    const updates = toEnrich.map((p, i) => ({
      id: p.id,
      enriched_text: enrichedTexts[i],
      embedding: JSON.stringify(embeddings[i]),
      last_synced_at: new Date().toISOString(),
    }))

    for (let i = 0; i < updates.length; i += 50) {
      const batch = updates.slice(i, i + 50)
      const { error: upsertError } = await supabase
        .from('products_cache')
        .upsert(batch, { onConflict: 'id' })
      if (upsertError) throw new Error(`Upsert error: ${upsertError.message}`)
    }

    // Count total for progress reporting
    const { count: total } = await supabase
      .from('products_cache')
      .select('*', { count: 'exact', head: true })
      .eq('archived', false)
      .eq('show_in_store', true)

    return NextResponse.json({
      processed: toEnrich.length,
      skipped: products.length - toEnrich.length,
      offset,
      nextOffset: offset + limit,
      total: total ?? 0,
      done: offset + limit >= (total ?? 0),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('enrich-catalog error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET — enrichment status
export async function GET() {
  const supabase = getSupabaseAdmin()

  const { count: total } = await supabase
    .from('products_cache')
    .select('*', { count: 'exact', head: true })
    .eq('archived', false)
    .eq('show_in_store', true)

  // Count enriched = enriched_text significantly longer than name+description
  const { data: sample } = await supabase
    .from('products_cache')
    .select('name, description, enriched_text')
    .eq('archived', false)
    .eq('show_in_store', true)
    .limit(200)

  const enriched = (sample || []).filter(p => {
    const et = p.enriched_text || ''
    const baseline = `${p.name}. ${p.description || ''}`.slice(0, 2000)
    return et.length >= baseline.length + 50
  }).length

  const enrichedPct = sample?.length ? Math.round((enriched / sample.length) * 100) : 0

  return NextResponse.json({
    total: total ?? 0,
    enriched_sample: `${enriched}/${sample?.length ?? 0} (${enrichedPct}%)`,
    hint: 'POST with Authorization: Bearer <SYNC_SECRET> to enrich. Add ?offset=N&limit=80 for pagination.',
  })
}
