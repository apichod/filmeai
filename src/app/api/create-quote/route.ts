import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type QuoteItem = {
  productId: string
  quantity: number
}

type Customer = {
  name: string
  email?: string
  phone?: string
  booqableId?: string // existing Booqable customer ID
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

    // 1. Use existing customer or create new one
    let customerId: string

    if (customer.booqableId) {
      // Use existing Booqable customer directly
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
      const custData = await custRes.json() as { customer?: { id: string } }
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
    const orderData = await orderRes.json() as { order?: { id: string } }
    const orderId = orderData.order?.id
    if (!orderId) throw new Error(`Order creation failed: ${JSON.stringify(orderData)}`)

    // 3. Add products
    for (const item of items) {
      await fetch(`${BOOQABLE_BASE}/order_lines?api_key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_line: {
            order_id: orderId,
            item_id: item.productId,
            quantity: item.quantity,
          },
        }),
      })
    }

    const orderUrl = `https://filme.booqable.com/orders/${orderId}`

    // 4. Save conversation to Supabase
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
