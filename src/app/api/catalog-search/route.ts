import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type CatalogProduct = {
  id: string
  name: string
  description: string | null
  price_per_day: number | null
  deposit: number | null
  photo_url: string | null
  similarity?: number | null
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function queryWantsPack(value: string): boolean {
  return /\b(pack|kit|serie|série|set|duo|cine|ciné|cinema|cinéma|reportage|standard|essentiel|multicam)\b/.test(normalizeText(value))
}

function productLooksLikePack(product: CatalogProduct): boolean {
  return /\b(pack|kit|serie|série|set|duo)\b/.test(normalizeText(`${product.name} ${product.description || ''}`))
}

function sortCatalogResults(products: CatalogProduct[], query: string): CatalogProduct[] {
  const wantsPack = queryWantsPack(query)
  return [...products].sort((a, b) => {
    if (wantsPack) {
      const packDelta = Number(productLooksLikePack(b)) - Number(productLooksLikePack(a))
      if (packDelta !== 0) return packDelta
    }
    return (b.similarity || 0) - (a.similarity || 0)
  })
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q || q.trim().length < 2) return NextResponse.json([])

  const supabase = getSupabaseAdmin()

  try {
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: q.trim(),
    })
    const embedding = embRes.data[0].embedding

    const { data, error } = await supabase.rpc('search_products', {
      query_text: q.trim(),
      query_embedding: JSON.stringify(embedding),
      match_count: 8,
    })

    if (error) throw error
    return NextResponse.json(sortCatalogResults((data || []) as CatalogProduct[], q.trim()))
  } catch {
    // Fallback to simple text search
    const { data } = await supabase
      .from('products_cache')
      .select('id, name, description, price_per_day, deposit, photo_url')
      .eq('archived', false)
      .ilike('name', `%${q}%`)
      .limit(8)
    return NextResponse.json(sortCatalogResults((data || []) as CatalogProduct[], q.trim()))
  }
}
