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
  const { customerId, products, fullDiscount = false, returnDays = 30 } = params

  const orderBody: Record<string, unknown> = {
    customer_id: customerId,
    starts_at: bqDate(today()),
    stops_at: bqDate(inDays(returnDays)),
    deposit_type: 'none',               // pas de caution sur SAV
  }

  if (fullDiscount) {
    orderBody.discount_percentage = 100  // remise 100% pour matériel manquant
  }

  if (products.length > 0) {
    orderBody.lines_attributes = products.map(p => ({
      product_id: p.productId,
      quantity: p.quantity,
    }))
  }

  const res = await fetch(`${BASE}/orders`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ order: orderBody }),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable createOrder error ${res.status}: ${text}`)
  }

  const data = await res.json() as { order?: BooqableOrder }
  return data.order || null
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

  const res = await fetch(`${BASE}/orders/${orderId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ order: { tag_list: [...existingTags, tag] } }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable addTag error ${res.status}: ${text}`)
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
          { name: 'Note interne', identifier: 'note_interne', value: comment },
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
