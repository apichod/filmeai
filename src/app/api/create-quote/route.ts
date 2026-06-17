import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type QuoteItem = {
  type?: 'product' | 'custom_charge' | 'section'
  productId?: string
  quantity?: number
  name?: string
  title?: string
  requestedName?: string
  section?: string | null
  position?: number
}

type Customer = {
  name: string
  email?: string
  phone?: string
  booqableId?: string
}

type BooqableCustomerResponse = {
  customer?: { id: string }
  error?: unknown
  errors?: unknown
}

type BooqableOrderResponse = {
  order?: { id: string }
  error?: unknown
  errors?: unknown
}

type BooqableJsonResponse = {
  data?: { id: string }
  line?: { id: string }
  order_line?: { id: string }
  error?: unknown
  errors?: unknown
}

type AttemptResult = {
  ok: boolean
  id: string | null
  error?: string
}

function cleanTitle(value: string | undefined | null, fallback: string) {
  const title = String(value || '').trim()
  return title.length > 0 ? title : fallback
}

function quantityOf(item: QuoteItem) {
  return Math.max(1, Math.round(Number(item.quantity) || 1))
}

async function parseResponse(res: Response, context: string): Promise<BooqableJsonResponse> {
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

  return parsed as BooqableJsonResponse
}

async function postJson(url: string, body: unknown, headers: Record<string, string>, context: string): Promise<BooqableJsonResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  return parseResponse(res, context)
}

async function tryPostJson(url: string, body: unknown, headers: Record<string, string>, context: string): Promise<AttemptResult> {
  try {
    const json = await postJson(url, body, headers, context)
    if (json.error || json.errors) {
      return { ok: false, id: null, error: `${context}: ${JSON.stringify(json)}` }
    }
    return {
      ok: true,
      id: json.data?.id || json.line?.id || json.order_line?.id || null,
    }
  } catch (error) {
    return {
      ok: false,
      id: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
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

async function createV4LineWithFallbacks({
  orderId,
  item,
  position,
  lineKind,
}: {
  orderId: string
  item: QuoteItem
  position: number
  lineKind: 'section' | 'charge' | 'product'
}) {
  const BOOQABLE_V4_BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/4`
  const KEY = process.env.BOOQABLE_API_KEY
  const title = cleanTitle(
    item.title || item.name || item.requestedName,
    lineKind === 'section' ? 'Section' : 'Produit à vérifier'
  )
  const quantity = quantityOf(item)
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${KEY}`,
  }

  const commonAttributes: Record<string, string | number | boolean | null> = {
    title,
    name: title,
    quantity,
    position,
  }

  if (lineKind === 'section') {
    commonAttributes.line_type = 'section'
    commonAttributes.quantity = 1
  } else if (lineKind === 'charge') {
    commonAttributes.line_type = 'charge'
    commonAttributes.price_each_in_cents = 0
    commonAttributes.extra_information = lineNotes(item, 'Ligne custom créée par FilmeAI car la correspondance catalogue est incertaine. À vérifier et chiffrer dans Booqable.')
  } else {
    commonAttributes.line_type = 'product'
    commonAttributes.item_id = item.productId || null
    commonAttributes.item_type = 'product_groups'
    commonAttributes.product_group_id = item.productId || null
    commonAttributes.extra_information = lineNotes(item)
  }

  const attempts: Array<{ context: string; body: unknown }> = []

  // Shape 1: JSON:API with owner/item relationships.
  attempts.push({
    context: `Booqable v4 ${lineKind} line relationships`,
    body: {
      data: {
        type: 'lines',
        attributes: commonAttributes,
        relationships: {
          owner: { data: { type: 'orders', id: orderId } },
          ...(lineKind === 'product' && item.productId
            ? { item: { data: { type: 'product_groups', id: item.productId } } }
            : {}),
        },
      },
    },
  })

  // Shape 2: flat owner_id / owner_type attributes.
  attempts.push({
    context: `Booqable v4 ${lineKind} line flat plural`,
    body: {
      data: {
        type: 'lines',
        attributes: {
          ...commonAttributes,
          owner_id: orderId,
          owner_type: 'orders',
        },
      },
    },
  })

  // Shape 3: flat Rails-style casing sometimes used by Booqable internals.
  attempts.push({
    context: `Booqable v4 ${lineKind} line flat singular`,
    body: {
      data: {
        type: 'lines',
        attributes: {
          ...commonAttributes,
          owner_id: orderId,
          owner_type: 'Order',
          ...(lineKind === 'product' && item.productId
            ? { item_type: 'ProductGroup', product_group_id: item.productId }
            : {}),
        },
      },
    },
  })

  const errors: string[] = []
  for (const attempt of attempts) {
    const result = await tryPostJson(`${BOOQABLE_V4_BASE}/lines`, attempt.body, headers, attempt.context)
    if (result.ok) return result.id
    if (result.error) errors.push(result.error)
  }

  throw new Error(errors.join(' | '))
}

async function createV1ProductLineFallbacks({
  orderId,
  item,
  position,
}: {
  orderId: string
  item: QuoteItem
  position: number
}) {
  const BOOQABLE_BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/1`
  const KEY = process.env.BOOQABLE_API_KEY
  const headers = { 'Content-Type': 'application/json' }
  const body = {
    line: {
      order_id: orderId,
      item_id: item.productId,
      product_group_id: item.productId,
      quantity: quantityOf(item),
      position,
    },
  }
  const orderLineBody = {
    order_line: {
      order_id: orderId,
      item_id: item.productId,
      product_group_id: item.productId,
      quantity: quantityOf(item),
      position,
    },
  }

  const attempts = [
    { url: `${BOOQABLE_BASE}/lines?api_key=${KEY}`, body, context: 'Booqable v1 /lines' },
    { url: `${BOOQABLE_BASE}/orders/${orderId}/lines?api_key=${KEY}`, body, context: 'Booqable v1 /orders/:id/lines' },
    { url: `${BOOQABLE_BASE}/order_lines?api_key=${KEY}`, body: orderLineBody, context: 'Booqable v1 /order_lines' },
  ]

  const errors: string[] = []
  for (const attempt of attempts) {
    const result = await tryPostJson(attempt.url, attempt.body, headers, attempt.context)
    if (result.ok) return result.id
    if (result.error) errors.push(result.error)
  }
  throw new Error(errors.join(' | '))
}

async function createProductLineOrCustomFallback({
  orderId,
  item,
  position,
}: {
  orderId: string
  item: QuoteItem
  position: number
}) {
  const errors: string[] = []

  // First try the modern v4 lines endpoint with product_group relationship.
  try {
    return await createV4LineWithFallbacks({ orderId, item, position, lineKind: 'product' })
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }

  // Then try a few v1 line endpoints. Some Booqable accounts still expose these.
  try {
    return await createV1ProductLineFallbacks({ orderId, item, position })
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }

  // Final safety: do not block the quote. Create a custom charge line with the product name.
  // This preserves the quote order and lets you correct/chiffrer inside Booqable.
  return createV4LineWithFallbacks({
    orderId,
    position,
    lineKind: 'charge',
    item: {
      ...item,
      title: cleanTitle(item.name || item.requestedName, 'Produit à vérifier'),
      requestedName: item.requestedName || item.name,
      name: item.name,
      type: 'custom_charge',
      section: item.section,
    },
  }).catch(error => {
    const customError = error instanceof Error ? error.message : String(error)
    throw new Error(`Impossible de créer une ligne produit ni une ligne custom. Product attempts: ${errors.join(' || ')}. Custom fallback: ${customError}`)
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

    const BOOQABLE_BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/1`
    const KEY = process.env.BOOQABLE_API_KEY

    if (!KEY) throw new Error('BOOQABLE_API_KEY is missing')
    if (!customer?.name?.trim()) throw new Error('Customer name is required')

    // 1. Use existing customer or create new one
    let customerId: string

    if (customer.booqableId) {
      customerId = customer.booqableId
    } else {
      const custData = await postJson(
        `${BOOQABLE_BASE}/customers?api_key=${KEY}`,
        {
          customer: {
            name: customer.name,
            ...(customer.email ? { email: customer.email } : {}),
            ...(customer.phone ? { phone: customer.phone } : {}),
          },
        },
        { 'Content-Type': 'application/json' },
        'Customer creation'
      ) as BooqableCustomerResponse

      customerId = custData.customer?.id ?? ''
      if (!customerId) throw new Error(`Customer creation failed: ${JSON.stringify(custData)}`)
    }

    // 2. Create order
    const orderData = await postJson(
      `${BOOQABLE_BASE}/orders?api_key=${KEY}`,
      {
        order: {
          customer_id: customerId,
          starts_at: startsAt,
          stops_at: stopsAt,
          status: 'concept',
        },
      },
      { 'Content-Type': 'application/json' },
      'Order creation'
    ) as BooqableOrderResponse

    const orderId = orderData.order?.id
    if (!orderId) throw new Error(`Order creation failed: ${JSON.stringify(orderData)}`)

    // 3. Add lines in the exact order from the quote builder.
    let position = 1
    for (const item of items || []) {
      const type = item.type || (item.productId ? 'product' : 'custom_charge')

      if (type === 'section') {
        await createV4LineWithFallbacks({ orderId, item, position, lineKind: 'section' })
      } else if (type === 'product' && item.productId) {
        await createProductLineOrCustomFallback({ orderId, item, position })
      } else {
        await createV4LineWithFallbacks({ orderId, item, position, lineKind: 'charge' })
      }

      position += 1
    }

    const orderUrl = `https://filme.booqable.com/orders/${orderId}`

    // 4. Save conversation/request to Supabase
    const supabase = getSupabaseAdmin()
    const { data: conv } = await supabase
      .from('conversations')
      .insert({
        contact_name: customer.name || null,
        contact_email: customer.email || null,
        status: 'open',
        booqable_order_id: orderId,
        booqable_order_url: orderUrl,
      })
      .select('id')
      .single()

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
