import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const BOOQABLE_V1_BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/1`
const BOOQABLE_V4_BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/4`
const BOOQABLE_KEY = process.env.BOOQABLE_API_KEY

type JsonRecord = Record<string, unknown>

type CatalogItem = {
  id: string
  name: string
  description?: string
  base_price_as_decimal?: string
  deposit_as_decimal?: string
  photo_url?: string
  archived?: boolean
  show_in_store?: boolean
  source_type: 'product_group' | 'bundle'
  bundle_names?: string[]
  bundle_item_names?: string[]
}

type BundleLink = {
  bundleId: string
  productGroupId: string
  quantity?: number
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function firstString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(record[key])
    if (value) return value
  }
  return undefined
}

function firstNumber(record: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = asNumber(record[key])
    if (value !== undefined) return value
  }
  return undefined
}

function stripHtml(value?: string): string {
  return value ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : ''
}

function centsToDecimalString(cents?: number): string | undefined {
  return cents !== undefined ? String(cents / 100) : undefined
}

function getAttributes(resource: JsonRecord): JsonRecord {
  return asRecord(resource.attributes) || {}
}

function getResourceId(resource: JsonRecord): string | undefined {
  return asString(resource.id)
}

function getRelationshipId(resource: JsonRecord, relationName: string): string | undefined {
  const relationships = asRecord(resource.relationships)
  const relation = relationships ? asRecord(relationships[relationName]) : null
  const data = relation ? relation.data : undefined

  if (Array.isArray(data)) {
    const first = asRecord(data[0])
    return first ? asString(first.id) : undefined
  }

  const dataRecord = asRecord(data)
  return dataRecord ? asString(dataRecord.id) : undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Booqable v1 — product_groups = catalogue client-facing principal
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAllBooqableProductGroups(): Promise<CatalogItem[]> {
  const all: CatalogItem[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const res = await fetch(
      `${BOOQABLE_V1_BASE}/product_groups?api_key=${BOOQABLE_KEY}&per=200&page=${page}`
    )
    if (!res.ok) throw new Error(`product_groups fetch error: ${res.status}`)

    const data = await res.json() as { product_groups?: JsonRecord[] }
    const groups = data.product_groups || []

    all.push(...groups.map(group => ({
      id: asString(group.id) || '',
      name: asString(group.name) || 'Produit sans nom',
      description: asString(group.description) || asString(group.extra_information),
      base_price_as_decimal: asString(group.base_price_as_decimal),
      deposit_as_decimal: asString(group.deposit_as_decimal),
      photo_url: asString(group.photo_url),
      archived: asBoolean(group.archived) || false,
      // Catalogue IA = uniquement ce qui est publié côté store Booqable.
      // Si show_in_store est absent ou false, on ignore le product_group.
      show_in_store: asBoolean(group.show_in_store) === true,
      source_type: 'product_group' as const,
    })).filter(item => item.id))

    hasMore = groups.length === 200
    page++
  }

  return all
}

// ─────────────────────────────────────────────────────────────────────────────
// Booqable v1 — bundles prices (une seule requête, prix non dispo en v4)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchBundlePricesV1(): Promise<Map<string, string>> {
  const prices = new Map<string, string>()
  let page = 1
  let hasMore = true

  while (hasMore) {
    const url = `${BOOQABLE_V1_BASE}/bundles?api_key=${BOOQABLE_KEY}&per=200&page=${page}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) break

    const data = await res.json() as { bundles?: JsonRecord[] }
    const bundles = data.bundles || []

    for (const b of bundles) {
      const id = asString(b.id)
      const price =
        asString(b.base_price_as_decimal) ||
        asString(b.price_as_decimal) ||
        centsToDecimalString(asNumber(b.base_price_in_cents) ?? asNumber(b.price_in_cents))
      if (id && price) prices.set(id, price)
    }

    hasMore = bundles.length === 200
    page++
  }

  return prices
}

// ─────────────────────────────────────────────────────────────────────────────
// Booqable v4 — bundles + bundle_items
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAllV4(path: string): Promise<JsonRecord[]> {
  const all: JsonRecord[] = []
  let pageNumber = 1
  const pageSize = 100

  while (true) {
    const url = `${BOOQABLE_V4_BASE}${path}?page[size]=${pageSize}&page[number]=${pageNumber}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${BOOQABLE_KEY}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) throw new Error(`Booqable v4 ${path} error: ${res.status}`)

    const json = await res.json() as { data?: JsonRecord[] }
    const data = json.data || []
    all.push(...data)

    if (data.length < pageSize) break
    pageNumber++
  }

  return all
}

async function fetchAllBooqableBundles(v1Prices: Map<string, string>): Promise<CatalogItem[]> {
  const resources = await fetchAllV4('/bundles')

  return resources.map(resource => {
    const attrs = getAttributes(resource)
    const id = getResourceId(resource) || ''
    const descriptionParts = [
      firstString(attrs, ['description', 'excerpt', 'extra_information']),
    ].filter(Boolean)

    // Prix : v4 attrs en priorité, sinon v1 (une seule requête faite en amont)
    const base_price_as_decimal =
      firstString(attrs, ['base_price_as_decimal', 'price_as_decimal', 'structure_price_as_decimal']) ||
      centsToDecimalString(firstNumber(attrs, ['base_price_in_cents', 'price_in_cents', 'structure_price_in_cents'])) ||
      v1Prices.get(id)

    return {
      id,
      name: firstString(attrs, ['name', 'title']) || 'Bundle sans nom',
      description: descriptionParts.join(' '),
      base_price_as_decimal,
      deposit_as_decimal:
        firstString(attrs, ['deposit_as_decimal']) ||
        centsToDecimalString(firstNumber(attrs, ['deposit_in_cents'])),
      photo_url: firstString(attrs, ['photo_url', 'photo_large_url', 'large_url', 'image_url']),
      archived: asBoolean(attrs.archived) || false,
      // Certains bundles v4 n'exposent pas show_in_store. Quand le champ existe,
      // on respecte strictement sa valeur ; sinon on garde le bundle indexable.
      show_in_store: attrs.show_in_store === undefined ? true : asBoolean(attrs.show_in_store) === true,
      source_type: 'bundle' as const,
    }
  }).filter(item => item.id)
}

async function fetchAllBooqableBundleItems(): Promise<BundleLink[]> {
  const resources = await fetchAllV4('/bundle_items')
  const links: BundleLink[] = []

  for (const resource of resources) {
    const attrs = getAttributes(resource)
    const bundleId =
      firstString(attrs, ['bundle_id']) ||
      getRelationshipId(resource, 'bundle')
    const productGroupId =
      firstString(attrs, ['product_group_id']) ||
      getRelationshipId(resource, 'product_group')

    if (!bundleId || !productGroupId) continue

    const quantity = firstNumber(attrs, ['quantity'])
    links.push({
      bundleId,
      productGroupId,
      ...(quantity !== undefined ? { quantity } : {}),
    })
  }

  return links
}

function attachBundleContext(
  productGroups: CatalogItem[],
  bundles: CatalogItem[],
  links: BundleLink[]
): CatalogItem[] {
  const productGroupById = new Map(productGroups.map(item => [item.id, item]))
  const bundleById = new Map(bundles.map(item => [item.id, item]))
  const bundleNamesByProductGroupId = new Map<string, string[]>()
  const productGroupNamesByBundleId = new Map<string, string[]>()

  for (const link of links) {
    const bundle = bundleById.get(link.bundleId)
    const productGroup = productGroupById.get(link.productGroupId)
    if (!bundle || !productGroup) continue

    const bundleNames = bundleNamesByProductGroupId.get(link.productGroupId) || []
    bundleNames.push(link.quantity && link.quantity > 1 ? `${link.quantity}× ${bundle.name}` : bundle.name)
    bundleNamesByProductGroupId.set(link.productGroupId, bundleNames)

    const itemNames = productGroupNamesByBundleId.get(link.bundleId) || []
    itemNames.push(link.quantity && link.quantity > 1 ? `${link.quantity}× ${productGroup.name}` : productGroup.name)
    productGroupNamesByBundleId.set(link.bundleId, itemNames)
  }

  return [
    ...productGroups.map(item => ({
      ...item,
      bundle_names: bundleNamesByProductGroupId.get(item.id) || [],
    })),
    ...bundles.map(item => ({
      ...item,
      bundle_item_names: productGroupNamesByBundleId.get(item.id) || [],
    })),
  ]
}

function buildEnrichedText(item: CatalogItem): string {
  const typeLabel = item.source_type === 'bundle' ? 'Pack / bundle Booqable' : 'Produit catalogue Booqable'
  const cleanDesc = stripHtml(item.description)
  const bundleContext = item.bundle_names?.length
    ? `Présent dans les packs : ${item.bundle_names.join(', ')}.`
    : ''
  const bundleItems = item.bundle_item_names?.length
    ? `Contenu du pack : ${item.bundle_item_names.join(', ')}.`
    : ''

  return [typeLabel, item.name, cleanDesc, bundleContext, bundleItems]
    .filter(Boolean)
    .join('. ')
    .slice(0, 3000)
}

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
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.SYNC_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('Fetching Booqable product_groups + bundles + bundle_items...')
    const [productGroups, v1Prices, bundleItems] = await Promise.all([
      fetchAllBooqableProductGroups(),
      fetchBundlePricesV1(),
      fetchAllBooqableBundleItems(),
    ])
    const bundles = await fetchAllBooqableBundles(v1Prices)

    const allRaw = attachBundleContext(productGroups, bundles, bundleItems)
    const active = allRaw.filter(item => !item.archived && item.show_in_store === true)

    const hiddenCount = allRaw.filter(item => !item.archived && item.show_in_store === false).length
    console.log(
      `Found ${productGroups.length} product_groups, ${bundles.length} bundles, ${bundleItems.length} bundle_items` +
      ` → ${active.length} active + visible indexed (${hiddenCount} masqués dans le store ignorés)`
    )

    const enrichedTexts = active.map(buildEnrichedText)

    console.log('Generating embeddings...')
    const embeddings = await generateEmbeddings(enrichedTexts)

    const supabase = getSupabaseAdmin()

    // products_cache est un cache, pas un historique : on le reconstruit proprement
    // à chaque sync pour éviter les anciennes lignes archivées et les faux doublons
    // visibles dans Supabase.
    const { error: deleteError } = await supabase
      .from('products_cache')
      .delete()
      .neq('id', '__never__')

    if (deleteError) throw new Error(`Supabase cache clear error: ${deleteError.message}`)

    const rows = active.map((item, i) => ({
      id: item.id,
      name: item.name,
      description: stripHtml(item.description) || null,
      price_per_day: item.base_price_as_decimal ? parseFloat(item.base_price_as_decimal) : null,
      deposit: item.deposit_as_decimal ? parseFloat(item.deposit_as_decimal) : null,
      photo_url: item.photo_url || null,
      archived: false,
      show_in_store: item.show_in_store === true,
      source_type: item.source_type,
      enriched_text: enrichedTexts[i],
      embedding: JSON.stringify(embeddings[i]),
      last_synced_at: new Date().toISOString(),
    }))

    let upserted = 0
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50)
      const { error } = await supabase
        .from('products_cache')
        .upsert(batch, { onConflict: 'id' })

      if (error) throw new Error(`Supabase upsert error: ${error.message}`)
      upserted += batch.length
    }

    const activeProductGroups = active.filter(i => i.source_type === 'product_group').length
    const activeBundles = active.filter(i => i.source_type === 'bundle').length

    return NextResponse.json({
      success: true,
      product_groups: activeProductGroups,
      bundles: activeBundles,
      bundle_items: bundleItems.length,
      total: allRaw.length,
      active: active.length,
      hidden_in_store: hiddenCount,
      upserted,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Sync error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET() {
  const supabase = getSupabaseAdmin()
  const { count } = await supabase
    .from('products_cache')
    .select('*', { count: 'exact', head: true })
    .eq('archived', false)
    .eq('show_in_store', true)

  return NextResponse.json({ cached_products: count ?? 0 })
}
