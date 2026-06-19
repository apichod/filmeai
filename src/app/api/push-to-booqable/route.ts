import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  pushQuoteToBooqable,
  type Customer,
  type QuoteItem,
} from '@/lib/booqable'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type StoredQuoteItem = {
  type?: string
  sourceType?: 'product_group' | 'bundle' | null
  productId?: string | null
  quantity?: number
  name?: string | null
  title?: string | null
  requestedName?: string | null
  section?: string | null
  unitPrice?: number | null
  deposit?: number | null
  availabilityStatus?: string | null
  availabilityLabel?: string | null
  availableQuantity?: number | null
}

type ConversationRow = {
  id: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_meta: Record<string, unknown> | null
  booqable_customer_id: string | null
  quote_status: string | null
  starts_at: string | null
  stops_at: string | null
  quote_items: StoredQuoteItem[] | null
}

export async function POST(req: NextRequest) {
  try {
    const { conversationId } = await req.json() as { conversationId: string }

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: conv, error: fetchError } = await supabase
      .from('conversations')
      .select('id, contact_name, contact_email, contact_phone, contact_meta, booqable_customer_id, quote_status, starts_at, stops_at, quote_items')
      .eq('id', conversationId)
      .single()

    if (fetchError || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const row = conv as ConversationRow

    if (!row.starts_at || !row.stops_at) {
      return NextResponse.json({ error: 'Missing starts_at or stops_at on conversation' }, { status: 400 })
    }

    const meta = row.contact_meta || {}

    const customer: Customer = {
      name: row.contact_name || '',
      email: row.contact_email || undefined,
      phone: row.contact_phone || undefined,
      type: (meta.type as 'person' | 'company') || undefined,
      addressLine1: (meta.addressLine1 as string) || undefined,
      addressLine2: (meta.addressLine2 as string) || undefined,
      postalCode: (meta.postalCode as string) || undefined,
      city: (meta.city as string) || undefined,
      country: (meta.country as string) || undefined,
      booqableId: row.booqable_customer_id || undefined,
    }

    const items: QuoteItem[] = (row.quote_items || []).map((stored: StoredQuoteItem) => ({
      type: stored.type as QuoteItem['type'],
      sourceType: stored.sourceType,
      productId: stored.productId || undefined,
      quantity: stored.quantity,
      name: stored.name || undefined,
      title: stored.title || undefined,
      requestedName: stored.requestedName || undefined,
      section: stored.section || null,
      unitPrice: stored.unitPrice ?? null,
      deposit: stored.deposit ?? null,
      availabilityStatus: stored.availabilityStatus as QuoteItem['availabilityStatus'],
      availabilityLabel: stored.availabilityLabel || null,
      availableQuantity: stored.availableQuantity ?? null,
    }))

    const { orderId, orderUrl, customerId, customerWarning } = await pushQuoteToBooqable(
      customer,
      items,
      row.starts_at,
      row.stops_at
    )

    const { error: patchError } = await supabase
      .from('conversations')
      .update({
        booqable_order_id: orderId,
        booqable_order_url: orderUrl,
        booqable_customer_id: customerId,
        quote_status: 'pending_validation',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    if (patchError) {
      throw new Error(`Supabase update failed after Booqable push: ${patchError.message}`)
    }

    return NextResponse.json({
      success: true,
      orderId,
      orderUrl,
      customerWarning,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('push-to-booqable error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
