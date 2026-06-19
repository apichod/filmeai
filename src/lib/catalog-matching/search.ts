import { getSupabaseAdmin } from './db'
import { openai } from './openai'
import { isInstructionOnlySignal, matchingSignalsForItem, signalNameMatchesProduct } from './signals'
import { candidateIsUnsafe, deterministicScore, importantModelTokens, queryHasAllTokens } from './safety'
import { normalizeText, significantTokens, spacedModelVariant, stripQuantityPrefix } from './text'
import { MIN_SIMILARITY } from './types'
import type { CatalogSignal, EmbeddingMap, ExtractedItem, Product, SearchDebug } from './types'



function flexibleSqlPatterns(phrase: string): string[] {
  const clean = phrase.replace(/[%,]/g, ' ').replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim()
  if (!clean) return []

  const patterns = new Set<string>()
  patterns.add(`%${clean}%`)

  const focal = clean.match(/\b(12|14|15|16|24|70)\s*-\s*(24|35|70|105|200)\s*(?:mm)?\b/i)
  const aperture = clean.match(/\bf?\s*(1\.2|1\.4|1\.8|2\.8|4)\b/i)?.[1]
  const mount = clean.match(/\b(fe|rf|ef|pl|e)\b/i)?.[1]
  const brand = clean.match(/\b(sony|canon|sigma|tamron)\b/i)?.[1]

  if (focal) {
    const start = focal[1]
    const end = focal[2]
    patterns.add(`%${start}%${end}%`)
    patterns.add(`%${start}%${end}%mm%`)
    if (aperture) {
      patterns.add(`%${start}%${end}%${aperture}%`)
      patterns.add(`%${start}%${end}%F${aperture}%`)
      patterns.add(`%${start}%${end}%f${aperture}%`)
    }
    if (mount) patterns.add(`%${mount}%${start}%${end}%`)
    if (brand) patterns.add(`%${brand}%${start}%${end}%`)
  }

  if (/\brs\s*3\b/i.test(clean) || /\brs3\b/i.test(clean)) {
    patterns.add('%Ronin%RS%3%')
    patterns.add('%Ronin%RS3%')
  }
  if (/\brs\s*4\b/i.test(clean) || /\brs4\b/i.test(clean)) {
    patterns.add('%Ronin%RS%4%')
    patterns.add('%Ronin%RS4%')
  }

  return Array.from(patterns).filter(pattern => pattern.replace(/%/g, '').length >= 2)
}

function expandSearchPhrase(phrase: string): string[] {
  const clean = phrase.replace(/[%,]/g, ' ').replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim()
  if (!clean) return []

  const variants = new Set<string>([clean])
  variants.add(spacedModelVariant(clean))

  const focalMatch = clean.match(/\b(12\s*-\s*24|14\s*-\s*24|15\s*-\s*35|16\s*-\s*35|24\s*-\s*70|24\s*-\s*105|70\s*-\s*200)\s*(?:mm)?\b/i)
  if (focalMatch) {
    const focal = focalMatch[1].replace(/\s+/g, '')
    variants.add(focal)
    variants.add(`${focal}mm`)
  }

  const apertureMatch = clean.match(/\bf?\s*(1\.2|1\.4|1\.8|2\.8|4)\b/i)
  if (apertureMatch) {
    variants.add(`F${apertureMatch[1]}`)
    variants.add(apertureMatch[1])
  }

  return Array.from(variants).filter(v => v.length >= 2)
}

export function dedupeProducts(products: Product[]): Product[] {
  const map = new Map<string, Product>()
  const seenNames = new Set<string>()
  for (const product of products) {
    const nameKey = normalizeText(product.name)
    if (seenNames.has(nameKey)) continue
    seenNames.add(nameKey)
    if (!map.has(product.id)) map.set(product.id, product)
  }
  return Array.from(map.values())
}

export function parseBundleItems(enrichedText: string | null | undefined): string[] {
  if (!enrichedText) return []
  const match = enrichedText.match(/Contenu du pack\s*:\s*(.+?)(?:\.\s|$)/i)
  if (!match?.[1]) return []
  return match[1]
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12)
}

export async function hydrateProductMetadata(products: Product[]): Promise<Product[]> {
  if (products.length === 0) return []

  const supabase = getSupabaseAdmin()
  const ids = Array.from(new Set(products.map(product => product.id)))
  const { data } = await supabase
    .from('products_cache')
    .select('id, enriched_text')
    .in('id', ids)

  const metaById = new Map<string, { enriched_text?: string | null }>()
  for (const row of data || []) {
    metaById.set(String(row.id), { enriched_text: row.enriched_text as string | null })
  }

  return products.map(product => {
    const enrichedText = metaById.get(product.id)?.enriched_text || ''
    const bundleItems = parseBundleItems(enrichedText)
    const isBundle = /^Pack\s*\/\s*bundle/i.test(enrichedText) || bundleItems.length > 0 || /\bpack\b/i.test(product.name)

    return {
      ...product,
      is_bundle: isBundle,
      bundle_items: bundleItems,
    }
  })
}

export async function createEmbeddingMap(queries: string[]): Promise<EmbeddingMap> {
  const uniqueQueries = Array.from(new Set(
    queries.map(query => query.trim()).filter(Boolean)
  ))

  if (uniqueQueries.length === 0) return new Map()

  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: uniqueQueries,
  })

  const map: EmbeddingMap = new Map()
  for (const row of embRes.data) {
    const query = uniqueQueries[row.index]
    if (query) map.set(query, row.embedding)
  }
  return map
}

// Recherche vectorielle + texte : OpenAI text-embedding-3-small → Supabase RPC search_products.
export async function rpcSearch(query: string, limit = 20, embeddingOverride?: number[]): Promise<Product[]> {
  const cleanedQuery = query.trim()
  if (!cleanedQuery) return []

  const supabase = getSupabaseAdmin()
  let embedding = embeddingOverride

  if (!embedding) {
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: cleanedQuery,
    })
    embedding = embRes.data[0].embedding
  }

  const { data, error } = await supabase.rpc('search_products', {
    query_text: cleanedQuery,
    query_embedding: JSON.stringify(embedding),
    match_count: limit,
  })

  if (error || !data?.length) return []
  return (data as Product[]).filter(p => (p.similarity || 0) >= MIN_SIMILARITY)
}

export async function directNameSearch(item: ExtractedItem, limit = 16): Promise<Product[]> {
  const supabase = getSupabaseAdmin()
  const tokens = significantTokens(`${item.raw} ${item.query}`)

  // Prioritize model/reference tokens first. Searching all tokens blindly is how we get nonsense.
  const anchors = Array.from(new Set([
    ...importantModelTokens(item),
    ...tokens.filter(t => t.length >= 3).slice(0, 6),
  ])).slice(0, 8)

  const found: Product[] = []
  const phrases = Array.from(new Set([
    stripQuantityPrefix(item.raw),
    stripQuantityPrefix(item.query),
  ].flatMap(expandSearchPhrase).map(phrase => phrase.trim()).filter(phrase => phrase.length >= 2))).slice(0, 10)

  for (const phrase of phrases) {
    const safePhrase = phrase.replace(/[%,]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!safePhrase) continue

    for (const pattern of flexibleSqlPatterns(safePhrase)) {
      const { data: byName } = await supabase
        .from('products_cache')
        .select('id, name, description, price_per_day, deposit, photo_url')
        .eq('archived', false)
        .eq('show_in_store', true)
        .ilike('name', pattern)
        .limit(limit)

      if (byName?.length) found.push(...byName as Product[])
    }

    if (found.length) continue

    // Fallback plus large, mais uniquement si le nom exact ne remonte rien.
    const { data: byText } = await supabase
      .from('products_cache')
      .select('id, name, description, price_per_day, deposit, photo_url')
      .eq('archived', false)
      .eq('show_in_store', true)
      .or(`description.ilike.%${safePhrase}%,enriched_text.ilike.%${safePhrase}%`)
      .limit(Math.min(6, limit))

    if (byText?.length) found.push(...byText as Product[])
  }

  for (const anchor of anchors) {
    for (const pattern of flexibleSqlPatterns(anchor)) {
      const { data } = await supabase
        .from('products_cache')
        .select('id, name, description, price_per_day, deposit, photo_url')
        .eq('archived', false)
        .eq('show_in_store', true)
        .ilike('name', pattern)
        .limit(limit)

      if (data?.length) found.push(...data as Product[])
    }
  }

  return dedupeProducts(found)
}

export async function signalProductSearch(item: ExtractedItem, signals: CatalogSignal[], limit = 8): Promise<Product[]> {
  const matches = matchingSignalsForItem(item, signals).filter(signal => !isInstructionOnlySignal(signal))
  if (matches.length === 0) return []

  const supabase = getSupabaseAdmin()
  const found: Product[] = []
  const ids = Array.from(new Set(matches.map(signal => signal.product_id).filter(Boolean))) as string[]

  if (ids.length > 0) {
    const { data } = await supabase
      .from('products_cache')
      .select('id, name, description, price_per_day, deposit, photo_url')
      .eq('archived', false)
      .eq('show_in_store', true)
      .in('id', ids)

    if (data?.length) found.push(...(data as Product[]).map(product => ({ ...product, signal_match: true })))
  }

  for (const signal of matches) {
    const productName = String(signal.product_name || '').trim()
    if (!productName) continue

    const signalItem: ExtractedItem = {
      raw: productName,
      query: productName,
      quantity: 1,
      section: null,
    }

    const [direct, semantic] = await Promise.all([
      directNameSearch(signalItem, limit),
      rpcSearch(productName, limit),
    ])

    found.push(...dedupeProducts([...direct, ...semantic]).map(product => ({
      ...product,
      signal_match: signalNameMatchesProduct(productName, product),
    })))
  }

  return dedupeProducts(found).slice(0, limit)
}

export async function candidateSearchWithDebug(item: ExtractedItem, embeddingMap?: EmbeddingMap, signals: CatalogSignal[] = []): Promise<{ products: Product[]; debug: SearchDebug }> {
  const cleanedRaw = stripQuantityPrefix(item.raw).trim()
  const expandedEmbedding = embeddingMap?.get(item.query.trim())
  const rawEmbedding = embeddingMap?.get(cleanedRaw)

  const [signalResults, expandedResults, rawResults, directResults] = await Promise.all([
    signalProductSearch(item, signals, 8),
    rpcSearch(item.query, 24, expandedEmbedding),
    rpcSearch(cleanedRaw, 12, rawEmbedding),
    directNameSearch(item, 20),
  ])

  const signalIds = new Set(signalResults.filter(product => product.signal_match).map(product => product.id))
  const allCandidates = dedupeProducts([...signalResults, ...directResults, ...expandedResults, ...rawResults])

  let removedUnsafe = 0
  let removedWeak = 0

  const candidates = allCandidates
    .map(product => ({
      product,
      score: deterministicScore(product, item) + (signalIds.has(product.id) || product.signal_match ? 3 : 0),
    }))
    .filter(({ product, score }) => {
      // Idée d'hier soir : les signaux validés priment, puis l'IA rerank parmi
      // une petite liste plausible. Les garde-fous ne doivent pas vider la liste
      // avant que le diagnostic/reranker ne puissent travailler.
      if (signalIds.has(product.id) || product.signal_match) return true

      if (candidateIsUnsafe(product, item)) {
        removedUnsafe += 1
        return false
      }

      const important = importantModelTokens(item)
      // Si une référence forte existe, on exige au moins le début de cohérence,
      // pas une correspondance parfaite de tous les tokens. Sinon on casse les
      // cas “24-70 F2.8” / “RS3” / “Sony FX3” avant le reranking.
      if (important.length >= 1 && !queryHasAllTokens(product, important.slice(0, 1))) {
        const keep = score >= 0.9
        if (!keep) removedWeak += 1
        return keep
      }
      const keep = score >= 0.12
      if (!keep) removedWeak += 1
      return keep
    })
    .sort((a, b) => {
      const signalDelta = Number(signalIds.has(b.product.id) || b.product.signal_match) - Number(signalIds.has(a.product.id) || a.product.signal_match)
      if (signalDelta !== 0) return signalDelta
      return b.score - a.score
    })
    .slice(0, 10)
    .map(({ product }) => product)

  return {
    products: candidates,
    debug: {
      signalResults: signalResults.length,
      directResults: directResults.length,
      semanticExpandedResults: expandedResults.length,
      semanticRawResults: rawResults.length,
      candidatesBeforeFilter: allCandidates.length,
      candidatesAfterFilter: candidates.length,
      removedUnsafe,
      removedWeak,
    },
  }
}

export async function candidateSearch(item: ExtractedItem, embeddingMap?: EmbeddingMap, signals: CatalogSignal[] = []): Promise<Product[]> {
  return (await candidateSearchWithDebug(item, embeddingMap, signals)).products
}
