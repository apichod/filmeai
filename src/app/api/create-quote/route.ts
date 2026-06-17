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
}

type BooqableOrderResponse = {
  order?: { id: string }
  error?: unknown
}

type BooqableLineResponse = {
  data?: { id: string }
  error?: unknown
  errors?: unknown
}

function cleanTitle(value: string | undefined | null, fallback: string) {
  const title = String(value || '').trim()
  return title.length > 0 ? title : fallback
}

function quantityOf(item: QuoteItem) {
  return Math.max(1, Math.round(Number(item.quantity) || 1))
}

async function readJsonOrThrow<T>(res: Response, context: string): Promise<T> {
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

  return parsed as T
}

async function createV4CustomLine({
  orderId,
  item,
  position,
  lineType,
}: {
  orderId: string
  item: QuoteItem
  position: number
  lineType: 'charge' | 'section'
}) {
  const BOOQABLE_V4_BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/4`
  const KEY = process.env.BOOQABLE_API_KEY
  const title = cleanTitle(item.title || item.name || item.requestedName, lineType === 'section' ? 'Section' : 'Produit à vérifier')

  const attributes: Record<string, string | number | boolean | null> = {
    owner_id: orderId,
    owner_type: 'orders',
    line_type: lineType,
    title,
    position,
  }

  if (lineType === 'charge') {
    attributes.quantity = quantityOf(item)
    attributes.price_each_in_cents = 0
    attributes.extra_information = [
      'Ligne custom créée par FilmeAI car la correspondance catalogue est incertaine.',
      item.requestedName ? `Produit demandé : ${item.requestedName}` : null,
      item.section ? `Section : ${item.section}` : null,
      'À vérifier et chiffrer dans Booqable.',
    ].filter(Boolean).join('\n')
  }

  const res = await fetch(`${BOOQABLE_V4_BASE}/lines`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      data: {
        type: 'lines',
        attributes,
      },
    }),
  })

  const data = await readJsonOrThrow<BooqableLineResponse>(res, `Custom ${lineType} line`)
  if (data.error || data.errors) {
    throw new Error(`Custom ${lineType} line failed: ${JSON.stringify(data)}`)
  }

  return data.data?.id || null
}

async function createV1ProductLine({
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

  if (!item.productId) {
    throw new Error(`Missing productId for product line: ${JSON.stringify(item)}`)
  }

  const res = await fetch(`${BOOQABLE_BASE}/order_lines?api_key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_line: {
        order_id: orderId,
        item_id: item.productId,
        quantity: quantityOf(item),
        position,
      },
    }),
  })

  const data = await readJsonOrThrow<{ order_line?: { id: string }; error?: unknown; errors?: unknown }>(
    res,
    `Product line (${item.requestedName || item.productId})`
  )
  if (data.error || data.errors) {
    throw new Error(`Product line failed (${item.requestedName || item.productId}): ${JSON.stringify(data)}`)
  }

  return data.order_line?.id || null
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
      const custRes = await fetch(`${BOOQABLE_BASE}/customers?api_key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            name: customer.name,
            ...(customer.email ? { email: customer.email } : {}),
            ...(customer.phone ? { phone: customer.phone } : {}),
          },
        }),
      })
      const custData = await readJsonOrThrow<BooqableCustomerResponse>(custRes, 'Customer creation')
      customerId = custData.customer?.id ?? ''
      if (!customerId) throw new Error(`Customer creation failed: ${JSON.stringify(custData)}`)
    }

    // 2. Create order
    const orderRes = await fetch(`${BOOQABLE_BASE}/orders?api_key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: {
          customer_id: customerId,
          starts_at: startsAt,
          stops_at: stopsAt,
          status: 'concept',
        },
      }),
    })
    const orderData = await readJsonOrThrow<BooqableOrderResponse>(orderRes, 'Order creation')
    const orderId = orderData.order?.id
    if (!orderId) throw new Error(`Order creation failed: ${JSON.stringify(orderData)}`)

    // 3. Add lines in the exact order from the quote builder.
    // Product lines still use the stable v1 order_lines endpoint already used by the app.
    // Sections + doubtful products use Booqable v4 custom lines (line_type section/charge).
    let position = 1
    for (const item of items || []) {
      const type = item.type || (item.productId ? 'product' : 'custom_charge')

      if (type === 'section') {
        await createV4CustomLine({ orderId, item, position, lineType: 'section' })
      } else if (type === 'product' && item.productId) {
        await createV1ProductLine({ orderId, item, position })
      } else {
        await createV4CustomLine({ orderId, item, position, lineType: 'charge' })
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
