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
  const url = `${BASE}/orders?q=${encodeURIComponent(orderNumber)}&include=customer,lines&per=5`
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Booqable fetchOrder error: ${res.status}`)

  const data = await res.json() as { orders?: BooqableOrder[] }
  const orders = data.orders || []
  return orders.find(o => String(o.number) === String(orderNumber)) || orders[0] || null
}

// ── Create SAV order ───────────────────────────────────────────────────────────

export type CreateSAVOrderParams = {
  customerId: string
  products: Array<{ productId: string; quantity: number }>
  /** Si true → remise 100% + caution = aucune (matériel manquant) */
  fullDiscount?: boolean
  returnDays?: number
}

export async function createSAVOrder(params: CreateSAVOrderParams): Promise<BooqableOrder | null> {
  const { customerId, fullDiscount = false, returnDays = 30 } = params

  const subdomain = process.env.BOOQABLE_SUBDOMAIN
  const key = process.env.BOOQABLE_API_KEY
  const startsAt = bqDate(today())
  const stopsAt  = bqDate(inDays(returnDays))

  // ── Essai v4 (même pattern que createBooqableOrder dans booqable.ts) ─────────
  try {
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
            customer_id: customerId,
            starts_at: startsAt,
            stops_at: stopsAt,
            status: 'draft',
            ...(fullDiscount ? { deposit_type: 'none' } : {}),
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (v4Res.ok) {
      const d = await v4Res.json() as { data?: { id: string }; order?: BooqableOrder }
      const orderId = d.data?.id || (d.order as BooqableOrder | undefined)?.id
      if (orderId) {
        // Si remise 100%, appliquer via PATCH v1
        if (fullDiscount) {
          await fetch(`https://${subdomain}.booqable.com/api/1/orders/${orderId}?api_key=${key}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: { discount_percentage: 100, deposit_type: 'none' } }),
          })
        }
        return { id: orderId, number: '', status: 'concept', starts_at: startsAt, stops_at: stopsAt, customer_id: customerId, customer: null, tags: [], lines: [], properties_attributes: {} }
      }
    }
  } catch (e) {
    console.warn('SAV order v4 failed, trying v1:', e)
  }

  // ── Fallback v1 avec api_key en query param ───────────────────────────────────
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
        ...(fullDiscount ? { discount_percentage: 100 } : {}),
      },
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!v1Res.ok) {
    const text = await v1Res.text()
    throw new Error(`Booqable createSAVOrder v1 error ${v1Res.status}: ${text}`)
  }

  const v1Data = await v1Res.json() as { order?: BooqableOrder }
  return v1Data.order || null
}

// ── Add tag ────────────────────────────────────────────────────────────────────

/**
 * Ajoute un tag à une order existante (conserve les tags existants).
 * GET retourne `tags`, PUT accepte `tag_list` (array).
 */
export async function addTagToOrder(orderId: string, tag: string): Promise<void> {
  const getRes = await fetch(`${BASE}/orders/${orderId}`, {
    headers: headers(),
    signal: AbortSignal.timeout(10000),
  })
  if (!getRes.ok) throw new Error(`Booqable getOrder error: ${getRes.status}`)

  const getData = await getRes.json() as { order?: BooqableOrder }
  const existingTags = getData.order?.tags || []   // GET retourne "tags"

  if (existingTags.includes(tag)) return           // déjà présent

  // v4 PUT — format vérifié sur Google Apps Script setDirectTagFromInvoiceV4
  const res = await fetch(`${BASE4}/orders/${orderId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({
      data: {
        id:   orderId,
        type: 'orders',
        attributes: { tag_list: [...existingTags, tag] },
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

// ── Add line to SAV order ──────────────────────────────────────────────────────

export type SAVLineParams =
  | { type: 'product'; orderId: string; productGroupId: string; quantity: number }
  | { type: 'custom';  orderId: string; title: string; quantity: number; note?: string }

/**
 * Ajoute une ligne à la SAV order via l'API v4.
 * - type 'product' : ligne produit Booqable (product_group_id)
 * - type 'custom'  : ligne custom (article non référencé)
 */
export async function addSAVLine(params: SAVLineParams): Promise<void> {
  const attributes: Record<string, unknown> = {
    owner_id:   params.orderId,
    owner_type: 'orders',
    quantity:   params.quantity,
  }

  if (params.type === 'product') {
    attributes.product_group_id = params.productGroupId
  } else {
    attributes.line_type   = 'charge'
    attributes.title       = params.title
    attributes.price_each_in_cents = 0
    if (params.note) attributes.extra_information = params.note
  }

  const res = await fetch(`${BASE4}/lines`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ data: { type: 'lines', attributes } }),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable addSAVLine error ${res.status}: ${text}`)
  }
}
