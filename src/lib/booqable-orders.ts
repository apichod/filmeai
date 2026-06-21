/**
 * Helpers pour l'API Booqable v1 — gestion des orders (SAV / retours).
 *
 * ⚠️  Les noms de champs Booqable peuvent varier selon la configuration du compte.
 *     Vérifier et ajuster si besoin après les premiers tests.
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
  tag_list: string[]
  lines: BooqableOrderLine[]
  note: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Formate une date ISO en YYYY-MM-DD HH:MM:SS (format Booqable) */
function bqDate(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
}

/** Aujourd'hui */
function today(): Date {
  return new Date()
}

/** Dans N jours */
function inDays(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

// ── Fetch order ────────────────────────────────────────────────────────────────

/**
 * Recherche une order Booqable par numéro.
 * Retourne la première correspondance ou null.
 */
export async function fetchOrderByNumber(orderNumber: string): Promise<BooqableOrder | null> {
  const url = `${BASE}/orders?q=${encodeURIComponent(orderNumber)}&include=customer,lines&per=5`
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Booqable fetchOrder error: ${res.status}`)

  const data = await res.json() as { orders?: BooqableOrder[] }
  const orders = data.orders || []

  // Trouver l'order dont le numéro correspond exactement
  return orders.find(o => String(o.number) === String(orderNumber)) || orders[0] || null
}

// ── Create SAV order ───────────────────────────────────────────────────────────

export type CreateSAVOrderParams = {
  customerId: string
  products: Array<{ productId: string; quantity: number }>
  /** Si true → discount 100% + caution = 0 (pour matériel manquant) */
  fullDiscount?: boolean
  /** Nombre de jours pour le retour (défaut 30) */
  returnDays?: number
}

export async function createSAVOrder(params: CreateSAVOrderParams): Promise<BooqableOrder | null> {
  const { customerId, products, fullDiscount = false, returnDays = 30 } = params

  const body = {
    order: {
      customer_id: customerId,
      starts_at: bqDate(today()),
      stops_at: bqDate(inDays(returnDays)),
      deposit_type: fullDiscount ? 'none' : undefined,
      lines_attributes: products.map(p => ({
        product_id: p.productId,
        quantity: p.quantity,
        price_override: fullDiscount ? '0.0' : undefined,
        price_with_currency: fullDiscount ? '0' : undefined,
      })),
    },
  }

  const res = await fetch(`${BASE}/orders`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
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
 * Tags attendus : 'LATE' | 'TOBEREPAIRED'
 */
export async function addTagToOrder(orderId: string, tag: string): Promise<void> {
  // Récupère les tags actuels
  const getRes = await fetch(`${BASE}/orders/${orderId}`, {
    headers: headers(),
    signal: AbortSignal.timeout(10000),
  })
  if (!getRes.ok) throw new Error(`Booqable getOrder error: ${getRes.status}`)
  const getData = await getRes.json() as { order?: BooqableOrder }
  const existingTags = getData.order?.tag_list || []

  if (existingTags.includes(tag)) return // déjà présent

  const res = await fetch(`${BASE}/orders/${orderId}`, {
    method: 'PUT',
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

/** Ajoute ou remplace la note interne d'une order. */
export async function addInternalNote(orderId: string, note: string): Promise<void> {
  const res = await fetch(`${BASE}/orders/${orderId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ order: { note } }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable addNote error ${res.status}: ${text}`)
  }
}

// ── Add SAV comment ────────────────────────────────────────────────────────────

/**
 * Ajoute un commentaire SAV à l'order.
 * Booqable stocke les champs custom dans `properties` ou via l'API comments.
 * On utilise ici le champ `note` enrichi + un champ custom si disponible.
 *
 * ⚠️  Le champ exact pour "Order origine SAV" et "Commentaire SAV" dépend
 *     de la configuration Booqable. À ajuster si nécessaire.
 */
export async function addSAVComment(
  orderId: string,
  originOrderNumber: string,
  comment: string
): Promise<void> {
  const noteContent = `[SAV] Order origine: ${originOrderNumber}\n${comment}`

  const res = await fetch(`${BASE}/orders/${orderId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({
      order: {
        note: noteContent,
        // Si Booqable supporte les champs custom :
        // properties: { sav_origin_order: originOrderNumber, sav_comment: comment }
      },
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable addSAVComment error ${res.status}: ${text}`)
  }
}
