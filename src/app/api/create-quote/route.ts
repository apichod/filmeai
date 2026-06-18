import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getDefaultOrganizationId(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<string | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('Default organization lookup failed:', error.message)
    return null
  }

  return data?.id || null
}

type QuoteItem = {
  type?: 'product' | 'custom_charge' | 'section'
  sourceType?: 'product_group' | 'bundle' | null
  productId?: string
  quantity?: number
  name?: string
  title?: string
  requestedName?: string
  section?: string | null
  position?: number
  unitPrice?: number | null
  deposit?: number | null
}

type Customer = {
  name: string
  email?: string
  phone?: string
  booqableId?: string
}

type JsonObject = Record<string, unknown>

type BooqableCustomerResponse = {
  customer?: { id: string }
  error?: unknown
  errors?: unknown
}

type BooqableOrderResponse = {
  data?: { id: string }
  order?: { id: string }
  error?: unknown
  errors?: unknown
}

type ResolvedBooqableItem =
  | { kind: 'product'; id: string }
  | { kind: 'bundle'; id: string }
  | { kind: 'none'; reason: string }

type CatalogCacheRow = {
  id: string
  source_type: 'product_group' | 'bundle' | null
  name?: string | null
}

type BundleComponent = {
  productId: string
  productGroupId?: string | null
  quantity: number
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function cleanTitle(value: string | undefined | null, fallback: string) {
  const title = String(value || '').trim()
  return title.length > 0 ? title : fallback
}

function quantityOf(item: QuoteItem) {
  return Math.max(1, Math.round(Number(item.quantity) || 1))
}

function lineNotes(item: QuoteItem, extra?: string) {
  return [
    extra,
    item.requestedName ? `Produit demandé : ${item.requestedName}` : null,
    item.name ? `Produit suggéré : ${item.name}` : null,
    item.productId ? `ID catalogue FilmeAI : ${item.productId}` : null,
    item.section ? `Section : ${item.section}` : null,
  ].filter(Boolean).join('\n')
}

function rentalDays(startsAt: string, stopsAt: string) {
  const start = new Date(startsAt).getTime()
  const stop = new Date(stopsAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return 1
  return Math.max(1, Math.round((stop - start) / 86400000))
}

function quoteLineTitle(item: QuoteItem) {
  return cleanTitle(item.title || item.name || item.requestedName, item.type === 'section' ? 'Section' : 'Produit à vérifier')
}

function buildStoredQuoteItems(items: QuoteItem[], days: number) {
  return (items || []).map((item, index) => {
    const type = item.type || (item.productId ? 'product' : 'custom_charge')
    const quantity = type === 'section' ? 1 : quantityOf(item)
    const unitPrice = Number(item.unitPrice || 0)
    const deposit = Number(item.deposit || 0)
    const lineTotal = type === 'product' ? unitPrice * quantity * days : 0
    const lineDeposit = type === 'product' ? deposit * quantity : 0

    return {
      uid: `${Date.now()}-${index}`,
      position: index + 1,
      type,
      section: item.section || null,
      productId: item.productId || null,
      sourceType: item.sourceType || null,
      title: quoteLineTitle(item),
      requestedName: item.requestedName || quoteLineTitle(item),
      name: item.name || quoteLineTitle(item),
      quantity,
      unitPrice,
      deposit,
      lineTotal,
      lineDeposit,
    }
  })
}

function summarizeContext(customer: Customer, items: QuoteItem[], startsAt: string, stopsAt: string) {
  const lines = items
    .filter(item => item.type !== 'section')
    .slice(0, 12)
    .map(item => `${quantityOf(item)}× ${item.name || item.requestedName || item.title || 'Produit'}`)
    .join(', ')

  return [
    `Devis généré depuis le back-office FilmeAI pour ${customer.name}.`,
    `Location du ${new Date(startsAt).toLocaleDateString('fr-FR')} au ${new Date(stopsAt).toLocaleDateString('fr-FR')}.`,
    lines ? `Articles : ${lines}.` : null,
  ].filter(Boolean).join(' ')
}

async function readJson(res: Response, context: string): Promise<unknown> {
  const text = await res.text()
  let parsed: unknown = null

  if (text.trim()) {
    try {
      parsed = JSON.parse(text)
    } catch {
      const preview = text.replace(/\s+/g, ' ').slice(0, 500)
      throw new Error(`${context} returned non-JSON (${res.status}): ${preview}`)
    }
  }

  if (!res.ok) {
    throw new Error(`${context} failed (${res.status}): ${JSON.stringify(parsed)}`)
  }

  return parsed
}

async function fetchJsonOrNull(url: string, headers: Record<string, string>): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers })
    if (!res.ok) return null
    const text = await res.text()
    return text.trim() ? JSON.parse(text) as unknown : null
  } catch {
    return null
  }
}

async function postJson<T>(url: string, body: unknown, headers: Record<string, string>, context: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  return await readJson(res, context) as T
}

function resourceId(resource: unknown): string | null {
  const obj = asObject(resource)
  return obj ? asString(obj.id) : null
}

function resourceType(resource: unknown): string | null {
  const obj = asObject(resource)
  return obj ? asString(obj.type) : null
}

function relationshipData(resource: unknown, name: string): unknown[] {
  const obj = asObject(resource)
  const relationships = obj ? asObject(obj.relationships) : null
  const relation = relationships ? asObject(relationships[name]) : null
  const data = relation ? relation.data : null
  return Array.isArray(data) ? data : data ? [data] : []
}

function relationshipId(resource: unknown, name: string): string | null {
  return relationshipData(resource, name).map(resourceId).find(Boolean) || null
}

function attrString(resource: unknown, name: string): string | null {
  const obj = asObject(resource)
  const attrs = obj ? asObject(obj.attributes) : null
  return asString(obj?.[name]) || asString(attrs?.[name])
}

function attrNumber(resource: unknown, name: string): number | null {
  const obj = asObject(resource)
  const attrs = obj ? asObject(obj.attributes) : null
  return asNumber(obj?.[name]) ?? asNumber(attrs?.[name])
}

function productBelongsToGroup(resource: unknown, productGroupId: string): boolean {
  const obj = asObject(resource)
  if (!obj) return false

  const directGroupId = asString(obj.product_group_id)
  if (directGroupId === productGroupId) return true

  const attrs = asObject(obj.attributes)
  if (asString(attrs?.product_group_id) === productGroupId) return true

  return relationshipData(resource, 'product_group').some(rel => resourceId(rel) === productGroupId)
}

function productIdFromPayload(payload: unknown, productGroupId?: string): string | null {
  const root = asObject(payload)
  if (!root) return null

  // v1 single product: { product: { id, product_group_id } }
  const product = asObject(root.product)
  if (product) {
    if (productGroupId && asString(product.product_group_id) !== productGroupId) return null
    return asString(product.id)
  }

  // v1 products list: { products: [...] }
  const products = asArray(root.products)
  if (products.length) {
    if (productGroupId) {
      const exact = products.find(candidate => productBelongsToGroup(candidate, productGroupId))
      return resourceId(exact)
    }
    return resourceId(products[0])
  }

  // JSON:API direct data
  const data = root.data
  const dataArray = Array.isArray(data) ? data : data ? [data] : []

  const directProduct = dataArray.find(resource => {
    const type = resourceType(resource)
    if (type !== 'products' && type !== 'product') return false
    return productGroupId ? productBelongsToGroup(resource, productGroupId) : true
  })
  if (directProduct) return resourceId(directProduct)

  // JSON:API product group relationships: data.relationships.products.data[0].id
  for (const resource of dataArray) {
    const relProducts = relationshipData(resource, 'products')
    if (relProducts.length) return resourceId(relProducts[0])
  }

  // JSON:API included products. If we were resolving a specific product_group,
  // never return an arbitrary first product: that is how bundles ended up as the
  // same default product in Booqable.
  const included = asArray(root.included)
  const includedProduct = included.find(resource => {
    const type = resourceType(resource)
    if (type !== 'products' && type !== 'product') return false
    return productGroupId ? productBelongsToGroup(resource, productGroupId) : true
  })

  return resourceId(includedProduct)
}

function bundleExistsInPayload(payload: unknown): boolean {
  const root = asObject(payload)
  if (!root) return false
  const data = root.data
  const dataArray = Array.isArray(data) ? data : data ? [data] : []
  return dataArray.some(resource => {
    const type = resourceType(resource)
    return type === 'bundles' || type === 'bundle'
  })
}

async function getCatalogCacheRow(id: string): Promise<CatalogCacheRow | null> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('products_cache')
      .select('id, source_type, name')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.warn('products_cache source lookup failed:', error.message)
      return null
    }

    return data as CatalogCacheRow | null
  } catch (error) {
    console.warn('products_cache source lookup exception:', error instanceof Error ? error.message : String(error))
    return null
  }
}

async function resolveBundleId(
  id: string,
  v4: string,
  v4Headers: Record<string, string>,
  options: { trustCache?: boolean } = {}
): Promise<ResolvedBooqableItem> {
  if (options.trustCache) return { kind: 'bundle', id }

  const bundleV4 = await fetchJsonOrNull(`${v4}/bundles/${id}`, v4Headers)
  if (bundleExistsInPayload(bundleV4)) return { kind: 'bundle', id }
  return { kind: 'none', reason: `Bundle Booqable introuvable pour ${id}` }
}

function itemNameLooksLikeBundle(item: QuoteItem): boolean {
  return /\b(pack|bundle)\b/i.test(`${item.name || ''} ${item.requestedName || ''} ${item.title || ''}`)
}

async function resolveBooqableItem(item: QuoteItem): Promise<ResolvedBooqableItem> {
  const id = item.productId
  if (!id) return { kind: 'none', reason: 'Pas d’ID catalogue' }

  const subdomain = process.env.BOOQABLE_SUBDOMAIN
  const key = process.env.BOOQABLE_API_KEY
  const v1 = `https://${subdomain}.booqable.com/api/1`
  const v4 = `https://${subdomain}.booqable.com/api/4`
  const v4Headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const catalogRow = await getCatalogCacheRow(id)
  const sourceType = item.sourceType || catalogRow?.source_type || null

  // Les bundles indexés dans products_cache ont leur propre ID Booqable.
  // Il ne faut surtout pas tenter de les résoudre comme product_group avant,
  // sinon certains endpoints renvoient un produit par défaut.
  if (sourceType === 'bundle') {
    return await resolveBundleId(id, v4, v4Headers, { trustCache: true })
  }

  if (sourceType !== 'product_group' && itemNameLooksLikeBundle(item)) {
    const maybeBundle = await resolveBundleId(id, v4, v4Headers)
    if (maybeBundle.kind === 'bundle') return maybeBundle
  }

  // Already a plannable product id?
  const directV4Product = await fetchJsonOrNull(`${v4}/products/${id}`, v4Headers)
  const directProductId = productIdFromPayload(directV4Product)
  if (directProductId) return { kind: 'product', id: directProductId }

  const directV1Product = await fetchJsonOrNull(`${v1}/products/${id}?api_key=${key}`, { 'Content-Type': 'application/json' })
  const directV1ProductId = productIdFromPayload(directV1Product)
  if (directV1ProductId) return { kind: 'product', id: directV1ProductId }

  // Product group id → first concrete product id. Product groups are good for search,
  // but Booqable order fulfillment books products.
  const productGroupV4 = await fetchJsonOrNull(`${v4}/product_groups/${id}?include=products`, v4Headers)
  const productFromGroup = productIdFromPayload(productGroupV4, id)
  if (productFromGroup) return { kind: 'product', id: productFromGroup }

  const productsByGroupV4 = await fetchJsonOrNull(`${v4}/products?filter[product_group_id]=${id}&page[size]=25`, v4Headers)
  const productFromFilterV4 = productIdFromPayload(productsByGroupV4, id)
  if (productFromFilterV4) return { kind: 'product', id: productFromFilterV4 }

  const productGroupV1 = await fetchJsonOrNull(`${v1}/product_groups/${id}?api_key=${key}`, { 'Content-Type': 'application/json' })
  const productFromGroupV1 = productIdFromPayload(productGroupV1, id)
  if (productFromGroupV1) return { kind: 'product', id: productFromGroupV1 }

  const productsByGroupV1 = await fetchJsonOrNull(`${v1}/products?api_key=${key}&product_group_id=${id}&per=25`, { 'Content-Type': 'application/json' })
  const productFromFilterV1 = productIdFromPayload(productsByGroupV1, id)
  if (productFromFilterV1) return { kind: 'product', id: productFromFilterV1 }

  const productsByGroupV1Alt = await fetchJsonOrNull(`${v1}/products?api_key=${key}&filter[product_group_id]=${id}&per=25`, { 'Content-Type': 'application/json' })
  const productFromFilterV1Alt = productIdFromPayload(productsByGroupV1Alt, id)
  if (productFromFilterV1Alt) return { kind: 'product', id: productFromFilterV1Alt }

  // Dernier recours : l'ID était peut-être un bundle qui n'existait pas encore
  // dans products_cache avec source_type=bundle.
  const bundle = await resolveBundleId(id, v4, v4Headers)
  if (bundle.kind === 'bundle') return bundle

  return { kind: 'none', reason: `Impossible de résoudre l’ID Booqable ${id} en product ou bundle` }
}

async function createBooqableOrder(customerId: string, startsAt: string, stopsAt: string): Promise<string> {
  const subdomain = process.env.BOOQABLE_SUBDOMAIN
  const key = process.env.BOOQABLE_API_KEY
  const v4 = `https://${subdomain}.booqable.com/api/4`

  // Prefer v4 because order_fulfillments is v4 too.
  try {
    const orderData = await postJson<BooqableOrderResponse>(
      `${v4}/orders`,
      {
        data: {
          type: 'orders',
          attributes: {
            customer_id: customerId,
            starts_at: startsAt,
            stops_at: stopsAt,
            status: 'draft',
          },
        },
      },
      { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      'Order creation v4'
    )

    const orderId = orderData.data?.id || orderData.order?.id
    if (orderId) return orderId
  } catch (error) {
    console.warn('Order creation v4 failed, falling back to v1:', error instanceof Error ? error.message : String(error))
  }

  const v1 = `https://${subdomain}.booqable.com/api/1`
  const orderData = await postJson<BooqableOrderResponse>(
    `${v1}/orders?api_key=${key}`,
    {
      order: {
        customer_id: customerId,
        starts_at: startsAt,
        stops_at: stopsAt,
        status: 'concept',
      },
    },
    { 'Content-Type': 'application/json' },
    'Order creation v1'
  )

  const orderId = orderData.order?.id || orderData.data?.id
  if (!orderId) throw new Error(`Order creation failed: ${JSON.stringify(orderData)}`)
  return orderId
}

async function createCustomLine({
  orderId,
  item,
  lineType,
}: {
  orderId: string
  item: QuoteItem
  lineType: 'charge' | 'section'
}) {
  const subdomain = process.env.BOOQABLE_SUBDOMAIN
  const key = process.env.BOOQABLE_API_KEY
  const v4 = `https://${subdomain}.booqable.com/api/4`
  const title = cleanTitle(item.title || item.name || item.requestedName, lineType === 'section' ? 'Section' : 'Produit à vérifier')
  const attributes: JsonObject = {
    line_type: lineType,
    title,
    quantity: lineType === 'section' ? 1 : quantityOf(item),
    ...(lineType === 'charge' ? {
      price_each_in_cents: 0,
      extra_information: lineNotes(item, 'Ligne custom créée par FilmeAI car la correspondance catalogue est incertaine. À vérifier et chiffrer dans Booqable.'),
    } : {}),
  }

  const attempts = [
    {
      label: `Custom ${lineType} line owner_type orders`,
      body: {
        data: {
          type: 'lines',
          attributes: {
            ...attributes,
            owner_id: orderId,
            owner_type: 'orders',
          },
        },
      },
    },
    {
      label: `Custom ${lineType} line owner_type Order`,
      body: {
        data: {
          type: 'lines',
          attributes: {
            ...attributes,
            owner_id: orderId,
            owner_type: 'Order',
          },
        },
      },
    },
  ]

  const errors: string[] = []
  for (const attempt of attempts) {
    try {
      await postJson(
        `${v4}/lines`,
        attempt.body,
        { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        attempt.label
      )
      return
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  throw new Error(errors.join(' | '))
}

async function productIdForProductGroup(
  productGroupId: string,
  v1: string,
  v4: string,
  key: string | undefined,
  v4Headers: Record<string, string>
): Promise<string | null> {
  const productGroupV4 = await fetchJsonOrNull(`${v4}/product_groups/${productGroupId}?include=products`, v4Headers)
  const productFromGroup = productIdFromPayload(productGroupV4, productGroupId)
  if (productFromGroup) return productFromGroup

  const productsByGroupV4 = await fetchJsonOrNull(`${v4}/products?filter[product_group_id]=${productGroupId}&page[size]=25`, v4Headers)
  const productFromFilterV4 = productIdFromPayload(productsByGroupV4, productGroupId)
  if (productFromFilterV4) return productFromFilterV4

  const productGroupV1 = await fetchJsonOrNull(`${v1}/product_groups/${productGroupId}?api_key=${key}`, { 'Content-Type': 'application/json' })
  const productFromGroupV1 = productIdFromPayload(productGroupV1, productGroupId)
  if (productFromGroupV1) return productFromGroupV1

  const productsByGroupV1 = await fetchJsonOrNull(`${v1}/products?api_key=${key}&product_group_id=${productGroupId}&per=25`, { 'Content-Type': 'application/json' })
  return productIdFromPayload(productsByGroupV1, productGroupId)
}

async function fetchBundleComponents(bundleId: string): Promise<BundleComponent[]> {
  const subdomain = process.env.BOOQABLE_SUBDOMAIN
  const key = process.env.BOOQABLE_API_KEY
  const v1 = `https://${subdomain}.booqable.com/api/1`
  const v4 = `https://${subdomain}.booqable.com/api/4`
  const v4Headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const urls = [
    `${v4}/bundle_items?filter[bundle_id]=${bundleId}&include=product_group,product&page[size]=100`,
    `${v4}/bundle_items?bundle_id=${bundleId}&include=product_group,product&page[size]=100`,
  ]

  let resources: unknown[] = []
  for (const url of urls) {
    const payload = await fetchJsonOrNull(url, v4Headers)
    const root = asObject(payload)
    const data = root ? asArray(root.data) : []
    const filtered = data.filter(resource => {
      const attrBundleId = attrString(resource, 'bundle_id')
      const relBundleId = relationshipId(resource, 'bundle')
      return attrBundleId === bundleId || relBundleId === bundleId
    })

    if (filtered.length > 0) {
      resources = filtered
      break
    }
  }

  const components: BundleComponent[] = []
  for (const resource of resources) {
    const directProductId = attrString(resource, 'product_id') || relationshipId(resource, 'product')
    const productGroupId = attrString(resource, 'product_group_id') || relationshipId(resource, 'product_group')
    const quantity = Math.max(1, Math.round(attrNumber(resource, 'quantity') || 1))
    const productId = directProductId || (productGroupId
      ? await productIdForProductGroup(productGroupId, v1, v4, key, v4Headers)
      : null)

    if (productId) {
      components.push({
        productId,
        productGroupId,
        quantity,
      })
    }
  }

  return components
}

async function postOrderFulfillmentAction(action: JsonObject, context: string) {
  const subdomain = process.env.BOOQABLE_SUBDOMAIN
  const key = process.env.BOOQABLE_API_KEY
  const v4 = `https://${subdomain}.booqable.com/api/4`

  await postJson(
    `${v4}/order_fulfillments`,
    {
      data: {
        type: 'order_fulfillments',
        attributes: action,
      },
    },
    { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    context
  )
}

async function bookProductById(orderId: string, productId: string, quantity: number, context: string) {
  await postOrderFulfillmentAction({
    order_id: orderId,
    confirm_shortage: true,
    actions: [
      {
        action: 'book_product',
        mode: 'create_new',
        product_id: productId,
        quantity,
      },
    ],
  }, context)
}

async function bookBundleById(orderId: string, item: QuoteItem, bundleId: string) {
  const components = await fetchBundleComponents(bundleId)
  const quantity = quantityOf(item)
  const productVariations = components
    .filter(component => component.productGroupId)
    .map(component => ({
      product_group_id: component.productGroupId,
      product_id: component.productId,
    }))

  const baseAction = {
    action: 'book_bundle',
    bundle_id: bundleId,
    quantity,
  }

  // Booqable refuse `mode` sur book_bundle. Pour les bundles sans variations,
  // il refuse aussi product_variations avec le message "0 product_variations should be included".
  // On tente donc d'abord le payload minimal officiel : action + bundle_id + quantity.
  const attempts: { label: string; action: JsonObject }[] = [
    {
      label: 'book_bundle minimal',
      action: baseAction,
    },
  ]

  if (productVariations.length > 0) {
    attempts.push({
      label: 'book_bundle with product_variations',
      action: { ...baseAction, product_variations: productVariations },
    })
  }

  const errors: string[] = []
  for (const attempt of attempts) {
    try {
      await postOrderFulfillmentAction({
        order_id: orderId,
        confirm_shortage: true,
        actions: [attempt.action],
      }, `${attempt.label} ${item.name || item.requestedName || item.productId}`)
      return
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  const componentInfo = components.length > 0
    ? ` Le bundle contient ${components.length} composant${components.length > 1 ? 's' : ''}, mais FilmeAI ne les ajoute plus séparément pour éviter de casser la structure pack dans Booqable.`
    : ''

  throw new Error(`Bundle ${item.name || item.requestedName || bundleId} impossible à ajouter comme pack Booqable.${componentInfo} Erreurs Booqable : ${errors.join(' | ')}`)
}

async function bookResolvedItem({
  orderId,
  item,
  resolved,
}: {
  orderId: string
  item: QuoteItem
  resolved: ResolvedBooqableItem
}) {
  if (resolved.kind === 'product') {
    await bookProductById(
      orderId,
      resolved.id,
      quantityOf(item),
      `Book product ${item.name || item.requestedName || item.productId}`
    )
    return
  }

  if (resolved.kind === 'bundle') {
    await bookBundleById(orderId, item, resolved.id)
  }
}

async function createProductLineOrCustomFallback({
  orderId,
  item,
}: {
  orderId: string
  item: QuoteItem
}) {
  const resolved = await resolveBooqableItem(item)

  if (resolved.kind !== 'none') {
    try {
      await bookResolvedItem({ orderId, item, resolved })
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (resolved.kind === 'bundle') {
        throw new Error(`Bundle non créé dans Booqable : ${item.name || item.requestedName || item.productId}. ${message}`)
      }
      console.warn('Booqable book item failed, creating custom charge:', message)
    }
  }

  await createCustomLine({
    orderId,
    lineType: 'charge',
    item: {
      ...item,
      title: cleanTitle(item.name || item.requestedName, 'Produit à vérifier'),
      requestedName: item.requestedName || item.name,
      name: item.name,
      type: 'custom_charge',
      section: item.section,
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const { customer, items, startsAt, stopsAt } = await req.json() as {
      customer: Customer
      items: QuoteItem[]
      startsAt: string
      stopsAt: string
    }

    const subdomain = process.env.BOOQABLE_SUBDOMAIN
    const key = process.env.BOOQABLE_API_KEY
    const v1 = `https://${subdomain}.booqable.com/api/1`

    if (!key) throw new Error('BOOQABLE_API_KEY is missing')
    if (!customer?.name?.trim()) throw new Error('Customer name is required')

    // 1. Use existing customer or create new one.
    let customerId: string

    if (customer.booqableId) {
      customerId = customer.booqableId
    } else {
      const custData = await postJson<BooqableCustomerResponse>(
        `${v1}/customers?api_key=${key}`,
        {
          customer: {
            name: customer.name,
            ...(customer.email ? { email: customer.email } : {}),
            ...(customer.phone ? { phone: customer.phone } : {}),
          },
        },
        { 'Content-Type': 'application/json' },
        'Customer creation'
      )

      customerId = custData.customer?.id ?? ''
      if (!customerId) throw new Error(`Customer creation failed: ${JSON.stringify(custData)}`)
    }

    // 2. Create order.
    const orderId = await createBooqableOrder(customerId, startsAt, stopsAt)

    // 3. Add lines in the exact order from the quote builder.
    // Real products are created via /api/4/order_fulfillments.
    // Custom charges/sections are only used when we cannot resolve or book the item.
    for (const item of items || []) {
      const type = item.type || (item.productId ? 'product' : 'custom_charge')

      if (type === 'section') {
        await createCustomLine({ orderId, item, lineType: 'section' })
      } else if (type === 'product' && item.productId) {
        await createProductLineOrCustomFallback({ orderId, item })
      } else {
        await createCustomLine({ orderId, item, lineType: 'charge' })
      }
    }

    const orderUrl = `https://filme.booqable.com/orders/${orderId}`

    // 4. Save structured quote/request to Supabase.
    const days = rentalDays(startsAt, stopsAt)
    const storedQuoteItems = buildStoredQuoteItems(items || [], days)
    const quoteTotal = storedQuoteItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0)
    const quoteDeposit = storedQuoteItems.reduce((sum, item) => sum + Number(item.lineDeposit || 0), 0)
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()

    const supabase = getSupabaseAdmin()
    const organizationId = await getDefaultOrganizationId(supabase)
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .insert({
        ...(organizationId ? { organization_id: organizationId } : {}),
        contact_name: customer.name || null,
        contact_email: customer.email || null,
        contact_phone: customer.phone || null,
        status: 'open',
        quote_status: 'pending_validation',
        source: 'backoffice',
        starts_at: startsAt,
        stops_at: stopsAt,
        expires_at: expiresAt,
        request_context: summarizeContext(customer, items || [], startsAt, stopsAt),
        quote_items: storedQuoteItems,
        quote_total: quoteTotal,
        quote_deposit: quoteDeposit,
        quote_days: days,
        booqable_order_id: orderId,
        booqable_order_url: orderUrl,
      })
      .select('id')
      .single()

    if (convError) {
      throw new Error(`Supabase quote save failed: ${convError.message}`)
    }

    return NextResponse.json({
      success: true,
      orderId,
      orderUrl,
      customerId,
      conversationId: conv?.id || null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('create-quote error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
