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
    return NextResponse.json(data || [])
  } catch {
    // Fallback to simple text search
    const { data } = await supabase
      .from('products_cache')
      .select('id, name, description, price_per_day, deposit, photo_url')
      .eq('archived', false)
      .ilike('name', `%${q}%`)
      .limit(8)
    return NextResponse.json(data || [])
  }
}
