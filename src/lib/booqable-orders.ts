/**
 * Helpers pour l'API Booqable v1 — gestion des orders (SAV / retours).
 *
 * Champs vérifiés sur réponse API réelle :
 * - GET /orders retourne `tags` (pas tag_list)
 * - Notes internes → properties_attributes.note_interne
 * - Order SAV origine → properties_attributes.order_sav
 * - PUT /orders/{id} accepte tag_list (array) pour écrire les tags
 */

const BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/1`
const BASE4 = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/4`
const KEY  = process.env.BOOQABLE_API_KEY

function headers() {
  return {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type BooqableCustomer = {
  id: string
  name: string
  email: string
}

export type BooqableOrderLine = {
  id: string
  product_id: string
  product_name: string
  quantity: number
  product_group_id?: string   // UUID Booqable du product_group (disponible via boomerang)
  stock_item_id?: string      // UUID de l'exemplaire assigné (disponible via boomerang stock_item_plannings)
  stock_item_identifier?: string // ex: "camera-sony-fx3-nue-id-2"
}

export type BooqableOrder = {
  id: string
  number: string | number
  status: string
  starts_at: string
  stops_at: string
  customer_id: string
  customer: BooqableCustomer | null
  tags: string[]                        // GET retourne "tags"
  lines: BooqableOrderLine[]
  properties_attributes: Record<string, string>
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Formate une date ISO en format Booqable */
function bqDate(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
}

function today(): Date { return new Date() }
function inDays(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

// ── Fetch order ────────────────────────────────────────────────────────────────

export async function fetchOrderByNumber(orderNumber: string): Promise<BooqableOrder | null> {
  // Étape 1 : recherche par numéro EXACT via boomerang filter[number] (évite les faux positifs du ?q= général)
  const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`
  const boomSearchRes = await fetch(
    `${BASE_BOOMERANG}/orders?filter[number]=${encodeURIComponent(orderNumber)}&include=customer&per=1`,
    { headers: headers(), signal: AbortSignal.timeout(10000) }
  )
  if (!boomSearchRes.ok) throw new Error(`Booqable fetchOrder error: ${boomSearchRes.status}`)

  const boomSearchData = await boomSearchRes.json() as {
    data?: Array<{ id: string; attributes: Record<string, unknown>; relationships?: Record<string, unknown> }>
    included?: Array<{ type: string; id: string; attributes: Record<string, unknown> }>
  }

  const orderData = boomSearchData.data?.[0]
  if (!orderData) return null

  // Reconstruire un objet BooqableOrder partiel depuis la réponse boomerang
  const customerIncluded = (boomSearchData.included || []).find(
    r => r.type === 'customers' &&
      r.id === (orderData.relationships?.customer as { data?: { id?: string } })?.data?.id
  )
  const order: BooqableOrder = {
    id: orderData.id,
    number: String(orderData.attributes.number ?? orderNumber),
    status: String(orderData.attributes.status ?? ''),
    starts_at: String(orderData.attributes.starts_at ?? ''),
    stops_at: String(orderData.attributes.stops_at ?? ''),
    customer_id: String(orderData.attributes.customer_id ?? ''),
    customer: customerIncluded ? {
      id: customerIncluded.id,
      name: String(customerIncluded.attributes.name ?? ''),
      email: String(customerIncluded.attributes.email ?? ''),
    } : null,
    tags: Array.isArray(orderData.attributes.tag_list) ? orderData.attributes.tag_list as string[] : [],
    lines: [],
    properties_attributes: (orderData.attributes.properties ?? {}) as Record<string, string>,
  }
  // Étape 2 : récupérer les lignes via /lines?filter[order_id] (évite la pagination de included sur les grandes commandes)
  try {
    const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`
    const boomRes = await fetch(
      `${BASE_BOOMERANG}/lines?filter[order_id]=${order.id}&include=item,planning,stock_item&per=200`,
      { headers: headers(), signal: AbortSignal.timeout(12000) }
    )

    if (boomRes.ok) {
      // L'endpoint /lines retourne les lignes dans data[] et les produits dans included[]
      type BoomNode = { type: string; id: string; attributes: Record<string, unknown>; relationships?: Record<string, unknown> }
      const boomData = await boomRes.json() as { data?: BoomNode[]; included?: BoomNode[] }

      const linesData = boomData.data || []
      const included  = boomData.included || []

      // Index universel : tous les objets included par id
      // Supporte : products, product_groups, product_group (variantes de nommage Booqable)
      const itemNameMap   = new Map<string, string>()
      const itemGroupMap  = new Map<string, string>() // id → product_group_id
      const stockItemMap  = new Map<string, string>() // id → identifier

      for (const r of included) {
        const name = String(r.attributes.name || r.attributes.display_name || '')
        if (r.type === 'products' || r.type === 'product') {
          itemNameMap.set(r.id, name)
          const pgId = String(r.attributes.product_group_id || '')
          if (pgId) itemGroupMap.set(r.id, pgId)
        }
        if (r.type === 'product_groups' || r.type === 'product_group') {
          itemNameMap.set(r.id, name)
        }
        if (r.type === 'stock_items' || r.type === 'stock_item') {
          stockItemMap.set(r.id, String(r.attributes.identifier || ''))
        }
      }

      // Construire les lignes depuis data[] (chaque entrée est une line)
      const lines: BooqableOrderLine[] = []
      for (const r of linesData) {
        const attrs = r.attributes
        const qty = Number(attrs.quantity) || 0
        if (qty <= 0) continue

        type Rel = { data?: { type: string; id: string } }
        const rels = r.relationships as Record<string, Rel> | undefined
        const itemRel     = rels?.item?.data
        const itemRelId   = itemRel?.id   || String(attrs.item_id || '')
        const itemRelType = itemRel?.type || ''

        // product_group_id
        const isGroup = itemRelType === 'product_groups' || itemRelType === 'product_group'
        const productGroupId: string | undefined = isGroup
          ? itemRelId
          : (itemGroupMap.get(itemRelId) || undefined)

        // Nom : attrs.description / name / title en priorité, sinon lookup included
        const productName = String(
          attrs.description ||
          attrs.name ||
          attrs.title ||
          itemNameMap.get(itemRelId) ||
          ''
        )
        if (!productName && !itemRelId) continue

        // stock_item
        const stockItemRel = rels?.stock_item?.data
        const stockItemId  = stockItemRel?.id || undefined
        const stockItemIdentifier = stockItemId ? stockItemMap.get(stockItemId) : undefined

        lines.push({
          id: r.id,
          product_id: itemRelId,
          product_name: productName,
          quantity: qty,
          product_group_id: productGroupId,
          stock_item_id: stockItemId,
          stock_item_identifier: stockItemIdentifier,
        })
      }

      if (lines.length > 0) order.lines = lines
    }
  } catch (e) {
    console.warn('fetchOrderByNumber: boomerang enrichment failed, lines may be empty:', e)
  }

  return order
}

// ── Create SAV order ───────────────────────────────────────────────────────────

export type CreateSAVOrderParams = {
  customerId: string
  /** Si true → remise 100% + caution = aucune (matériel manquant) */
  fullDiscount?: boolean
  returnDays?: number
}

export async function createSAVOrder(params: CreateSAVOrderParams): Promise<BooqableOrder | null> {
  const { customerId, returnDays = 30 } = params

  const subdomain = process.env.BOOQABLE_SUBDOMAIN
  const key = process.env.BOOQABLE_API_KEY
  const startsAt = bqDate(today())
  const stopsAt  = bqDate(inDays(returnDays))

  // ── v1 en premier (gère customer_id nativement) ───────────────────────────────
  try {
    const v1Url = `https://${subdomain}.booqable.com/api/1/orders?api_key=${key}`
    const v1Res = await fetch(v1Url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: {
          customer_id: customerId,
          starts_at: startsAt,
          stops_at: stopsAt,
          status: 'concept',
          deposit_type: 'none',
          discount_percentage: 100,
        },
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (v1Res.ok) {
      const v1Data = await v1Res.json() as { order?: BooqableOrder }
      if (v1Data.order) return v1Data.order
    } else {
      const text = await v1Res.text()
      console.warn(`createSAVOrder v1 error ${v1Res.status}: ${text}`)
    }
  } catch (e) {
    console.warn('SAV order v1 failed, trying v4:', e)
  }

  // ── Fallback v4 (avec relationships pour customer) ────────────────────────────
  const v4Url = `https://${subdomain}.booqable.com/api/4/orders`
  const v4Res = await fetch(v4Url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        type: 'orders',
        attributes: {
          starts_at: startsAt,
          stops_at: stopsAt,
          status: 'draft',
        },
        relationships: {
          customer: { data: { type: 'customers', id: customerId } },
        },
      },
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!v4Res.ok) {
    const text = await v4Res.text()
    throw new Error(`Booqable createSAVOrder v4 error ${v4Res.status}: ${text}`)
  }

  const d = await v4Res.json() as {
    data?: { id: string; attributes?: { number?: string | number } }
  }
  const orderId = d.data?.id
  if (!orderId) throw new Error('createSAVOrder v4: pas d\'ID dans la réponse')
  const orderNumber = String(d.data?.attributes?.number || '')

  // Applique discount + deposit via v1 PATCH
  await fetch(`https://${subdomain}.booqable.com/api/1/orders/${orderId}?api_key=${key}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order: { discount_percentage: 100, deposit_type: 'none' },
    }),
  }).catch(e => console.warn('Failed to patch discount on v4 order:', e))

  return { id: orderId, number: orderNumber, status: 'concept', starts_at: startsAt, stops_at: stopsAt, customer_id: customerId, customer: null, tags: [], lines: [], properties_attributes: {} }
}

// ── Zero out order lines prices ────────────────────────────────────────────────

/**
 * Remet le prix de toutes les lignes d'une order à 0 via v1.
 * Utilise GET /orders/{id}?include=lines puis PATCH /lines/{id} pour chaque ligne.
 */
export async function zeroOutOrderLines(orderId: string): Promise<void> {
  const key = KEY

  // 1. Récupérer les lignes via v1 (plus fiable que v4 pour les filtres)
  const res = await fetch(
    `${BASE}/orders/${orderId}?include=lines&api_key=${key}`,
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
  )
  if (!res.ok) {
    console.warn(`zeroOutOrderLines: GET order failed (${res.status})`)
    return
  }

  const data = await res.json() as { order?: { lines?: Array<{ id: string }> } }
  const lines = data.order?.lines || []

  if (lines.length === 0) {
    console.warn(`zeroOutOrderLines: no lines found for order ${orderId}`)
    return
  }

  // 2. Mettre chaque ligne à 0 via v1
  await Promise.all(lines.map(line =>
    fetch(`${BASE}/lines/${line.id}?api_key=${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ line: { price_in_cents: 0, original_price_in_cents: 0 } }),
      signal: AbortSignal.timeout(8000),
    }).then(r => {
      if (!r.ok) r.text().then(t => console.warn(`zeroOutOrderLines: PUT line ${line.id} failed (${r.status}): ${t}`))
    }).catch(e => console.warn(`zeroOutOrderLines: line ${line.id} error:`, e))
  ))
}

// ── Start (pickup) SAV order ───────────────────────────────────────────────────

/**
 * Passe la SAV order en statut "started" via order_transitions.
 * Essaie reserved→started, puis concept→reserved si nécessaire.
 * Non bloquant : retourne l'erreur sans throw.
 */
export async function startSAVOrder(orderId: string): Promise<{ error?: string }> {
  const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`

  const tryTransition = async (from: string, to: string): Promise<boolean> => {
    const res = await fetch(`${BASE_BOOMERANG}/order_transitions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        data: {
          type: 'order_transitions',
          attributes: {
            order_id:          orderId,
            transition_from:   from,
            transition_to:     to,
            confirm_shortage:  false,
            revert_until:      null,
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) return true
    const text = await res.text()
    console.warn(`startSAVOrder: ${from}→${to} failed (${res.status}): ${text}`)
    return false
  }

  try {
    // Tentative directe reserved → started
    if (await tryTransition('reserved', 'started')) {
      console.log(`startSAVOrder: order ${orderId} started ✓`)
      return {}
    }
    // Fallback : concept → reserved → started
    if (await tryTransition('concept', 'reserved')) {
      if (await tryTransition('reserved', 'started')) {
        console.log(`startSAVOrder: order ${orderId} started via concept→reserved→started ✓`)
        return {}
      }
    }
    return { error: 'Transition de statut échouée (non bloquant)' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('startSAVOrder error:', msg)
    return { error: msg }
  }
}

// ── Add tag ────────────────────────────────────────────────────────────────────

/**
 * Ajoute un tag à une order existante (conserve les tags existants).
 * GET retourne `tags`, PUT accepte `tag_list` (array).
 */
export async function addTagToOrder(orderId: string, tags: string | string[]): Promise<void> {
  const newTags = (Array.isArray(tags) ? tags : [tags]).map(t => t.toLowerCase())

  const getRes = await fetch(`${BASE}/orders/${orderId}`, {
    headers: headers(),
    signal: AbortSignal.timeout(10000),
  })
  if (!getRes.ok) throw new Error(`Booqable getOrder error: ${getRes.status}`)

  const getData = await getRes.json() as { order?: BooqableOrder }
  const existingTags = getData.order?.tags || []

  const merged = Array.from(new Set([...existingTags, ...newTags]))
  if (merged.length === existingTags.length && newTags.every(t => existingTags.includes(t))) return  // tous déjà présents

  // v4 PUT
  const res = await fetch(`${BASE4}/orders/${orderId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({
      data: {
        id:   orderId,
        type: 'orders',
        attributes: { tag_list: merged },
      },
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable addTag v4 error ${res.status}: ${text}`)
  }
}

// ── Add internal note ──────────────────────────────────────────────────────────

/**
 * Écrit dans properties_attributes.note_interne (champ Filme vérifié).
 * Conserve les autres properties_attributes existants.
 */
export async function addInternalNote(orderId: string, note: string): Promise<void> {
  const res = await fetch(`${BASE}/orders/${orderId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({
      order: {
        properties_attributes: [
          { name: 'Note interne', identifier: 'note_interne', value: note },
        ],
      },
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable addNote error ${res.status}: ${text}`)
  }
}

// ── Set order original ────────────────────────────────────────────────────────

/**
 * Renseigne la propriété "Commande d'origine" (order_original) sur la commande de retour.
 * Identifiant Booqable : order_original
 */
export async function setOriginalOrder(
  returnOrderId: string,
  originalOrderNumber: string
): Promise<void> {
  const res = await fetch(`${BASE}/orders/${returnOrderId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({
      order: {
        properties_attributes: [
          { name: 'Commande d\'origine', identifier: 'original_order', value: originalOrderNumber },
        ],
      },
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable setOriginalOrder error ${res.status}: ${text}`)
  }
}

// ── Add SAV comment ────────────────────────────────────────────────────────────

/**
 * Renseigne les champs SAV Booqable :
 * - properties_attributes.order_sav  = numéro de l'order d'origine
 * - properties_attributes.note_interne = commentaire SAV
 * (champs vérifiés dans la réponse API Filme)
 */
export async function addSAVComment(
  orderId: string,
  originOrderNumber: string,
  comment: string
): Promise<void> {
  const res = await fetch(`${BASE}/orders/${orderId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({
      order: {
        properties_attributes: [
          { name: 'Order SAV', identifier: 'order_sav', value: originOrderNumber },
          { name: 'Notes SAV', identifier: 'notes_sav', value: comment },
        ],
      },
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable addSAVComment error ${res.status}: ${text}`)
  }
}

// ── Search products ────────────────────────────────────────────────────────────

export type ProductSearchResult = {
  id: string           // product_group_id Booqable
  name: string
  tracking: 'bulk' | 'trackable' | 'no_tracking' | 'unknown'
  price_per_day: number | null
}

/**
 * Cherche des produits dans le catalogue Booqable par nom.
 * Retourne le type de tracking (bulk/trackable) pour guider la SAV.
 */
export async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  const url = `${BASE}/product_groups?q=${encodeURIComponent(query)}&per=8&api_key=${KEY}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Booqable searchProducts error: ${res.status}`)

  const data = await res.json() as {
    product_groups?: Array<{
      id: string
      name: string
      tracking: string
      base_price_as_decimal?: string
      archived_at?: string | null
    }>
  }

  return (data.product_groups || [])
    .filter(pg => !pg.archived_at)
    .map(pg => ({
      id: pg.id,
      name: pg.name,
      tracking: (['bulk', 'trackable', 'no_tracking'].includes(pg.tracking)
        ? pg.tracking
        : 'unknown') as ProductSearchResult['tracking'],
      price_per_day: pg.base_price_as_decimal ? parseFloat(pg.base_price_as_decimal) : null,
    }))
}

// ── Get stock items ────────────────────────────────────────────────────────────

export type StockItemResult = {
  id: string           // UUID Booqable
  identifier: string   // ex: "camera-sony-fx3-nue-id-2"
  status: string       // "in_stock", "picked_up", etc.
  serial_number?: string
}

/**
 * Retourne tous les exemplaires (stock items) d'un product_group trackable.
 * Filtrage des entrées temporaires (TMP-).
 */
export async function getStockItems(productGroupId: string): Promise<StockItemResult[]> {
  const url = `${BASE}/product_groups/${productGroupId}?api_key=${KEY}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Booqable getStockItems error: ${res.status}`)

  const data = await res.json() as {
    product_group?: {
      products?: Array<{
        stock_items?: Array<{
          id: string
          identifier: string
          status: string
          properties?: Array<{ identifier: string; value: string }>
        }>
      }>
    }
  }

  const items = data.product_group?.products?.[0]?.stock_items || []
  return items
    .filter(item => !item.identifier.toUpperCase().startsWith('TMP-'))
    .map(item => ({
      id: item.id,
      identifier: item.identifier,
      status: item.status,
      serial_number: item.properties?.find(p => p.identifier === 's_n')?.value || undefined,
    }))
}

// ── Add line to SAV order ──────────────────────────────────────────────────────

export type SAVLineParams =
  | { type: 'product'; orderId: string; productGroupId: string; quantity: number; stockItemId?: string }
  | { type: 'custom';  orderId: string; title: string; quantity: number; note?: string }

/**
 * Résout le product_id Booqable depuis un product_group_id.
 * Même logique que booqable.ts → productIdForProductGroup.
 */
async function resolveProductId(productGroupId: string): Promise<string | null> {
  const key = KEY

  // v4 — product_group include=products
  try {
    const res = await fetch(`${BASE4}/product_groups/${productGroupId}?include=products`, {
      headers: headers(),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json() as { included?: Array<{ type: string; id: string; attributes?: { product_group_id?: string } }> }
      const product = (data.included || []).find(r => r.type === 'products' || r.type === 'product')
      if (product?.id) return product.id
    }
  } catch { /* continue */ }

  // v4 — filter by product_group_id
  try {
    const res = await fetch(`${BASE4}/products?filter[product_group_id]=${productGroupId}&page[size]=5`, {
      headers: headers(),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json() as { data?: Array<{ id: string }> }
      if (data.data?.[0]?.id) return data.data[0].id
    }
  } catch { /* continue */ }

  // v1 fallback
  try {
    const res = await fetch(`${BASE}/product_groups/${productGroupId}?api_key=${key}`, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json() as { product_group?: { products?: Array<{ id: string }> } }
      if (data.product_group?.products?.[0]?.id) return data.product_group.products[0].id
    }
  } catch { /* continue */ }

  return null
}

/**
 * Ajoute une ligne à la SAV order.
 * - type 'product' : utilise order_fulfillments (book_product / book_specific_stock_items)
 * - type 'custom'  : crée une ligne charge via POST /lines
 */
export async function addSAVLine(params: SAVLineParams): Promise<{ startError?: string }> {
  if (params.type === 'product') {
    // Résoudre le product_id depuis le product_group_id
    const productId = await resolveProductId(params.productGroupId)
    if (!productId) throw new Error(`Impossible de résoudre le product_id pour product_group ${params.productGroupId}`)

    // Pour un stock item spécifique (trackable) :
    // Étape 1 — book_product pour créer le planning
    // Étape 2 — assign_stock_items pour assigner l'exemplaire précis
    if (params.stockItemId) {
      // Étape 1 — book_product avec include=changed_plannings pour récupérer le planning_id
      const bookRes = await fetch(`${BASE4}/order_fulfillments?include=changed_plannings`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          data: {
            type: 'order_fulfillments',
            attributes: {
              order_id: params.orderId,
              confirm_shortage: false,
              actions: [{ action: 'book_product', mode: 'create_new', product_id: productId, quantity: params.quantity }],
            },
          },
        }),
        signal: AbortSignal.timeout(15000),
      })

      if (!bookRes.ok) {
        const text = await bookRes.text()
        throw new Error(`Booqable addSAVLine book_product failed (${bookRes.status}): ${text}`)
      }

      const bookData = await bookRes.json() as {
        included?: Array<{ id: string; type: string }>
      }

      // Chercher le planning_id dans les ressources incluses (type peut être 'planning' ou 'plannings')
      const includedTypes = (bookData.included || []).map(r => r.type)
      console.log('book_product included types:', includedTypes)
      let planningId = (bookData.included || []).find(r => r.type === 'plannings' || r.type === 'planning')?.id

      // Fallback : fetcher les plannings de l'order filtrés par product_id
      if (!planningId) {
        console.warn('addSAVLine: planning not in book_product response, fetching separately...')
        try {
          const planRes = await fetch(
            `${BASE4}/plannings?filter[order_id]=${params.orderId}&filter[product_id]=${productId}&page[size]=5`,
            { headers: headers(), signal: AbortSignal.timeout(8000) }
          )
          if (planRes.ok) {
            const planData = await planRes.json() as { data?: Array<{ id: string }> }
            planningId = planData.data?.[0]?.id
            console.log('addSAVLine: planning fetched separately:', planningId)
          }
        } catch (e) {
          console.warn('addSAVLine: could not fetch plannings:', e)
        }
      }

      let startError: string | undefined

      // Étape 2 — specify_stock_items puis start_stock_items
      if (planningId) {
        // 2a — specify_stock_items : assigner l'exemplaire au planning
        const specifyAction = {
          action: 'specify_stock_items',
          product_id: productId,
          planning_id: planningId,
          stock_item_ids_to_add: [params.stockItemId],
        }
        const specifyRes = await fetch(
          `${BASE4}/order_fulfillments?include=order,changed_plannings,changed_stock_item_plannings`,
          {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({
              order_fulfillment: { order_id: params.orderId, actions: [specifyAction] },
              data: {
                type: 'order_fulfillments',
                attributes: { order_id: params.orderId, confirm_shortage: false, actions: [specifyAction] },
              },
            }),
            signal: AbortSignal.timeout(10000),
          }
        )
        if (!specifyRes.ok) {
          const text = await specifyRes.text()
          console.warn(`addSAVLine: specify_stock_items failed (${specifyRes.status}): ${text}`)
          startError = `specify_stock_items échoué (${specifyRes.status})`
        } else {
          console.log(`addSAVLine: specify_stock_items OK — stock_item ${params.stockItemId} planifié`)

          // 2b — start_stock_items : réserver / "pick up" l'exemplaire
          const startAction = {
            action: 'start_stock_items',
            planning_id: planningId,
            product_id: productId,
            stock_item_ids: [params.stockItemId],
          }
          const startRes = await fetch(
            `${BASE4}/order_fulfillments?include=order,changed_lines,changed_plannings,changed_stock_item_plannings`,
            {
              method: 'POST',
              headers: headers(),
              body: JSON.stringify({
                order_fulfillment: { order_id: params.orderId, actions: [startAction] },
                data: {
                  type: 'order_fulfillments',
                  attributes: { order_id: params.orderId, confirm_shortage: false, actions: [startAction] },
                },
              }),
              signal: AbortSignal.timeout(15000),
            }
          )
          if (!startRes.ok) {
            const text = await startRes.text()
            console.warn(`addSAVLine: start_stock_items failed (${startRes.status}): ${text}`)
            startError = `start_stock_items échoué (${startRes.status}): ${text.slice(0, 200)}`
          } else {
            console.log(`addSAVLine: start_stock_items OK — stock_item ${params.stockItemId} réservé`)
          }
        }
      } else {
        console.warn('addSAVLine: no planning_id found, stock item not assigned')
        startError = 'planning_id introuvable — exemplaire non assigné'
      }

      await zeroOutOrderLines(params.orderId)
      return { startError }
    }

    // Produit bulk → book_product
    const res = await fetch(`${BASE4}/order_fulfillments`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        data: {
          type: 'order_fulfillments',
          attributes: {
            order_id: params.orderId,
            confirm_shortage: false,
            actions: [{ action: 'book_product', mode: 'create_new', product_id: productId, quantity: params.quantity }],
          },
        },
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Booqable addSAVLine error ${res.status}: ${text}`)
    }
    await zeroOutOrderLines(params.orderId)
    return {}
  }

  // Ligne custom (article non référencé)
  const res = await fetch(`${BASE4}/lines`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: 'lines',
        attributes: {
          owner_id:             params.orderId,
          owner_type:           'orders',
          line_type:            'charge',
          title:                params.title,
          quantity:             params.quantity,
          price_each_in_cents:  0,
          ...(params.note ? { extra_information: params.note } : {}),
        },
      },
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable addSAVLine custom error ${res.status}: ${text}`)
  }
  return {}
}
