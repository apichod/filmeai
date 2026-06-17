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

const MIN_SIMILARITY = 0.18

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

  if (error || !data?.length) {
    // Fallback: trigram / ilike on name
    const { data: fallback } = await supabase
      .from('products_cache')
      .select('id, name, description, price_per_day, deposit, photo_url')
      .eq('archived', false)
      .ilike('name', `%${query.split(' ').filter(w => w.length > 2)[0] || query}%`)
      .limit(limit)
    return (fallback || []) as Product[]
  }

  // Filter out low-confidence results
  return (data as Product[]).filter(p => (p.similarity || 0) >= MIN_SIMILARITY)
}

// ── Extraction prompt ─────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `Tu es expert en location de matériel audiovisuel professionnel (caméras cinéma, optiques, lumières, son, grip, machinerie, data, énergie).

Ta mission : extraire CHAQUE équipement d'une liste matériel, dans l'ORDRE EXACT où il apparaît.

RÈGLES ABSOLUES :
1. Développe TOUJOURS les abréviations en termes de recherche complets avec marque :
   • "fx6" ou "FX6" → "Sony FX6 caméra cinéma"
   • "fx3" → "Sony FX3 caméra"
   • "fx9" → "Sony FX9 caméra"
   • "indie 5" ou "INDIE 5" → "Atomos Shogun Indie 5 moniteur champ"
   • "cine 24" → "moniteur cinéma 24 pouces"
   • "shogun" → "Atomos Shogun moniteur enregistreur"
   • "bpu" → "batterie alimentation V-Mount BPU"
   • "vlock" ou "v-lock" → "batterie V-Lock V-Mount"
   • "150" dans contexte énergie → "batterie V-Mount 150Wh"
   • "hotswap double" → "système hotswap batterie V-Mount"
   • "70-200" → "objectif zoom 70-200mm"
   • "24-70" → "objectif zoom 24-70mm"
   • "16-35" → "objectif grand angle 16-35mm"
   • "filtre black promist 82mm" → "filtre Black Pro-Mist 82mm diffusion"
   • "solidcom c1" → "intercom Hollyland Solidcom C1"
   • "hollyland hub" → "Hollyland hub casques intercom"
   • "Atem sdi" ou "ATEM" → "mélangeur vidéo Blackmagic ATEM SDI"
   • "macbook" → "ordinateur Apple MacBook"
   • "usbc vers rj45" ou "usbc rj45" → "adaptateur USB-C ethernet RJ45"
   • "512gb" ou "512 go" → "SSD disque dur 512 Go"
   • "magliner" → "chariot Magliner transport"
   • "touret bnc 50m" ou "touret" → "dévidoir câble SDI BNC 50m"
   • "pieds roulettes" → "pieds à roulettes stand dolly"
   • "trépied léger" → "trépied léger vidéo"
   • "micro cravate" ou "HF" → "micro HF cravate sans fil"
   • "licence davinci" → "logiciel DaVinci Resolve licence"
   • "silverstack" → "logiciel Silverstack backup"
   • "intercom" seul → "système intercom sans fil"
2. Extrais la quantité depuis les préfixes (3×, 5x, 14×, 2x, 1x…) — par défaut 1
3. Chaque modèle/référence différente = un item séparé
4. Ignore les dates et infos administratives (Essai, Rendu, →, etc.)
5. Un item par ligne de résultat

JSON : { "items": [{ "query": "terme recherche catalogue enrichi", "quantity": 1, "raw": "texte brut client" }] }
Si aucun produit : { "items": [] }`

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json() as { message: string }

    // ── Step 1: Extract + expand with GPT-4o-mini ─────────────────────────────
    const extractRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: `Message client :\n"${message}"` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500,
    })

    type ExtractedItem = { query: string; quantity: number; raw: string }
    type ExtractResult = { items?: ExtractedItem[] }

    let extracted: ExtractResult = {}
    try {
      extracted = JSON.parse(extractRes.choices[0].message.content || '{}') as ExtractResult
    } catch {
      extracted = {}
    }

    const extractedItems: ExtractedItem[] = (extracted.items || []).map(item => ({
      query: item.query || '',
      quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
      raw: item.raw || item.query || '',
    })).filter(item => item.query.trim().length > 0)

    if (extractedItems.length === 0) {
      return NextResponse.json({ items: [] })
    }

    // ── Step 2: Parallel hybrid search, preserving order ─────────────────────
    const searches = await Promise.all(
      extractedItems.map(async (item) => {
        const results = await hybridSearch(item.query, 6)
        return {
          requestedName: item.raw,
          searchQuery: item.query,
          quantity: item.quantity,
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
