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

type ExtractedItem = {
  raw: string
  query: string
  quantity: number
}

type CandidateSet = {
  item: ExtractedItem
  candidates: Product[]
}

type RerankSelection = {
  index: number
  product_id: string | null
  confidence: number
  reason?: string
}

type RerankResult = {
  selections?: RerankSelection[]
}

const MIN_SIMILARITY = 0.16
const MIN_RERANK_CONFIDENCE = 0.68

const STOPWORDS = new Set([
  'avec', 'pour', 'vers', 'plus', 'moins', 'sans', 'de', 'du', 'des', 'la', 'le', 'les',
  'en', 'et', 'ou', 'sur', 'un', 'une', 'au', 'aux', 'camera', 'caméra', 'objectif',
  'objectifs', 'moniteur', 'energie', 'énergie', 'data', 'machine', 'machinerie', 'type',
])

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[^a-z0-9+\-\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripQuantityPrefix(value: string): string {
  return value
    // x5 fx6 → fx6 ; ×5 fx6 → fx6
    .replace(/(^|\s)[x×]\s*(\d+)\s+/gi, ' ')
    // 5x fx6 → fx6 ; 5× fx6 → fx6
    .replace(/(^|\s)(\d+)\s*[x×]\s+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function significantTokens(value: string): string[] {
  const norm = normalizeText(stripQuantityPrefix(value))
  const rawTokens = norm.match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || []
  const expanded: string[] = []

  for (const token of rawTokens) {
    if (token.includes('-')) expanded.push(...token.split('-').filter(Boolean))
    expanded.push(token)
  }

  return Array.from(new Set(
    expanded
      .map(t => t.trim())
      .filter(t => t.length >= 2 && !STOPWORDS.has(t))
  ))
}

function queryHasAllTokens(product: Product, tokens: string[]): boolean {
  const haystack = normalizeText(`${product.name} ${product.description || ''}`)
  return tokens.every(token => haystack.includes(normalizeText(token)))
}

function importantModelTokens(item: ExtractedItem): string[] {
  const text = normalizeText(`${item.raw} ${item.query}`)
  const tokens = significantTokens(text)
  const important = tokens.filter(token =>
    /^(fx3|fx6|fx9|fx30|b10x|b10|atem|ntg3|c1|r5|r6|rj45|bpu|bpu60|bpu90|vmount|vlock|v-lock|indie|shogun|sachtler|magliner|macbook)$/.test(token) ||
    /^\d{2,3}$/.test(token) ||
    /^\d{2,3}mm$/.test(token) ||
    /^\d{2,3}gb$/.test(token) ||
    /^\d{2,3}go$/.test(token) ||
    /^\d{2,3}wh$/.test(token)
  )

  return Array.from(new Set(important))
}

function deterministicScore(product: Product, item: ExtractedItem): number {
  const name = normalizeText(product.name)
  const haystack = normalizeText(`${product.name} ${product.description || ''}`)
  const raw = normalizeText(stripQuantityPrefix(item.raw))
  const query = normalizeText(item.query)
  const tokens = significantTokens(`${item.raw} ${item.query}`)
  const important = importantModelTokens(item)

  let score = product.similarity || 0

  if (raw && name.includes(raw)) score += 1.1
  if (query && name.includes(query)) score += 0.9

  const matchedTokens = tokens.filter(token => haystack.includes(normalizeText(token))).length
  if (tokens.length) score += (matchedTokens / tokens.length) * 0.8

  const matchedImportant = important.filter(token => haystack.includes(normalizeText(token))).length
  if (important.length) score += (matchedImportant / important.length) * 1.4

  // Hard-ish penalties: if a model/reference is present in the request but absent from the candidate,
  // the candidate is usually dangerous. This prevents “x5 fx6” → “Insta360 X5”, etc.
  for (const token of important) {
    if (!haystack.includes(normalizeText(token))) score -= 0.85
  }

  // Product family sanity checks
  const familyRules: Array<[RegExp, RegExp]> = [
    [/\bfx6\b/, /\bfx6\b/],
    [/\bfx3\b/, /\bfx3\b/],
    [/\bfx30\b/, /\bfx30\b/],
    [/\bb10x\b/, /\bb10x\b/],
    [/\batem\b/, /\batem\b/],
    [/\bntg3\b/, /\bntg3\b/],
    [/\bsachtler\b/, /\bsachtler\b/],
    [/\bmagliner\b/, /\bmagliner\b/],
    [/\b70\s*-?\s*200\b/, /\b70\s*-?\s*200\b/],
    [/\b24\s*-?\s*70\b/, /\b24\s*-?\s*70\b/],
    [/\b16\s*-?\s*35\b/, /\b16\s*-?\s*35\b/],
    [/\b82\s*mm\b/, /\b82\s*mm\b/],
    [/\b512\s*(gb|go)\b/, /\b512\s*(gb|go)\b|\b512\b/],
  ]

  const requestText = normalizeText(`${item.raw} ${item.query}`)
  for (const [requestPattern, productPattern] of familyRules) {
    if (requestPattern.test(requestText) && !productPattern.test(haystack)) score -= 1.2
  }

  return score
}

function dedupeProducts(products: Product[]): Product[] {
  const map = new Map<string, Product>()
  for (const product of products) {
    if (!map.has(product.id)) map.set(product.id, product)
  }
  return Array.from(map.values())
}

async function rpcSearch(query: string, limit = 20): Promise<Product[]> {
  if (!query.trim()) return []

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

  if (error || !data?.length) return []
  return (data as Product[]).filter(p => (p.similarity || 0) >= MIN_SIMILARITY)
}

async function directNameSearch(item: ExtractedItem, limit = 16): Promise<Product[]> {
  const supabase = getSupabaseAdmin()
  const tokens = significantTokens(`${item.raw} ${item.query}`)

  // Prioritize model/reference tokens first. Searching all tokens blindly is how we get nonsense.
  const anchors = Array.from(new Set([
    ...importantModelTokens(item),
    ...tokens.filter(t => t.length >= 3).slice(0, 6),
  ])).slice(0, 8)

  const found: Product[] = []
  for (const anchor of anchors) {
    const { data } = await supabase
      .from('products_cache')
      .select('id, name, description, price_per_day, deposit, photo_url')
      .eq('archived', false)
      .ilike('name', `%${anchor}%`)
      .limit(limit)

    if (data?.length) found.push(...data as Product[])
  }

  return dedupeProducts(found)
}

async function candidateSearch(item: ExtractedItem): Promise<Product[]> {
  const cleanedRaw = stripQuantityPrefix(item.raw)
  const [expandedResults, rawResults, directResults] = await Promise.all([
    rpcSearch(item.query, 24),
    rpcSearch(cleanedRaw, 12),
    directNameSearch(item, 20),
  ])

  const candidates = dedupeProducts([...directResults, ...expandedResults, ...rawResults])
    .map(product => ({ product, score: deterministicScore(product, item) }))
    .filter(({ product, score }) => {
      const important = importantModelTokens(item)
      // If the request has strong references, require at least one in the candidate text.
      if (important.length >= 1 && !queryHasAllTokens(product, important.slice(0, 2))) {
        return score >= 0.9
      }
      return score >= 0.12
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 14)
    .map(({ product }) => product)

  return candidates
}

const EXTRACTION_PROMPT = `Tu es expert en location de matériel audiovisuel professionnel.

Ta mission : extraire CHAQUE équipement d'une liste matériel, dans l'ORDRE EXACT où il apparaît.

RÈGLES ABSOLUES :
1. Les préfixes de quantité peuvent être écrits AVANT l'article : "x5 fx6", "×5 fx6", "5x fx6", "5× fx6" signifient quantity=5 et raw="fx6". N'inclus JAMAIS "x5" dans la query produit.
2. Développe les abréviations en termes de recherche complets avec marque, mais garde raw court et propre.
3. Chaque modèle/référence différente = un item séparé.
4. Ignore les dates et infos administratives (Essai, Rendu, →, etc.).
5. Si un texte contient un accessoire entre parenthèses, extrais aussi l'accessoire s'il est louable séparément.

GLOSSAIRE :
- fx6 → Sony FX6 caméra cinéma
- fx3 → Sony FX3 caméra
- fx9 → Sony FX9 caméra
- indie 5 → Atomos Shogun Indie 5 moniteur enregistreur
- cine 24 → moniteur vidéo 24 pouces
- bpu → batterie Sony BP-U
- vlock / v-lock → batterie V-Lock V-Mount
- bpu vers vlock → adaptateur BP-U vers V-Mount
- secteur → alimentation secteur caméra
- 70-200 → objectif zoom 70-200mm
- 24-70 → objectif zoom 24-70mm
- 16-35 → objectif zoom 16-35mm
- black promist 82mm → filtre Black Pro-Mist 82mm
- solidcom c1 → intercom Hollyland Solidcom C1
- hollyland hub → hub Hollyland Solidcom C1
- atem sdi → mélangeur vidéo Blackmagic ATEM SDI
- macbook → Apple MacBook
- usbc vers rj45 → adaptateur USB-C Ethernet RJ45
- 512gb / 512 go → SSD 512 Go
- hotswap double → système hotswap double V-Mount
- trépied léger type sachtler → trépied vidéo léger Sachtler
- pieds roulettes → pieds à roulettes / stand wheels
- magliner → chariot Magliner
- touret bnc 50m → touret câble BNC SDI 50m

Réponse JSON uniquement :
{ "items": [{ "raw": "fx6", "query": "Sony FX6 caméra cinéma", "quantity": 5 }] }
Si aucun produit : { "items": [] }`

async function extractItems(message: string): Promise<ExtractedItem[]> {
  const extractRes = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: EXTRACTION_PROMPT },
      { role: 'user', content: `Message client :\n${message}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 2200,
  })

  type ExtractResult = { items?: Partial<ExtractedItem>[] }
  let parsed: ExtractResult = {}
  try {
    parsed = JSON.parse(extractRes.choices[0].message.content || '{}') as ExtractResult
  } catch {
    parsed = {}
  }

  return (parsed.items || [])
    .map(item => ({
      raw: stripQuantityPrefix(String(item.raw || item.query || '')).trim(),
      query: stripQuantityPrefix(String(item.query || item.raw || '')).trim(),
      quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
    }))
    .filter(item => item.raw.length > 0 && item.query.length > 0)
}

async function rerankAll(candidateSets: CandidateSet[]): Promise<RerankSelection[]> {
  const payload = candidateSets.map((set, index) => ({
    index,
    raw: set.item.raw,
    query: set.item.query,
    quantity: set.item.quantity,
    candidates: set.candidates.map(candidate => ({
      id: candidate.id,
      name: candidate.name,
      price_per_day: candidate.price_per_day,
      description: (candidate.description || '').slice(0, 260),
      similarity: candidate.similarity || null,
    })),
  }))

  const rerankRes = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Tu es un reranker catalogue audiovisuel. Pour chaque item demandé, choisis UNIQUEMENT un product_id parmi ses candidates.

Règles strictes :
- Si aucun candidat ne correspond exactement ou clairement, retourne product_id:null.
- Ne choisis jamais un produit qui partage seulement un mot vague.
- Les références modèle sont sacrées : fx6 doit matcher FX6, 70-200 doit matcher 70-200, black promist 82mm doit matcher Black Pro-Mist 82mm.
- "x5" ou "5x" est une quantité, jamais le produit Insta360 X5 sauf si le client a explicitement demandé Insta360 X5.
- Donne confidence entre 0 et 1. Sous 0.68, utilise product_id:null.

JSON : { "selections": [{ "index": 0, "product_id": "..." | null, "confidence": 0.92, "reason": "..." }] }`,
      },
      { role: 'user', content: JSON.stringify({ items: payload }) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 3000,
  })

  try {
    const parsed = JSON.parse(rerankRes.choices[0].message.content || '{}') as RerankResult
    return parsed.selections || []
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json() as { message: string }

    const extractedItems = await extractItems(message)
    if (extractedItems.length === 0) return NextResponse.json({ items: [] })

    const candidateSets: CandidateSet[] = await Promise.all(
      extractedItems.map(async item => ({
        item,
        candidates: await candidateSearch(item),
      }))
    )

    const selections = await rerankAll(candidateSets)
    const selectionByIndex = new Map(selections.map(selection => [selection.index, selection]))

    const items = candidateSets.map((set, index) => {
      const selection = selectionByIndex.get(index)
      const selected = selection && selection.confidence >= MIN_RERANK_CONFIDENCE
        ? set.candidates.find(candidate => candidate.id === selection.product_id) || null
        : null

      return {
        requestedName: set.item.raw,
        searchQuery: set.item.query,
        quantity: set.item.quantity,
        matched: selected,
        confidence: selection?.confidence || 0,
        reason: selection?.reason || null,
        alternatives: set.candidates
          .filter(candidate => candidate.id !== selected?.id)
          .slice(0, 4),
      }
    })

    return NextResponse.json({ items })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('parse-request error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
