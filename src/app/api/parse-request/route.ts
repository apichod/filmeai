import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  DEFAULT_QUOTE_EXTRACTION_PROMPT,
  DEFAULT_QUOTE_RERANK_PROMPT,
  normalizeEditablePrompt,
  splitQuoteBackendPrompt,
} from '@/lib/defaultAssistantPrompts'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getDefaultOrganizationId(): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.id ? String(data.id) : null
}

async function getQuotePrompts(): Promise<{ extractionPrompt: string; rerankPrompt: string }> {
  try {
    const organizationId = await getDefaultOrganizationId()
    if (!organizationId) {
      return {
        extractionPrompt: DEFAULT_QUOTE_EXTRACTION_PROMPT,
        rerankPrompt: DEFAULT_QUOTE_RERANK_PROMPT,
      }
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('assistant_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    const settings = (data || {}) as AssistantPromptSettings
    const legacyPrompts = splitQuoteBackendPrompt(settings.quote_backend_prompt)
    return {
      extractionPrompt: normalizeEditablePrompt(settings.quote_extraction_prompt, legacyPrompts.extractionPrompt),
      rerankPrompt: normalizeEditablePrompt(settings.quote_rerank_prompt, legacyPrompts.rerankPrompt),
    }
  } catch (err) {
    console.warn('Quote backend prompt fallback:', err instanceof Error ? err.message : String(err))
    return {
      extractionPrompt: DEFAULT_QUOTE_EXTRACTION_PROMPT,
      rerankPrompt: DEFAULT_QUOTE_RERANK_PROMPT,
    }
  }
}

type CatalogSignal = {
  term: string
  normalized_term: string | null
  product_id: string | null
  product_name: string
  source: string | null
  confidence: number | null
  occurrences: number | null
}

async function getApprovedCatalogSignals(): Promise<CatalogSignal[]> {
  try {
    const organizationId = await getDefaultOrganizationId()
    if (!organizationId) return []

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('catalog_signals')
      .select('term, normalized_term, product_id, product_name, source, confidence, occurrences')
      .eq('organization_id', organizationId)
      .eq('approved', true)
      .order('occurrences', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(500)

    if (error || !data?.length) return []
    return data as CatalogSignal[]
  } catch (err) {
    console.warn('Catalog signals fallback:', err instanceof Error ? err.message : String(err))
    return []
  }
}

function buildCatalogSignalsGlossary(signals: CatalogSignal[]): string {
  const lines = signals
    .map(row => {
      const term = String(row.term || '').trim()
      const productName = String(row.product_name || '').trim()
      if (!term || !productName) return null
      return `- ${term} → ${productName}`
    })
    .filter(Boolean)
    .join('\n')

  return lines
    ? `GLOSSAIRE APPRIS DEPUIS L'INTERFACE :\n${lines}\n\nSi un terme client correspond à une entrée de ce glossaire appris, utilise cette association dans le champ query. Ce glossaire est prioritaire sur les déductions générales.`
    : ''
}

type Product = {
  id: string
  name: string
  description: string | null
  price_per_day: number | null
  deposit: number | null
  photo_url: string | null
  similarity?: number
  signal_match?: boolean
  is_bundle?: boolean
  bundle_items?: string[]
}

type ExtractedItem = {
  raw: string
  query: string
  quantity: number
  section: string | null
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

type EmbeddingMap = Map<string, number[]>

type AssistantPromptSettings = {
  quote_extraction_prompt?: string | null
  quote_rerank_prompt?: string | null
  quote_backend_prompt?: string | null
}

const MIN_SIMILARITY = 0.16
const MIN_RERANK_CONFIDENCE = 0.5
const MIN_DETERMINISTIC_ACCEPT = 1.25

const STOPWORDS = new Set([
  'avec', 'pour', 'vers', 'plus', 'moins', 'sans', 'de', 'du', 'des', 'la', 'le', 'les',
  'en', 'et', 'ou', 'sur', 'un', 'une', 'au', 'aux', 'camera', 'caméra', 'objectif',
  'objectifs', 'moniteur', 'energie', 'énergie', 'data', 'machine', 'machinerie', 'type',
  'with', 'all', 'and', 'the', 'kit', 'complet', 'complets',
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

function normalizedSignalTerm(value: string): string {
  return normalizeText(stripQuantityPrefix(value))
}

function isInstructionOnlySignal(signal: CatalogSignal): boolean {
  const productName = normalizeText(signal.product_name || '')
  return productName.startsWith('appliquer ') || productName.startsWith('utiliser ')
}

function hasPreciseReference(value: string): boolean {
  const text = normalizeText(value)
  return /\b(fx3|fx6|fx9|fx30|c50|c70|c80|c300|c400|r5c|r5|komodo|pyxis)\b/.test(text) ||
    /\b\d{2,3}\s*-\s*\d{2,3}\b/.test(text) ||
    /\b\d{2,4}\s*(mm|gb|go|wh|w)\b/.test(text) ||
    /\b\d+\s*\/\s*\d+\b/.test(text)
}

function isBroadSignalTerm(value: string): boolean {
  const text = normalizeText(value)
  return /^(canon|sony|blackmagic|profoto|aputure|smallhd|atomos|canon rf|canon ef|sony fe|sony e|rf|ef|fe|pl|objectif|objectifs|camera|caméra)$/.test(text)
}

function signalMatchesItem(signal: CatalogSignal, item: ExtractedItem): boolean {
  const signalTerm = normalizedSignalTerm(signal.normalized_term || signal.term)
  if (!signalTerm) return false

  const raw = normalizedSignalTerm(item.raw)
  const query = normalizedSignalTerm(item.query)
  const itemText = normalizeText(`${item.raw} ${item.query}`)

  if (signalTerm === raw || signalTerm === query) return true

  // Les signaux génériques de marque/monture (ex: “canon rf”) ne doivent pas
  // capturer une demande précise comme “24-70 Canon”, sinon ils court-circuitent
  // le reranking et imposent une série/pack sans rapport.
  if (isBroadSignalTerm(signalTerm)) return false

  // Si la demande contient une référence précise (24-70, 82mm, 256Go…), un signal
  // plus vague ne peut matcher en inclusion que s’il contient lui aussi cette référence.
  if (hasPreciseReference(itemText) && !hasPreciseReference(signalTerm)) return false

  // Les signaux courts (FX3, FX6, C70…) doivent matcher exactement.
  // Les expressions longues peuvent matcher en inclusion.
  if (signalTerm.length < 4) return false
  return raw.includes(signalTerm) || query.includes(signalTerm) || itemText.includes(signalTerm)
}

function matchingSignalsForItem(item: ExtractedItem, signals: CatalogSignal[]): CatalogSignal[] {
  return signals
    .filter(signal => signalMatchesItem(signal, item))
    .sort((a, b) => Number(b.occurrences || 0) - Number(a.occurrences || 0))
    .slice(0, 6)
}

function signalNameMatchesProduct(signalProductName: string, product: Product): boolean {
  const signalName = normalizeText(signalProductName)
  const productName = normalizeText(product.name)
  if (!signalName || !productName) return false

  const packTerms = ['pack', 'kit', 'serie', 'série', 'set', 'duo']
  const packVariantTerms = ['essentiel', 'standard', 'reportage', 'stabilisateur', 'multicam', 'mode', 'cine', 'ciné', 'cinema', 'cinéma']
  const signalWantsPack = packTerms.some(term => signalName.includes(term)) || packVariantTerms.some(term => signalName.includes(term))
  const productIsPack = packTerms.some(term => productName.includes(term))

  // A signal that points to “Sony FX3 – pack essentiel” must not validate the bare “Sony FX3”.
  if (signalWantsPack && !productIsPack) return false

  // If the signal targets a specific pack variant, require that same variant in the candidate.
  const requiredVariant = packVariantTerms.find(term => signalName.includes(term))
  if (requiredVariant && !productName.includes(requiredVariant)) return false

  // Direction matters: a product can be more specific than the signal, but not less specific.
  if (productName === signalName || productName.includes(signalName)) return true

  const tokens = significantTokens(signalProductName)
    .filter(token => !STOPWORDS.has(token) && token.length >= 3)
  if (tokens.length === 0) return false

  const matched = tokens.filter(token => productName.includes(token)).length
  return matched / tokens.length >= 0.9
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

function requestWantsPack(item: ExtractedItem): boolean {
  const raw = normalizeText(item.raw)
  const query = normalizeText(item.query)
  const packPattern = /\b(pack|kit|serie|série|set|duo|reportage|standard|essentiel|multicam)\b/

  // La demande brute prime. Exception utile : une association “Signaux” peut
  // injecter explicitement un nom de pack dans query.
  return packPattern.test(raw) || packPattern.test(query)
}

function productLooksLikePack(product: Product): boolean {
  // Important : on se base surtout sur le NOM. Les descriptions contiennent souvent
  // "Packs apparentés", ce qui faisait remonter des accessoires type cage/rig
  // comme si c'étaient des packs.
  const name = normalizeText(product.name)
  return Boolean(product.is_bundle) || /\b(pack|kit|serie|série|set|duo)\b/.test(name)
}

function requestWantsCameraBody(item: ExtractedItem): boolean {
  const text = normalizeText(`${item.raw} ${item.query}`)
  return /\b(camera|caméra|cine|ciné|cinema|cinéma)\b/.test(text) || /\bfx[369]0?\b/.test(text)
}

function productLooksLikeAccessoryOnly(product: Product): boolean {
  const name = normalizeText(product.name)
  return /\b(cage|rig|poignee|poignée|handle|plate|support|adaptateur|cable|câble|battery plate|baseplate)\b/.test(name)
}

function importantModelTokens(item: ExtractedItem): string[] {
  const text = normalizeText(`${item.raw} ${item.query}`)
  const tokens = significantTokens(text)
  const important = tokens.filter(token =>
    /^(fx3|fx6|fx9|fx30|b10x|b10|d2|prohead|profoto|atem|ntg3|c1|r5|r6|rj45|bpu|bpu60|bpu90|vmount|vlock|v-lock|indie|shogun|sachtler|magliner|macbook|aputure|600x|1200d)$/.test(token) ||
    /^(c50|c70|c80|c300|c400|r5c|rf)$/.test(token) ||
    /^\d{2,3}$/.test(token) ||
    /^\d{2,3}mm$/.test(token) ||
    /^\d{2,3}gb$/.test(token) ||
    /^\d{2,3}go$/.test(token) ||
    /^\d{2,3}wh$/.test(token)
  )

  return Array.from(new Set(important))
}

function productNameText(product: Product): string {
  return normalizeText(product.name)
}

function requestText(item: ExtractedItem): string {
  return normalizeText(`${item.raw} ${item.query}`)
}

function requestHasFamilyMismatch(product: Product, item: ExtractedItem): boolean {
  const req = requestText(item)
  const name = productNameText(product)

  // Les références modèle/focales doivent apparaître dans le nom produit, pas
  // seulement dans une description ou dans “packs apparentés”.
  const exactNameFamilies: Array<[RegExp, RegExp]> = [
    [/\bfx3\b/, /\bfx3\b/],
    [/\bfx6\b/, /\bfx6\b/],
    [/\bfx9\b/, /\bfx9\b/],
    [/\bfx30\b/, /\bfx30\b/],
    [/\bc400\b/, /\bc400\b/],
    [/\bc50\b/, /\bc50\b/],
    [/\bc70\b/, /\bc70\b/],
    [/\bc300\b/, /\bc300\b/],
    [/\bb10x\s*plus\b/, /\bb10x\s*plus\b/],
    [/\bpro\s*-?\s*11\b/, /\bpro\s*-?\s*11\b/],
    [/\bronin\s*rs\s*4\b/, /\bronin\s*rs\s*4\b/],
    [/\b300x\b/, /\b300x\b/],
    [/\b600x\b/, /\b600x\b/],
    [/\b1200d\b/, /\b1200d\b/],
    [/\b16\s*-?\s*35\b/, /\b16\s*-?\s*35\b/],
    [/\b24\s*-?\s*70\b/, /\b24\s*-?\s*70\b/],
    [/\b24\s*-?\s*105\b/, /\b24\s*-?\s*105\b/],
    [/\b70\s*-?\s*200\b/, /\b70\s*-?\s*200\b/],
  ]

  for (const [requestPattern, productPattern] of exactNameFamilies) {
    if (requestPattern.test(req) && !productPattern.test(name)) return true
  }

  // Familles filtres : Vari ND / ND / Pro-Mist / pola ne sont pas interchangeables.
  if (/\bvari\s*nd\b|\bvariable\s*nd\b/.test(req)) {
    if (/\bpro\s*-?\s*mist\b|\bblack\s*pro\s*-?\s*mist\b|\bhollywood\s*black\s*magic\b/.test(name)) return true
    if (!(/\bvari\s*nd\b|\bvariable\s*nd\b/.test(name))) return true
  }

  if (/\bpro\s*-?\s*mist\b|\bblack\s*promist\b|\bblack\s*pro\s*-?\s*mist\b/.test(req)) {
    if (/\bvari\s*nd\b|\bvariable\s*nd\b/.test(name)) return true
    if (!(/\bmist\b/.test(name))) return true
  }

  if (/\bangelbird\b/.test(req) && !/\bangelbird\b/.test(name)) return true
  if (/\b256\s*(gb|go)\b/.test(req) && !/\b256\b/.test(name)) return true
  if (/\b512\s*(gb|go)\b/.test(req) && !/\b512\b/.test(name)) return true
  if (/\b82\s*mm\b/.test(req) && !/\b82\s*mm\b|\b82mm\b/.test(name)) return true
  if (/\brf\b/.test(req) && /\b(fe|e-mount|sony)\b/.test(name) && !/\brf\b/.test(name)) return true
  if (/\bfe\b/.test(req) && /\brf\b/.test(name) && !/\bfe\b/.test(name)) return true

  return false
}

function isBrandOnlyAmbiguousRequest(item: ExtractedItem): boolean {
  const tokens = significantTokens(`${item.raw} ${item.query}`)
  const raw = normalizeText(stripQuantityPrefix(item.raw))
  return tokens.length === 1 && /^(atomos|sony|canon|profoto|aputure|smallhd)$/.test(tokens[0]) && raw === tokens[0]
}

function candidateUnsafeReasons(product: Product, item: ExtractedItem): string[] {
  const reasons: string[] = []

  if (requestHasFamilyMismatch(product, item)) {
    reasons.push('Famille, modèle, focale ou monture incohérente avec la demande')
  }
  if (requestWantsCameraBody(item) && productLooksLikeAccessoryOnly(product)) {
    reasons.push('Accessoire caméra détecté alors que la demande vise une caméra ou un pack caméra')
  }
  if (isBrandOnlyAmbiguousRequest(item) && productLooksLikeAccessoryOnly(product)) {
    reasons.push('Demande trop générique : accessoire non retenu automatiquement')
  }

  return reasons
}

function candidateIsUnsafe(product: Product, item: ExtractedItem): boolean {
  return candidateUnsafeReasons(product, item).length > 0
}

function deterministicScore(product: Product, item: ExtractedItem): number {
  const name = normalizeText(product.name)
  const haystack = normalizeText(`${product.name} ${product.description || ''}`)
  const raw = normalizeText(stripQuantityPrefix(item.raw))
  const query = normalizeText(item.query)
  const tokens = significantTokens(`${item.raw} ${item.query}`)
  const important = importantModelTokens(item)

  let score = product.similarity || 0

  if (candidateIsUnsafe(product, item)) score -= 4

  if (raw && name.includes(raw)) score += 1.1
  if (query && name.includes(query)) score += 0.9

  const matchedTokens = tokens.filter(token => haystack.includes(normalizeText(token))).length
  if (tokens.length) score += (matchedTokens / tokens.length) * 0.8

  const matchedImportant = important.filter(token => haystack.includes(normalizeText(token))).length
  if (important.length) score += (matchedImportant / important.length) * 1.4

  // Business rule: if the client asks for a pack/kit/series, prefer the pack over
  // the naked product when the model family is otherwise equivalent.
  if (requestWantsPack(item)) {
    if (productLooksLikePack(product)) score += 2.25
    else score -= 1.25
  } else if (productLooksLikePack(product)) {
    // Si le client n'a pas demandé de pack, on préfère le produit nu à modèle égal.
    score -= 0.95
  }

  // “Sony FX6 pack caméra” means camera/pack, not an accessory compatible with FX6.
  if (requestWantsCameraBody(item) && productLooksLikeAccessoryOnly(product)) {
    score -= 2.4
  }

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
    [/\bc400\b/, /\bc400\b/],
    [/\bc50\b/, /\bc50\b/],
    [/\bc70\b/, /\bc70\b/],
    [/\bb10x\b/, /\bb10x\b/],
    [/\batem\b/, /\batem\b/],
    [/\bntg3\b/, /\bntg3\b/],
    [/\bsachtler\b/, /\bsachtler\b/],
    [/\bmagliner\b/, /\bmagliner\b/],
    [/\b70\s*-?\s*200\b/, /\b70\s*-?\s*200\b/],
    [/\b24\s*-?\s*70\b/, /\b24\s*-?\s*70\b/],
    [/\b24\s*-?\s*105\b/, /\b24\s*-?\s*105\b/],
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

function deterministicAutoSelect(set: CandidateSet): { product: Product; score: number } | null {
  if (set.candidates.length === 0) return null

  const ranked = set.candidates
    .map(product => ({ product, score: deterministicScore(product, set.item) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const haystack = normalizeText(`${best.product.name} ${best.product.description || ''}`)
  const raw = normalizeText(stripQuantityPrefix(set.item.raw))
  const query = normalizeText(set.item.query)
  const tokens = significantTokens(`${set.item.raw} ${set.item.query}`)
  const important = importantModelTokens(set.item)
  const matchedTokens = tokens.filter(token => haystack.includes(normalizeText(token))).length
  const tokenRatio = tokens.length ? matchedTokens / tokens.length : 0
  const importantOk = important.length === 0 || important.every(token => haystack.includes(normalizeText(token)))
  const strongPhrase = Boolean(
    (raw.length >= 3 && haystack.includes(raw)) ||
    (query.length >= 3 && haystack.includes(query))
  )
  const enoughTokens = tokens.length <= 2 ? tokenRatio === 1 : tokenRatio >= 0.67

  if (best.score >= MIN_DETERMINISTIC_ACCEPT && importantOk && (strongPhrase || enoughTokens)) {
    return best
  }

  if (best.score >= 2.2 && importantOk) return best

  return null
}

function dedupeProducts(products: Product[]): Product[] {
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

function parseBundleItems(enrichedText: string | null | undefined): string[] {
  if (!enrichedText) return []
  const match = enrichedText.match(/Contenu du pack\s*:\s*(.+?)(?:\.\s|$)/i)
  if (!match?.[1]) return []
  return match[1]
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12)
}

async function hydrateProductMetadata(products: Product[]): Promise<Product[]> {
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

async function createEmbeddingMap(queries: string[]): Promise<EmbeddingMap> {
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

async function rpcSearch(query: string, limit = 20, embeddingOverride?: number[]): Promise<Product[]> {
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

async function directNameSearch(item: ExtractedItem, limit = 16): Promise<Product[]> {
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
  ].map(phrase => phrase.trim()).filter(phrase => phrase.length >= 3))).slice(0, 3)

  for (const phrase of phrases) {
    const safePhrase = phrase.replace(/[%,]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!safePhrase) continue

    const { data: byName } = await supabase
      .from('products_cache')
      .select('id, name, description, price_per_day, deposit, photo_url')
      .eq('archived', false)
      .eq('show_in_store', true)
      .ilike('name', `%${safePhrase}%`)
      .limit(limit)

    if (byName?.length) {
      found.push(...byName as Product[])
      continue
    }

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
    const { data } = await supabase
      .from('products_cache')
      .select('id, name, description, price_per_day, deposit, photo_url')
      .eq('archived', false)
      .eq('show_in_store', true)
      .ilike('name', `%${anchor}%`)
      .limit(limit)

    if (data?.length) found.push(...data as Product[])
  }

  return dedupeProducts(found)
}

async function signalProductSearch(item: ExtractedItem, signals: CatalogSignal[], limit = 8): Promise<Product[]> {
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

async function candidateSearch(item: ExtractedItem, embeddingMap?: EmbeddingMap, signals: CatalogSignal[] = []): Promise<Product[]> {
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
  const candidates = dedupeProducts([...signalResults, ...directResults, ...expandedResults, ...rawResults])
    .map(product => ({
      product,
      score: deterministicScore(product, item) + (signalIds.has(product.id) || product.signal_match ? 3 : 0),
    }))
    .filter(({ product, score }) => {
      if (candidateIsUnsafe(product, item)) return false
      if (signalIds.has(product.id) || product.signal_match) return true

      const important = importantModelTokens(item)
      // If the request has strong references, require at least one in the candidate text.
      if (important.length >= 1 && !queryHasAllTokens(product, important.slice(0, 2))) {
        return score >= 0.9
      }
      return score >= 0.12
    })
    .sort((a, b) => {
      const signalDelta = Number(signalIds.has(b.product.id) || b.product.signal_match) - Number(signalIds.has(a.product.id) || a.product.signal_match)
      if (signalDelta !== 0) return signalDelta
      return b.score - a.score
    })
    .slice(0, 10)
    .map(({ product }) => product)

  return candidates
}

async function extractItems(message: string, quoteBackendPrompt: string): Promise<ExtractedItem[]> {
  const extractRes = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: quoteBackendPrompt },
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
      section: typeof item.section === 'string' && item.section.trim()
        ? item.section.trim()
        : null,
    }))
    .filter(item => item.raw.length > 0 && item.query.length > 0)
}

async function rerankAll(candidateSets: CandidateSet[], rerankPrompt: string): Promise<RerankSelection[]> {
  const context = candidateSets.map((set, index) => ({
    index,
    raw: set.item.raw,
    query: set.item.query,
    quantity: set.item.quantity,
    section: set.item.section,
    top_candidates: set.candidates.slice(0, 5).map(candidate => ({
      id: candidate.id,
      name: candidate.name,
      description: (candidate.description || '').slice(0, 320),
      similarity: candidate.similarity || null,
      is_bundle: candidate.is_bundle || false,
    })),
  }))

  const payload = candidateSets.map((set, index) => ({
    index,
    raw: set.item.raw,
    query: set.item.query,
    quantity: set.item.quantity,
    section: set.item.section,
    candidates: set.candidates.map(candidate => ({
      id: candidate.id,
      name: candidate.name,
      price_per_day: candidate.price_per_day,
      description: (candidate.description || '').slice(0, 320),
      similarity: candidate.similarity || null,
      is_bundle: candidate.is_bundle || false,
    })),
  }))

  const rerankRes = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: rerankPrompt,
      },
      { role: 'user', content: JSON.stringify({ context, items: payload }) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 2600,
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
    const {
      message,
      quoteExtractionPrompt: bodyQuoteExtractionPrompt,
      quoteRerankPrompt: bodyQuoteRerankPrompt,
      quoteBackendPrompt: bodyQuoteBackendPrompt,
    } = await req.json() as {
      message: string
      quoteExtractionPrompt?: string
      quoteRerankPrompt?: string
      quoteBackendPrompt?: string
    }
    let extractionPrompt: string
    let rerankPrompt: string

    if (typeof bodyQuoteExtractionPrompt === 'string' || typeof bodyQuoteRerankPrompt === 'string') {
      extractionPrompt = normalizeEditablePrompt(bodyQuoteExtractionPrompt, DEFAULT_QUOTE_EXTRACTION_PROMPT)
      rerankPrompt = normalizeEditablePrompt(bodyQuoteRerankPrompt, DEFAULT_QUOTE_RERANK_PROMPT)
    } else if (typeof bodyQuoteBackendPrompt === 'string' && bodyQuoteBackendPrompt.trim().length > 0) {
      const splitPrompts = splitQuoteBackendPrompt(bodyQuoteBackendPrompt)
      extractionPrompt = splitPrompts.extractionPrompt
      rerankPrompt = splitPrompts.rerankPrompt
    } else {
      const settingsPrompts = await getQuotePrompts()
      extractionPrompt = settingsPrompts.extractionPrompt
      rerankPrompt = settingsPrompts.rerankPrompt
    }

    const approvedSignals = await getApprovedCatalogSignals()
    const learnedGlossary = buildCatalogSignalsGlossary(approvedSignals)
    const finalExtractionPrompt = learnedGlossary
      ? `${extractionPrompt}\n\n${learnedGlossary}`
      : extractionPrompt

    const extractedItems = await extractItems(message, finalExtractionPrompt)
    if (extractedItems.length === 0) return NextResponse.json({ items: [] })

    const embeddingMap = await createEmbeddingMap(
      extractedItems.flatMap(item => [item.query, stripQuantityPrefix(item.raw)])
    )

    const candidateSets: CandidateSet[] = await Promise.all(
      extractedItems.map(async item => ({
        item,
        candidates: await candidateSearch(item, embeddingMap, approvedSignals),
      }))
    )

    const selections = await rerankAll(candidateSets, rerankPrompt)
    const selectionByIndex = new Map(selections.map(selection => [selection.index, selection]))

    const rawItems = candidateSets.map((set, index) => {
      const selection = selectionByIndex.get(index)
      const aiSelected = selection && selection.confidence >= MIN_RERANK_CONFIDENCE
        ? set.candidates.find(candidate => candidate.id === selection.product_id) || null
        : null
      const deterministic = deterministicAutoSelect(set)
      const preferredPack = requestWantsPack(set.item)
        ? set.candidates
          .map(product => ({ product, score: deterministicScore(product, set.item) }))
          .filter(({ product, score }) => productLooksLikePack(product) && score >= 0.8)
          .sort((a, b) => b.score - a.score)[0] || null
        : null
      const safeAiSelected = aiSelected && candidateIsUnsafe(aiSelected, set.item)
        ? null
        : aiSelected
      const signalSelected = set.candidates.find(candidate => candidate.signal_match && !candidateIsUnsafe(candidate, set.item)) || null
      const selected = signalSelected || preferredPack?.product || safeAiSelected || deterministic?.product || null
      const selectedBy = signalSelected
        ? 'signal'
        : preferredPack?.product
          ? 'pack_rule'
          : safeAiSelected
            ? 'rerank'
            : deterministic?.product
              ? 'deterministic'
              : null
      const confidence = signalSelected
        ? 0.96
        : preferredPack
        ? Math.min(0.95, Math.max(0.84, preferredPack.score / 2.6))
        : safeAiSelected
        ? selection?.confidence || 0.85
        : deterministic
          ? Math.min(0.95, Math.max(0.72, deterministic.score / 2.6))
          : selection?.confidence || 0
      const matchingSignals = matchingSignalsForItem(set.item, approvedSignals)
      const debugCandidates = set.candidates.slice(0, 10).map(candidate => {
        const score = deterministicScore(candidate, set.item)
        const unsafeReasons = candidateUnsafeReasons(candidate, set.item)
        return {
          id: candidate.id,
          name: candidate.name,
          similarity: candidate.similarity || null,
          deterministicScore: Math.round(score * 100) / 100,
          signalMatch: Boolean(candidate.signal_match),
          unsafe: unsafeReasons.length > 0,
          unsafeReasons,
          selected: candidate.id === selected?.id,
          rerankChoice: candidate.id === selection?.product_id,
        }
      })

      return {
        requestedName: set.item.raw,
        searchQuery: set.item.query,
        section: set.item.section,
        quantity: set.item.quantity,
        matched: selected,
        confidence,
        reason: selected
          ? (signalSelected
            ? 'Association validée depuis Signaux'
            : preferredPack
              ? 'Pack/kit privilégié car demandé par le client'
              : safeAiSelected
                ? selection?.reason || null
                : 'Correspondance catalogue forte par nom/référence')
          : selection?.reason || 'Aucune correspondance catalogue assez fiable',
        debug: {
          requestedName: set.item.raw,
          searchQuery: set.item.query,
          section: set.item.section,
          quantity: set.item.quantity,
          selectedBy,
          finalChoice: selected ? { id: selected.id, name: selected.name } : null,
          signals: matchingSignals.map(signal => ({
            term: signal.term,
            normalizedTerm: signal.normalized_term,
            productId: signal.product_id,
            productName: signal.product_name,
            source: signal.source,
            confidence: signal.confidence,
            occurrences: signal.occurrences,
            instructionOnly: isInstructionOnlySignal(signal),
          })),
          rerank: selection ? {
            productId: selection.product_id,
            confidence: selection.confidence,
            reason: selection.reason || null,
          } : null,
          deterministic: deterministic ? {
            productId: deterministic.product.id,
            productName: deterministic.product.name,
            score: Math.round(deterministic.score * 100) / 100,
          } : null,
          preferredPack: preferredPack ? {
            productId: preferredPack.product.id,
            productName: preferredPack.product.name,
            score: Math.round(preferredPack.score * 100) / 100,
          } : null,
          candidates: debugCandidates,
        },
        alternatives: set.candidates
          .filter(candidate => candidate.id !== selected?.id)
          .slice(0, 4),
      }
    })

    const productsToHydrate = rawItems.flatMap(item => [
      ...(item.matched ? [item.matched] : []),
      ...item.alternatives,
    ])
    const hydrated = await hydrateProductMetadata(productsToHydrate)
    const hydratedById = new Map(hydrated.map(product => [product.id, product]))

    const items = rawItems.map(item => {
      const alternatives = item.alternatives
        .map(product => hydratedById.get(product.id) || product)
        .filter((product, index, arr) =>
          arr.findIndex(candidate =>
            candidate.id === product.id ||
            candidate.name.trim().toLowerCase() === product.name.trim().toLowerCase()
          ) === index
        )

      return {
        ...item,
        matched: item.matched ? hydratedById.get(item.matched.id) || item.matched : null,
        alternatives,
      }
    })

    return NextResponse.json({ items })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('parse-request error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
