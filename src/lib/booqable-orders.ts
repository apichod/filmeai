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
  product_group_id?: string      // UUID Booqable du product_group (disponible via boomerang)
  stock_item_id?: string         // UUID de l'exemplaire assigné
  stock_item_identifier?: string // ex: "camera-sony-fx3-nue-id-2"
  planning_id?: string           // UUID du planning — pour matching stock_item_plannings
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

/** Formate une date ISO en format Booqable (UTC) */
function bqDate(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
}

/** Formate "maintenant" en heure de Paris au format Booqable.
 *  Booqable affiche les heures en UTC — on envoie l'heure locale Paris
 *  pour que l'affichage Booqable corresponde à l'heure française. */
function bqDateParis(date: Date): string {
  // sv-SE produit "YYYY-MM-DD HH:MM:SS" directement dans le timezone voulu
  const local = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(date)
  return local + ' UTC'
}

function today(): Date { return new Date() }
/** Dernier jour de l'année en cours à 23h45 (date de fin des commandes de retour) */
function endOfYear(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), 11, 31, 23, 45, 0) // 31 déc à 23:45 heure locale
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
    // customer_id : attribut direct → relationships → id du customer inclus
    customer_id: String(
      orderData.attributes.customer_id ||
      (orderData.relationships?.customer as { data?: { id?: string } })?.data?.id ||
      customerIncluded?.id ||
      ''
    ),
    customer: customerIncluded ? {
      id: customerIncluded.id,
      name: String(customerIncluded.attributes.name ?? ''),
      email: String(customerIncluded.attributes.email ?? ''),
    } : null,
    tags: Array.isArray(orderData.attributes.tag_list) ? orderData.attributes.tag_list as string[] : [],
    lines: [],
    properties_attributes: (orderData.attributes.properties ?? {}) as Record<string, string>,
  }
  // Étape 2 : récupérer toutes les lignes (top-level + sous-lignes de bundles)
  // filter[order_id] ne retourne que les lignes parent → 2ème passe pour les sous-lignes
  try {
    const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`
    type BoomNode = { type: string; id: string; attributes: Record<string, unknown>; relationships?: Record<string, unknown> }

    // ── Passe 1 : lignes top-level ───────────────────────────────────────────
    const res1 = await fetch(
      `${BASE_BOOMERANG}/lines?filter[order_id]=${order.id}&include=item,stock_item&page[size]=200`,
      { headers: headers(), signal: AbortSignal.timeout(12000) }
    )
    if (!res1.ok) throw new Error(`/lines pass1 error ${res1.status}`)
    const data1 = await res1.json() as { data?: BoomNode[]; included?: BoomNode[] }

    const topLines = data1.data || []
    const included1 = data1.included || []

    // Index depuis included passe 1
    const itemNameMap  = new Map<string, string>()
    const itemGroupMap = new Map<string, string>()
    const stockItemMap = new Map<string, string>()

    const indexIncluded = (inc: BoomNode[]) => {
      for (const r of inc) {
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
    }
    indexIncluded(included1)


    // Identifier les lignes bundle (extra_information contenant un pack-includes HTML, ou bundle_item_id absent mais sub-lignes existent)
    // On détecte les bundles : parent_line_id = null ET extra_information non vide → header de bundle
    const bundleHeaderIds: string[] = []
    for (const line of topLines) {
      const extraInfo = String(line.attributes.extra_information || '')
      const parentLineId = line.attributes.parent_line_id
      if (parentLineId === null && extraInfo.includes('pack-includes')) {
        bundleHeaderIds.push(line.id)
      }
    }

    // ── Passe 2 : sous-lignes de chaque bundle ───────────────────────────────
    let childLines: BoomNode[] = []
    if (bundleHeaderIds.length > 0) {
      const childFetches = await Promise.all(
        bundleHeaderIds.map(lineId =>
          fetch(
            `${BASE_BOOMERANG}/lines?filter[parent_line_id]=${lineId}&include=item,stock_item&page[size]=200`,
            { headers: headers(), signal: AbortSignal.timeout(12000) }
          ).then(r => r.ok ? r.json() as Promise<{ data?: BoomNode[]; included?: BoomNode[] }> : { data: [], included: [] })
        )
      )
      for (const res of childFetches) {
        childLines = childLines.concat(res.data || [])
        indexIncluded(res.included || [])
      }
    }

    // ── Construction des lignes finales ──────────────────────────────────────
    // top-level : garder uniquement les non-bundles avec qty > 0
    // sous-lignes : toutes incluses (qty peut être 0 pour les items gratuits dans un pack)
    const bundleHeaderIdSet = new Set(bundleHeaderIds)

    const buildLine = (r: BoomNode, isChild: boolean): BooqableOrderLine | null => {
      const attrs = r.attributes
      const qty = Number(attrs.quantity) || 0
      if (!isChild && qty <= 0) return null   // top-level à 0 → ignorer
      if (!isChild && attrs.parent_line_id != null) return null  // bundle child → géré en passe 2
      if (bundleHeaderIdSet.has(r.id)) return null  // header de bundle → ignorer

      type Rel = { data?: { type: string; id: string } | null }
      const rels = r.relationships as Record<string, Rel> | undefined
      const itemRel   = rels?.item?.data
      const itemRelId = itemRel?.id || String(attrs.item_id || '')
      const itemRelType = itemRel?.type || ''

      const isGroup = itemRelType === 'product_groups' || itemRelType === 'product_group'
      const productGroupId: string | undefined = isGroup ? itemRelId : (itemGroupMap.get(itemRelId) || undefined)

      const productName = String(
        attrs.title || attrs.description || attrs.name ||
        itemNameMap.get(itemRelId) || ''
      )
      if (!productName && !itemRelId) return null

      const displayQty = qty > 0 ? qty : (Number(attrs.quantity_each) || 1)

      const stockItemRel = rels?.stock_item?.data
      const stockItemId  = stockItemRel?.id || undefined
      const stockItemIdentifier = stockItemId ? stockItemMap.get(stockItemId) : undefined
      const planningId = String(attrs.planning_id || '') || undefined

      return { id: r.id, product_id: itemRelId, product_name: productName, quantity: displayQty, product_group_id: productGroupId, stock_item_id: stockItemId, stock_item_identifier: stockItemIdentifier, planning_id: planningId }
    }

    const lines: BooqableOrderLine[] = []
    for (const r of topLines) {
      const l = buildLine(r, false)
      if (l) lines.push(l)
    }
    for (const r of childLines) {
      const l = buildLine(r, true)
      if (l) lines.push(l)
    }

    if (lines.length > 0) order.lines = lines
  } catch (e) {
    console.warn('fetchOrderByNumber: boomerang enrichment failed, lines may be empty:', e)
  }

  // ── Passe 3 : stock_item_identifier via /api/4/stock_item_plannings ──────────
  // planning_id et stock_item_id sont des ATTRIBUTS directs (pas des relationships).
  // On match en priorité par planning_id (exact), sinon par product_group_id (fallback).
  for (const _l of (order.lines || [])) {
    console.log(`[pass3-pre] line id=${_l.id} pg=${_l.product_group_id ?? 'NULL'} si=${_l.stock_item_identifier ?? 'NULL'} plan=${_l.planning_id ?? 'NULL'}`)
  }
  // Trigger pass3 si certaines lignes n'ont pas de stock_item_identifier OU si qty>1 (expansion)
  if ((order.lines || []).some(l => (l.product_group_id || l.planning_id) && (!l.stock_item_identifier || l.quantity > 1))) {
    try {
      type SIPNode = { id: string; type: string; attributes: Record<string, unknown> }
      const sipUrl = `${BASE4}/stock_item_plannings?filter[order_id]=${order.id}&include=stock_item&page[size]=200`
      console.log('[pass3] fetching:', sipUrl)
      const sipRes = await fetch(sipUrl, { headers: headers(), signal: AbortSignal.timeout(10000) })
      console.log('[pass3] status:', sipRes.status)
      if (sipRes.ok) {
        const sipData = await sipRes.json() as { data?: SIPNode[]; included?: SIPNode[] }
        console.log('[pass3] sips count:', sipData.data?.length, '| included count:', sipData.included?.length)
        console.log('[pass3] first sip attrs:', JSON.stringify(sipData.data?.[0]?.attributes))
        console.log('[pass3] first included:', JSON.stringify(sipData.included?.[0]?.attributes))

        // Index stock_items from included: id → node
        const siMap = new Map<string, SIPNode>()
        for (const r of sipData.included || []) {
          if (r.type === 'stock_items') siMap.set(r.id, r)
        }

        // Build maps from sips :
        //   planToSIs : planning_id → [{ ident, siId }, ...]  (MULTI-value — pour expansion qty>1)
        //   pgToSI    : product_group_id → [{ ident, siId }]  (fallback si pgId disponible)
        type SIInfo = { ident: string; siId: string; pgId: string }
        const planToSIs = new Map<string, SIInfo[]>()
        const pgToSI    = new Map<string, SIInfo[]>()

        for (const sip of sipData.data || []) {
          const planId = String(sip.attributes.planning_id   || '')
          const siId   = String(sip.attributes.stock_item_id || '')
          if (!siId) continue
          const si = siMap.get(siId)
          if (!si) continue
          const ident = String(si.attributes.identifier || '')
          const pgId  = String(si.attributes.product_group_id || '')
          if (planId) {
            const list = planToSIs.get(planId) || []
            if (!list.find(x => x.siId === siId)) list.push({ ident, siId, pgId })
            planToSIs.set(planId, list)
          }
          if (pgId) {
            const list = pgToSI.get(pgId) || []
            if (!list.find(x => x.siId === siId)) list.push({ ident, siId, pgId })
            pgToSI.set(pgId, list)
          }
        }

        // Enrich lines qty=1 sans stock_item_identifier
        for (const line of order.lines || []) {
          if (line.stock_item_identifier) continue
          let info: SIInfo | undefined
          if (line.planning_id) info = (planToSIs.get(line.planning_id) || [])[0]
          if (!info && line.product_group_id) info = pgToSI.get(line.product_group_id)?.[0]
          if (info && info.ident) {
            line.stock_item_identifier = info.ident
            if (!line.stock_item_id)      line.stock_item_id      = info.siId
            if (!line.product_group_id)   line.product_group_id   = info.pgId
          }
        }

        // Expansion des lignes qty>1 — priorité planning_id, fallback pgId
        const expandedLines: BooqableOrderLine[] = []
        for (const line of order.lines || []) {
          if (line.quantity <= 1) { expandedLines.push(line); continue }
          // Récupérer la liste de SIs disponibles pour cette ligne
          let siList: SIInfo[] = []
          if (line.planning_id) siList = planToSIs.get(line.planning_id) || []
          if (siList.length !== line.quantity && line.product_group_id) {
            siList = pgToSI.get(line.product_group_id) || []
          }
          console.log(`[pass3-expand] line ${line.id} qty=${line.quantity} siList.length=${siList.length}`)
          if (siList.length !== line.quantity) {
            expandedLines.push(line)
            continue
          }
          for (const si of siList) {
            expandedLines.push({ ...line, id: `${line.id}__${si.siId}`, quantity: 1, stock_item_id: si.siId, stock_item_identifier: si.ident })
          }
        }
        order.lines = expandedLines
      } else {
        const errText = await sipRes.text()
        console.warn('[pass3] error response:', errText.slice(0, 200))
      }
    } catch (e) {
      console.warn('fetchOrderByNumber: stock_item_plannings pass failed:', e)
    }
  }

  return order
}

// ── Fetch order by UUID ───────────────────────────────────────────────────────
// Utilisé par le workflow executor pour les steps 'code' qui ont déjà le UUID en mémoire

export async function fetchOrderById(orderId: string): Promise<BooqableOrder | null> {
  const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`
  const res = await fetch(
    `${BASE_BOOMERANG}/orders?filter[id]=${encodeURIComponent(orderId)}&include=customer&per=1`,
    { headers: headers(), signal: AbortSignal.timeout(10000) }
  )
  if (!res.ok) throw new Error(`Booqable fetchOrderById error: ${res.status}`)
  const data = await res.json() as {
    data?: Array<{ id: string; attributes: Record<string, unknown>; relationships?: Record<string, unknown> }>
    included?: Array<{ type: string; id: string; attributes: Record<string, unknown> }>
  }
  const orderData = data.data?.[0]
  if (!orderData) return null

  // Réutilise le même mapping que fetchOrderByNumber
  const customerIncluded = (data.included || []).find(
    r => r.type === 'customers' &&
      r.id === (orderData.relationships?.customer as { data?: { id?: string } })?.data?.id
  )
  const order: BooqableOrder = {
    id:        orderData.id,
    number:    String(orderData.attributes.number ?? ''),
    status:    String(orderData.attributes.status ?? ''),
    starts_at: String(orderData.attributes.starts_at ?? ''),
    stops_at:  String(orderData.attributes.stops_at ?? ''),
    customer_id: String(
      orderData.attributes.customer_id ||
      (orderData.relationships?.customer as { data?: { id?: string } })?.data?.id ||
      customerIncluded?.id || ''
    ),
    customer: customerIncluded ? {
      id:    customerIncluded.id,
      name:  String(customerIncluded.attributes.name ?? ''),
      email: String(customerIncluded.attributes.email ?? ''),
    } : null,
    tags:  Array.isArray(orderData.attributes.tag_list) ? orderData.attributes.tag_list as string[] : [],
    lines: [],
    properties_attributes: (orderData.attributes.properties ?? {}) as Record<string, string>,
  }

  // Lignes (même logique que fetchOrderByNumber)
  try {
    type BoomNode = { type: string; id: string; attributes: Record<string, unknown>; relationships?: Record<string, unknown> }
    const linesRes = await fetch(
      `${BASE_BOOMERANG}/lines?filter[order_id]=${order.id}&include=item,stock_item&page[size]=200`,
      { headers: headers(), signal: AbortSignal.timeout(12000) }
    )
    if (linesRes.ok) {
      const linesData = await linesRes.json() as { data?: BoomNode[]; included?: BoomNode[] }
      const included = linesData.included || []
      const itemNameMap  = new Map<string, string>()
      const itemGroupMap = new Map<string, string>()
      const stockItemMap = new Map<string, string>()
      for (const r of included) {
        const name = String(r.attributes.name || r.attributes.display_name || '')
        if (r.type === 'products' || r.type === 'product') {
          itemNameMap.set(r.id, name)
          const pgId = String(r.attributes.product_group_id || '')
          if (pgId) itemGroupMap.set(r.id, pgId)
        }
        if (r.type === 'product_groups' || r.type === 'product_group') itemNameMap.set(r.id, name)
        if (r.type === 'stock_items' || r.type === 'stock_item') stockItemMap.set(r.id, String(r.attributes.identifier || ''))
      }
      order.lines = (linesData.data || [])
        .filter(line => {
          // Exclure les bundle headers (conteneurs sans article physique)
          const parentId  = line.attributes.parent_line_id
          const extraInfo = String(line.attributes.extra_information || '')
          if (parentId === null && extraInfo.includes('pack-includes')) return false
          return true
        })
        .map(line => {
          const itemRelId  = (line.relationships?.item         as { data?: { id?: string } })?.data?.id ?? ''
          const stockRelId = (line.relationships?.stock_item   as { data?: { id?: string } })?.data?.id ?? ''
          return {
            id:               line.id,
            product_id:       itemRelId,
            product_name:     itemNameMap.get(itemRelId) || String(line.attributes.title || ''),
            product_group_id: itemGroupMap.get(itemRelId) || '',
            stock_item_id:    stockRelId || '',
            stock_item_identifier: stockItemMap.get(stockRelId) || '',
            quantity:         Number(line.attributes.quantity ?? 1),
            price_in_cents:   Number(line.attributes.price_in_cents ?? 0),
            planning_id:      String(line.attributes.planning_id || '') || undefined,
          }
        })
    }
  } catch (e) {
    console.warn('fetchOrderById: lines fetch failed:', e)
  }

  // Pass 3 : stock_item_plannings → expansion des lignes qty>1
  if ((order.lines || []).some(l => l.quantity > 1)) {
    try {
      type SIPNode2 = { id: string; type: string; attributes: Record<string, unknown> }
      const sipRes2 = await fetch(
        `${BASE4}/stock_item_plannings?filter[order_id]=${order.id}&include=stock_item&page[size]=200`,
        { headers: headers(), signal: AbortSignal.timeout(10000) }
      )
      if (sipRes2.ok) {
        const sipData2 = await sipRes2.json() as { data?: SIPNode2[]; included?: SIPNode2[] }
        const siMap2 = new Map<string, SIPNode2>()
        for (const r of sipData2.included || []) {
          if (r.type === 'stock_items') siMap2.set(r.id, r)
        }
        type SIInfo2 = { ident: string; siId: string; pgId: string }
        const planToSIs2 = new Map<string, SIInfo2[]>()
        const pgToSI2    = new Map<string, SIInfo2[]>()
        for (const sip of sipData2.data || []) {
          const planId = String(sip.attributes.planning_id   || '')
          const siId   = String(sip.attributes.stock_item_id || '')
          if (!siId) continue
          const si = siMap2.get(siId)
          if (!si) continue
          const ident = String(si.attributes.identifier || '')
          const pgId  = String(si.attributes.product_group_id || '')
          if (planId) {
            const list = planToSIs2.get(planId) || []
            if (!list.find(x => x.siId === siId)) list.push({ ident, siId, pgId })
            planToSIs2.set(planId, list)
          }
          if (pgId) {
            const list = pgToSI2.get(pgId) || []
            if (!list.find(x => x.siId === siId)) list.push({ ident, siId, pgId })
            pgToSI2.set(pgId, list)
          }
        }
        const expandedLines2: BooqableOrderLine[] = []
        for (const line of order.lines || []) {
          if (line.quantity <= 1) { expandedLines2.push(line); continue }
          let siList: SIInfo2[] = []
          if (line.planning_id) siList = planToSIs2.get(line.planning_id) || []
          if (siList.length !== line.quantity && line.product_group_id) siList = pgToSI2.get(line.product_group_id) || []
          if (siList.length !== line.quantity) { expandedLines2.push(line); continue }
          for (const si of siList) {
            expandedLines2.push({ ...line, id: `${line.id}__${si.siId}`, quantity: 1, stock_item_id: si.siId, stock_item_identifier: si.ident, product_group_id: si.pgId || line.product_group_id })
          }
        }
        order.lines = expandedLines2
      }
    } catch (e) {
      console.warn('fetchOrderById: stock_item_plannings expansion failed:', e)
    }
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
  const { customerId } = params

  const subdomain = process.env.BOOQABLE_SUBDOMAIN
  const key = process.env.BOOQABLE_API_KEY
  const startsAt = bqDate(today())
  const stopsAt  = bqDate(endOfYear()) // toujours 31 déc à 23h45

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
 * Démarre une commande (pickup).
 * Approche 1 : start_stock_items via order_fulfillments (items trackables).
 * Approche 2 : order_transitions reserved→started (items bulk / fallback).
 * Non bloquant : retourne l'erreur sans throw.
 */
export async function startSAVOrder(orderId: string): Promise<{ error?: string }> {
  const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`
  type SIPNode = { id: string; type: string; attributes: Record<string, unknown> }

  // ── Approche 1 : order_fulfillments (trackable + bulk) ────────────────────
  try {
    // Passe A : stock_item_plannings → actions start_stock_items (produits trackables)
    const sipRes = await fetch(
      `${BASE4}/stock_item_plannings?filter[order_id]=${orderId}&include=stock_item&page[size]=200`,
      { headers: headers(), signal: AbortSignal.timeout(10000) }
    )

    type PlanGroup = { productId: string; siIds: string[] }
    const planGroups    = new Map<string, PlanGroup>()   // trackable
    const coveredPlanIds = new Set<string>()              // plan IDs déjà traités
    let sipAllStarted   = true

    if (sipRes.ok) {
      const sipData = await sipRes.json() as { data?: SIPNode[]; included?: SIPNode[] }
      const siMap   = new Map<string, SIPNode>()
      for (const r of sipData.included || []) {
        if (r.type === 'stock_items') siMap.set(r.id, r)
      }
      for (const sip of sipData.data || []) {
        if (sip.attributes.started) continue
        sipAllStarted = false
        const planId    = String(sip.attributes.planning_id   || '')
        const siId      = String(sip.attributes.stock_item_id || '')
        if (!planId || !siId) continue
        coveredPlanIds.add(planId)
        const si        = siMap.get(siId)
        const productId = String(si?.attributes.product_id || '')
        if (!productId) continue
        const g = planGroups.get(planId) || { productId, siIds: [] }
        g.siIds.push(siId)
        planGroups.set(planId, g)
      }
      if (sipAllStarted && (sipData.data || []).length > 0) {
        console.log(`startSAVOrder: order ${orderId} — tous SIPs déjà started, ok`)
        // Ne pas retourner ici : il peut rester des produits bulk à démarrer
      }
    }

    // Passe B : plannings → actions start_products (bulk / no_tracking non couverts)
    const bulkActions: Array<Record<string, unknown>> = []
    try {
      // Toutes les plannings non couvertes par les SIPs → start_products (bulk, no_tracking, etc.)
      // On ne filtre PAS par tracking type : `include=product` ne retourne pas cette info fiablement
      const planRes = await fetch(
        `${BASE4}/plannings?filter[order_id]=${orderId}&page[size]=200`,
        { headers: headers(), signal: AbortSignal.timeout(10000) }
      )
      if (planRes.ok) {
        const planData = await planRes.json() as { data?: SIPNode[] }
        console.log(`[startSAVOrder] plannings count: ${(planData.data || []).length}, coveredPlanIds: ${coveredPlanIds.size}`)
        for (const plan of planData.data || []) {
          const planId    = plan.id
          const productId = String(plan.attributes.product_id || '')
          if (!productId || coveredPlanIds.has(planId)) continue
          const qty = Number(plan.attributes.quantity) || 1
          console.log(`[startSAVOrder] bulk plan: planning_id=${planId} product_id=${productId} qty=${qty}`)
          bulkActions.push({
            action: 'start_products', planning_id: planId, product_id: productId, quantity: qty,
          })
        }
      } else {
        console.warn(`[startSAVOrder] plannings fetch failed: ${planRes.status}`)
      }
    } catch (e) {
      console.warn('[startSAVOrder] plannings fetch error:', e)
    }

    const trackableActions: Array<Record<string, unknown>> = Array.from(planGroups.entries()).map(([planId, g]) => ({
      action: 'start_stock_items', planning_id: planId, product_id: g.productId, stock_item_ids: g.siIds,
    }))
    const actions = [...trackableActions, ...bulkActions]

    if (actions.length > 0) {
      console.log(`startSAVOrder: ${actions.length} action(s) pour ${orderId}:`, JSON.stringify(actions))
      const fulfillRes = await fetch(`${BASE4}/order_fulfillments`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          data: { type: 'order_fulfillments', attributes: { order_id: orderId, confirm_shortage: true, actions } },
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (fulfillRes.ok) {
        console.log(`startSAVOrder: order ${orderId} started (trackable+bulk) ✓`)
        return {}
      }
      const errText = await fulfillRes.text()
      console.warn('[startSAVOrder] start_stock_items+start_products failed:', fulfillRes.status, errText.slice(0, 300))
    } else if (sipAllStarted) {
      // Rien à démarrer
      return {}
    }
  } catch (e) {
    console.warn('[startSAVOrder] fulfillments approach error:', e)
  }

  // ── Approche 2 : order_transitions ─────────────────────────────────────────
  const tryTransition = async (from: string, to: string): Promise<boolean> => {
    const res = await fetch(`${BASE_BOOMERANG}/order_transitions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        data: {
          type: 'order_transitions',
          attributes: {
            order_id:         orderId,
            transition_from:  from,
            transition_to:    to,
            confirm_shortage: true,
            revert_until:     null,
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) return true
    const text = await res.text()
    console.warn(`[startSAVOrder] ${from}→${to} failed (${res.status}): ${text}`)
    return false
  }

  try {
    if (await tryTransition('reserved', 'started')) {
      console.log(`startSAVOrder: order ${orderId} started via reserved→started ✓`)
      return {}
    }
    if (await tryTransition('concept', 'reserved')) {
      if (await tryTransition('reserved', 'started')) {
        console.log(`startSAVOrder: order ${orderId} started via concept→reserved→started ✓`)
        return {}
      }
    }

    // Vérifier si déjà started
    try {
      const checkRes = await fetch(`${BASE4}/orders/${orderId}?fields[orders]=status`, {
        headers: headers(), signal: AbortSignal.timeout(6000),
      })
      if (checkRes.ok) {
        const d = await checkRes.json() as { data?: { attributes?: { status?: string } } }
        if (d.data?.attributes?.status === 'started') {
          console.log(`startSAVOrder: order ${orderId} déjà started`)
          return {}
        }
      }
    } catch { /* ignore */ }

    return { error: 'Impossible de démarrer la commande (transitions échouées)' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[startSAVOrder] error:', msg)
    return { error: msg }
  }
}

// ── Add tag ────────────────────────────────────────────────────────────────────

/**
 * Ajoute un tag à une order existante (conserve les tags existants).
 * GET retourne `tags`, PUT accepte `tag_list` (array).
 */
export async function addTagToOrder(
  orderId: string,
  tags: string | string[],
  tagsToRemove?: string[]
): Promise<void> {
  const newTags  = (Array.isArray(tags) ? tags : [tags]).map(t => t.toLowerCase())
  const toRemove = (tagsToRemove || []).map(t => t.toLowerCase())

  const getRes = await fetch(`${BASE}/orders/${orderId}`, {
    headers: headers(),
    signal: AbortSignal.timeout(10000),
  })
  if (!getRes.ok) throw new Error(`Booqable getOrder error: ${getRes.status}`)

  const getData = await getRes.json() as { order?: BooqableOrder }
  const existingTags = getData.order?.tags || []

  const merged = Array.from(new Set([...existingTags, ...newTags]))
    .filter(t => !toRemove.includes(t))

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
          { name: 'Order SAV', identifier: 'order_sav', value: originalOrderNumber },
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

  // boomerang products endpoint (fallback final)
  try {
    const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`
    const res = await fetch(
      `${BASE_BOOMERANG}/products?filter[product_group_id]=${productGroupId}&page[number]=1&page[size]=1`,
      { headers: headers(), signal: AbortSignal.timeout(8000) }
    )
    if (res.ok) {
      const data = await res.json() as { data?: Array<{ id: string }> }
      if (data.data?.[0]?.id) return data.data[0].id
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
              confirm_shortage: true,
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
            confirm_shortage: true,
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

// ── duplicateOrder ────────────────────────────────────────────────────────────
// Duplique une commande Booqable via l'API boomerang order_duplications.
// Retourne l'ID et le numéro de la nouvelle commande.
export async function duplicateOrder(orderId: string): Promise<{ newOrderId: string; newOrderNumber: string }> {
  const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`
  const res = await fetch(`${BASE_BOOMERANG}/order_duplications`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: 'order_duplications',
        attributes: {
          original_order_id:    orderId,
          dates:                true,
          properties:           true,
          discount:             true,
          custom_lines:         true,
          customer:             true,
          stock_item_plannings: true,
          tags:                 true,
          deposit:              'current',
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const text = await res.text()
    console.log(`[duplicateOrder] FAILED ${res.status} orderId=${orderId}: ${text}`)
    throw new Error(`Booqable duplicateOrder error ${res.status}: ${text}`)
  }
  const data = await res.json() as Record<string, unknown>
  console.log(`[duplicateOrder] response:`, JSON.stringify(data).slice(0, 500))
  // Extraire le new_order_id depuis la réponse (format à confirmer via log)
  const attrs = (data.data as Record<string, unknown> | undefined)?.attributes as Record<string, unknown> | undefined
  const newOrderId     = String(attrs?.new_order_id     || attrs?.order_id     || '')
  const newOrderNumber = String(attrs?.new_order_number || attrs?.order_number || '')
  if (!newOrderId) throw new Error('Booqable duplicateOrder : new_order_id absent de la réponse')
  return { newOrderId, newOrderNumber }
}

// ── clearTags ────────────────────────────────────────────────────────────────
// Supprime tous les tags d'une commande.
export async function clearTags(orderId: string): Promise<void> {
  const res = await fetch(`${BASE4}/orders/${orderId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({
      data: {
        id:   orderId,
        type: 'orders',
        attributes: { tag_list: [] },
      },
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable clearTags error ${res.status}: ${text}`)
  }
}

// ── revertToConcept ───────────────────────────────────────────────────────────
// Repasse une commande en état "draft" (concept) depuis n'importe quel état.
// Endpoint : POST /api/boomerang/order_status_transitions avec revert: true
export async function revertToConcept(orderId: string): Promise<void> {
  const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`

  const tryRevert = async (from: string): Promise<boolean> => {
    const res = await fetch(`${BASE_BOOMERANG}/order_status_transitions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        data: {
          type: 'order_status_transitions',
          attributes: { order_id: orderId, transition_from: from, transition_to: 'draft', revert: true },
        },
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      const text = await res.text()
      console.log(`[revertToConcept] ${from}→draft FAILED ${res.status}: ${text.slice(0, 300)}`)
    } else {
      console.log(`[revertToConcept] ${from}→draft OK`)
    }
    return res.ok
  }

  // Essayer depuis chaque état possible
  if (await tryRevert('reserved')) return
  if (await tryRevert('started'))  return
  if (await tryRevert('stopped'))  return

  // Pour items trackables : stopOrder d'abord → stopped → draft
  console.log('[revertToConcept] tentative via stopOrder (items trackables)')
  try {
    await stopOrder(orderId)
    console.log('[revertToConcept] stopOrder OK, tentative stopped→draft')
    if (await tryRevert('stopped')) return
  } catch (e) {
    console.log('[revertToConcept] stopOrder failed:', String(e))
  }
  throw new Error(`Booqable revertToConcept: impossible de passer la commande ${orderId} en draft`)
}

// ── reserveOrder ─────────────────────────────────────────────────────────────
// Vérifie l'état courant d'abord. Si déjà reserved/started/stopped → no-op.
// Si concept → tente concept→reserved via order_transitions.
export async function reserveOrder(orderId: string): Promise<{ error?: string }> {
  const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`

  // Étape 1 : récupérer l'état courant (utilise BASE4 comme stopOrder — plus fiable)
  try {
    const checkRes = await fetch(`${BASE4}/orders/${orderId}?fields[orders]=status`, {
      headers: headers(), signal: AbortSignal.timeout(8000),
    })
    if (checkRes.ok) {
      const checkData = await checkRes.json() as { data?: { attributes?: { status?: string } } }
      const status = checkData.data?.attributes?.status ?? ''
      console.log(`[reserveOrder] statut actuel : ${status}`)

      // Déjà dans un état post-concept → rien à faire
      if (['reserved', 'started', 'stopped'].includes(status)) {
        console.log(`[reserveOrder] commande déjà en ${status}, skip`)
        return {}
      }

      // Booqable v4 API retourne "draft" pour l'état concept/draft → les deux sont OK pour la transition
      const isConceptState = !status || status === 'concept' || status === 'draft'
      if (!isConceptState) {
        return { error: `Impossible de réserver la commande (état actuel : ${status})` }
      }
      console.log(`[reserveOrder] commande en ${status || 'inconnu'}, tentative concept→reserved`)
    }
  } catch (e) {
    console.warn('[reserveOrder] vérification état initiale échouée :', e)
    // On tente quand même la transition si la vérification échoue
  }

  // Étape 2 : tenter concept → reserved
  const res = await fetch(`${BASE_BOOMERANG}/order_transitions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: 'order_transitions',
        attributes: {
          order_id:         orderId,
          transition_from:  'concept',
          transition_to:    'reserved',
          confirm_shortage: true,
          revert_until:     null,
        },
      },
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (res.ok) {
    console.log(`[reserveOrder] commande ${orderId} réservée ✓`)
    return {}
  }

  const errText = await res.text()
  console.warn(`[reserveOrder] concept→reserved failed (${res.status}): ${errText}`)

  // Vérification finale : Booqable peut retourner 404 même si la transition aboutit
  // → on attend 1s pour laisser le temps à Booqable de mettre à jour le statut
  await new Promise(resolve => setTimeout(resolve, 1000))
  try {
    const recheck = await fetch(`${BASE4}/orders/${orderId}?fields[orders]=status`, {
      headers: headers(), signal: AbortSignal.timeout(6000),
    })
    if (recheck.ok) {
      const d = await recheck.json() as { data?: { attributes?: { status?: string } } }
      const s = d.data?.attributes?.status ?? ''
      if (s && s !== 'concept' && s !== 'draft') {
        console.log(`[reserveOrder] commande finalement en "${s}" après 404 Booqable — ok`)
        return {}
      }
    }
  } catch { /* ignore */ }

  return { error: `Impossible de réserver la commande (transition concept→reserved refusée, statut ${res.status})` }
}

// ── cancelOrder ──────────────────────────────────────────────────────────────
// Annule une commande (tente : started→stopped→concept→canceled ou reserved→concept→canceled).
export async function cancelOrder(orderId: string): Promise<void> {
  const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`

  const tryTransition = async (from: string, to: string): Promise<boolean> => {
    const res = await fetch(`${BASE_BOOMERANG}/order_transitions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        data: {
          type: 'order_transitions',
          attributes: { order_id: orderId, transition_from: from, transition_to: to, confirm_shortage: false, revert_until: null },
        },
      }),
      signal: AbortSignal.timeout(10000),
    })
    return res.ok
  }

  // Essaie les chemins possibles selon l'état courant
  await tryTransition('started',  'stopped')
  await tryTransition('reserved', 'concept')
  await tryTransition('stopped',  'concept')
  const ok = await tryTransition('concept',  'canceled')
  if (!ok) throw new Error(`Booqable cancelOrder: impossible d'annuler la commande ${orderId}`)
}

// ── setLineQuantity ───────────────────────────────────────────────────────────
// Réduit la quantité d'une ligne existante (pour les lignes multi-unités partiellement conservées).
export async function setLineQuantity(lineId: string, qty: number): Promise<void> {
  const BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/1`
  const key  = process.env.BOOQABLE_API_KEY!
  const res = await fetch(`${BASE}/lines/${lineId}?api_key=${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ line: { quantity: qty } }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable setLineQuantity error ${res.status}: ${text}`)
  }
}

// ── removeProductLine ─────────────────────────────────────────────────────────
// Supprime une ligne d'une commande par son ID de ligne.
export async function removeProductLine(lineId: string): Promise<void> {
  const res = await fetch(`${BASE4}/lines/${lineId}`, {
    method: 'DELETE',
    headers: headers(),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`Booqable removeProductLine error ${res.status}: ${text}`)
  }
}

// ── updateOrderReturnDate ─────────────────────────────────────────────────────
// Change la date de retour (stops_at) d'une commande à l'heure exacte du retour.
export async function updateOrderReturnDate(orderId: string): Promise<void> {
  const now = new Date()
  const stopsAt = bqDateParis(now)
  console.log(`[updateReturnDate] orderId=${orderId} stopsAt="${stopsAt}" (iso="${now.toISOString()}")`)

  const res = await fetch(`${BASE4}/orders/${orderId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({
      data: {
        id:   orderId,
        type: 'orders',
        attributes: { stops_at: stopsAt },
      },
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[updateReturnDate] FAILED ${res.status}: ${text.slice(0, 300)}`)
    throw new Error(`Booqable updateReturnDate error ${res.status}: ${text}`)
  }

  // Log la réponse pour vérifier ce que Booqable a effectivement enregistré
  try {
    const data = await res.json() as { data?: { attributes?: { stops_at?: string } } }
    console.log(`[updateReturnDate] OK — stops_at enregistré par Booqable: "${data.data?.attributes?.stops_at}"`)
  } catch { /* ignore */ }
}

// ── stopOrder ────────────────────────────────────────────────────────────────
// Retourne le matériel d'une commande dans Booqable.
// Pour les items trackables : stop_stock_items via order_fulfillments.
// Fallback : order_transitions (items bulk / commandes sans stock_item_plannings actifs).
export async function stopOrder(orderId: string): Promise<void> {
  type SIPNode = { id: string; type: string; attributes: Record<string, unknown> }

  // ── Mise à jour stops_at à l'heure exacte du retour (avant le stop) ────────
  try {
    const nowStr = bqDateParis(new Date())
    console.log(`[stopOrder] PUT stops_at="${nowStr}" sur order ${orderId}`)
    const dateRes = await fetch(`${BASE4}/orders/${orderId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({
        data: { id: orderId, type: 'orders', attributes: { stops_at: nowStr } },
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (dateRes.ok) {
      const d = await dateRes.json() as { data?: { attributes?: { stops_at?: string } } }
      console.log(`[stopOrder] stops_at enregistré: "${d.data?.attributes?.stops_at}"`)
    } else {
      console.warn(`[stopOrder] PUT stops_at failed: ${dateRes.status}`)
    }
  } catch (e) { console.warn('[stopOrder] PUT stops_at error:', e) }

  // ── Approche 1 : stop via order_fulfillments (items trackables) ─────────────
  // Phase A : start_stock_items pour les SIPs reserved-but-not-started
  // Phase B : stop_stock_items pour tous les SIPs non-stopped
  try {
    const sipRes = await fetch(
      `${BASE4}/stock_item_plannings?filter[order_id]=${orderId}&include=stock_item&page[size]=200`,
      { headers: headers(), signal: AbortSignal.timeout(10000) }
    )
    if (sipRes.ok) {
      const sipData = await sipRes.json() as { data?: SIPNode[]; included?: SIPNode[] }

      const siMap = new Map<string, SIPNode>()
      for (const r of sipData.included || []) {
        if (r.type === 'stock_items') siMap.set(r.id, r)
      }

      type Group = { productId: string; siIds: string[] }
      const startGroups = new Map<string, Group>()  // SIPs reserved-not-started → à démarrer d'abord
      const stopGroups  = new Map<string, Group>()  // tous SIPs non-stopped → à stopper

      for (const sip of sipData.data || []) {
        if (sip.attributes.stopped) continue
        const planId    = String(sip.attributes.planning_id   || '')
        const siId      = String(sip.attributes.stock_item_id || '')
        if (!planId || !siId) continue
        const si        = siMap.get(siId)
        const productId = String(si?.attributes.product_id    || '')
        if (!productId) continue

        if (!sip.attributes.started) {
          // Reserved mais pas started → à démarrer d'abord (Booqable rejette stop sans start)
          const g = startGroups.get(planId) || { productId, siIds: [] }
          g.siIds.push(siId)
          startGroups.set(planId, g)
        }
        const g2 = stopGroups.get(planId) || { productId, siIds: [] }
        if (!g2.siIds.includes(siId)) g2.siIds.push(siId)
        stopGroups.set(planId, g2)
      }

      // Phase A : start_stock_items (non bloquant — continue même si échoue)
      if (startGroups.size > 0) {
        const startActions: Array<Record<string, unknown>> = Array.from(startGroups.entries()).map(([planId, g]) => ({
          action: 'start_stock_items', planning_id: planId, product_id: g.productId, stock_item_ids: g.siIds,
        }))
        const startRes = await fetch(`${BASE4}/order_fulfillments`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            data: { type: 'order_fulfillments', attributes: { order_id: orderId, confirm_shortage: true, actions: startActions } },
          }),
          signal: AbortSignal.timeout(15000),
        }).catch(e => { console.warn('[stopOrder] start_stock_items error:', e); return null })
        if (startRes && !startRes.ok) {
          const errText = await startRes.text()
          console.warn('[stopOrder] start_stock_items failed:', startRes.status, errText.slice(0, 200))
        }
      }

      // Phase B : stop_stock_items
      // Note : stops_at est déjà fixé via le PUT sur l'order juste avant — on ne le répète pas ici
      if (stopGroups.size > 0) {
        console.log(`[stopOrder] phase B stop_stock_items (${stopGroups.size} planning(s))`)
        const stopActions: Array<Record<string, unknown>> = Array.from(stopGroups.entries()).map(([planId, g]) => ({
          action: 'stop_stock_items', planning_id: planId, product_id: g.productId, stock_item_ids: g.siIds,
        }))
        const fulfillRes = await fetch(`${BASE4}/order_fulfillments`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            data: { type: 'order_fulfillments', attributes: { order_id: orderId, actions: stopActions } },
          }),
          signal: AbortSignal.timeout(15000),
        })
        if (fulfillRes.ok) {
          // Log le stops_at effectivement enregistré
          try {
            const fd = await fulfillRes.json() as { data?: { attributes?: Record<string, unknown> } }
            console.log('[stopOrder] fulfillment OK attrs:', JSON.stringify(fd.data?.attributes ?? {}))
          } catch { /* ignore */ }
          return
        }
        const errText = await fulfillRes.text()
        console.warn('[stopOrder] stop_stock_items failed:', fulfillRes.status, errText.slice(0, 300))
      }
    }
  } catch (e) {
    console.warn('[stopOrder] fulfillments approach error:', e)
  }

  // ── Approche 2 : order_transitions (bulk items / fallback) ───────────────
  const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`

  const doTransition = async (from: string, to: string): Promise<boolean> => {
    const res = await fetch(`${BASE_BOOMERANG}/order_transitions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        data: {
          type: 'order_transitions',
          attributes: { order_id: orderId, transition_from: from, transition_to: to, confirm_shortage: true },
        },
      }),
      signal: AbortSignal.timeout(10000),
    })
    return res.ok
  }

  // Approche 2a : vérifier le statut courant et amener à 'started' si nécessaire
  // (concept → reserved → started → stopped)
  try {
    const statusRes = await fetch(`${BASE4}/orders/${orderId}?fields[orders]=status`, {
      headers: headers(), signal: AbortSignal.timeout(5000),
    })
    if (statusRes.ok) {
      const statusData = await statusRes.json() as { data?: { attributes?: { status?: string } } }
      const s = statusData.data?.attributes?.status ?? ''
      if (s === 'stopped') return   // déjà stopped — succès silencieux
      if (s === 'concept') {
        await doTransition('concept',  'reserved').catch(() => {})
        await doTransition('reserved', 'started').catch(() => {})
      } else if (s === 'reserved') {
        await doTransition('reserved', 'started').catch(() => {})
      }
    }
  } catch { /* ignore — on tente quand même les transitions stop */ }

  // Approche 2b : transitions stopped
  const tryTransition = async (from: string): Promise<{ ok: boolean; status: number; text: string }> => {
    const res = await fetch(`${BASE_BOOMERANG}/order_transitions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        data: {
          type: 'order_transitions',
          attributes: { order_id: orderId, transition_from: from, transition_to: 'stopped', confirm_shortage: true },
        },
      }),
      signal: AbortSignal.timeout(10000),
    })
    const text = res.ok ? '' : await res.text()
    return { ok: res.ok, status: res.status, text }
  }

  const r1 = await tryTransition('started')
  if (r1.ok) return
  const r2 = await tryTransition('reserved')
  if (r2.ok) return

  // ── Approche 3 : vérifier si finalement stopped ───────────────────────────
  try {
    const checkRes = await fetch(`${BASE4}/orders/${orderId}?fields[orders]=status`, {
      headers: headers(), signal: AbortSignal.timeout(8000),
    })
    if (checkRes.ok) {
      const data = await checkRes.json() as { data?: { attributes?: { status?: string } } }
      if (data.data?.attributes?.status === 'stopped') return
    }
  } catch { /* ignore */ }

  throw new Error(`Booqable stopOrder error ${r2.status}: ${r2.text}`)
}

// ── renderBooqableEmailTemplate ───────────────────────────────────────────────
// Appelle /api/boomerang/rendered_emails : Booqable résout toutes les {{variables}}
// côté serveur et retourne le subject + body finaux prêts à l'envoi.
export async function renderBooqableEmailTemplate(
  emailTemplateId: string,
  orderId: string,
): Promise<{ subject: string; body: string } | null> {
  const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`
  console.log(`[renderBooqableEmailTemplate] POST rendered_emails template=${emailTemplateId} order=${orderId}`)
  const res = await fetch(`${BASE_BOOMERANG}/rendered_emails`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: 'rendered_emails',
        attributes: {
          order_id:          orderId,
          email_template_id: emailTemplateId,
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
  })
  console.log(`[renderBooqableEmailTemplate] response status: ${res.status}`)
  if (!res.ok) {
    const text = await res.text()
    console.error(`[renderBooqableEmailTemplate] error body: ${text}`)
    return null
  }
  const data = await res.json() as { data?: { attributes?: { subject?: string; body?: string } } }
  const attrs = data.data?.attributes
  console.log(`[renderBooqableEmailTemplate] attrs found: ${!!attrs}, subject: ${attrs?.subject?.slice(0,50)}`)
  if (!attrs) return null
  return {
    subject: String(attrs.subject ?? ''),
    body:    String(attrs.body    ?? ''),
  }
}

// ── sendEmailViaBooqable ──────────────────────────────────────────────────────
// Envoie un email via Booqable (qui gère le destinataire depuis l'order et
// remplace les {{variables}} Booqable au moment de l'envoi).
export async function sendEmailViaBooqable(
  orderId: string,
  subject: string,
  body: string,
  recipientEmail: string,
): Promise<void> {
  const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`
  const res = await fetch(`${BASE_BOOMERANG}/emails`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: 'emails',
        attributes: {
          order_id:   orderId,
          subject,
          body,
          recipients: recipientEmail,
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Booqable sendEmail error ${res.status}: ${text}`)
  }
}
