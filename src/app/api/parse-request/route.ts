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

type Product = {
  id: string
  name: string
  description: string | null
  price_per_day: number | null
  deposit: number | null
  photo_url: string | null
  similarity?: number
}

async function hybridSearch(query: string, limit = 5): Promise<Product[]> {
  const supabase = getSupabaseAdmin()
  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const embedding = embRes.data[0].embedding

  const { data, error } = await supabase.rpc('search_products', {
    query_text: query,
    query_embedding: JSON.stringify(embedding),
    match_count: limit,
  })

  if (error) {
    const { data: fallback } = await supabase
      .from('products_cache')
      .select('id, name, description, price_per_day, deposit, photo_url')
      .eq('archived', false)
      .ilike('name', `%${query}%`)
      .limit(limit)
    return (fallback || []) as Product[]
  }

  return (data || []) as Product[]
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json() as { message: string }

    // Step 1: Extract product names in order with GPT-4o-mini
    const extractRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Tu es un expert en location de matériel audiovisuel.
Extrais la liste des équipements demandés dans ce message client, DANS L'ORDRE EXACT où ils sont mentionnés.
Pour chaque équipement, donne le terme de recherche optimal (marque + modèle si mentionnés, sinon catégorie).

Message : "${message}"

Réponds uniquement en JSON : { "products": ["terme1", "terme2", ...] }
Si aucun produit n'est mentionné : { "products": [] }`
      }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    })

    type ExtractResult = { products?: string[] }
    let extracted: ExtractResult = {}
    try {
      extracted = JSON.parse(extractRes.choices[0].message.content || '{}') as ExtractResult
    } catch {
      extracted = {}
    }

    const productNames = extracted.products || []
    if (productNames.length === 0) {
      return NextResponse.json({ items: [] })
    }

    // Step 2: Search each product in parallel — preserving order
    const searches = await Promise.all(
      productNames.map(async (name) => {
        const results = await hybridSearch(name, 5)
        return {
          requestedName: name,
          matched: results[0] || null,
          alternatives: results.slice(1, 4),
        }
      })
    )

    return NextResponse.json({ items: searches })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('parse-request error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
