import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  buildStoredQuoteItems,
  summarizeContext,
  rentalDays,
  type Customer,
  type QuoteItem,
} from '@/lib/booqable'

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

export async function POST(req: NextRequest) {
  try {
    const { customer, items, startsAt, stopsAt } = await req.json() as {
      customer: Customer
      items: QuoteItem[]
      startsAt: string
      stopsAt: string
    }

    if (!customer?.name?.trim()) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
    }

    const days = rentalDays(startsAt, stopsAt)
    const storedQuoteItems = buildStoredQuoteItems(items || [], days)
    const quoteTotal = storedQuoteItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0)
    const quoteDeposit = storedQuoteItems.reduce((sum, item) => sum + Number(item.lineDeposit || 0), 0)
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()

    const contactMeta: Record<string, unknown> = {}
    if (customer.type) contactMeta.type = customer.type
    if (customer.addressLine1) contactMeta.addressLine1 = customer.addressLine1
    if (customer.addressLine2) contactMeta.addressLine2 = customer.addressLine2
    if (customer.postalCode) contactMeta.postalCode = customer.postalCode
    if (customer.city) contactMeta.city = customer.city
    if (customer.country) contactMeta.country = customer.country

    const supabase = getSupabaseAdmin()
    const organizationId = await getDefaultOrganizationId(supabase)

    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .insert({
        ...(organizationId ? { organization_id: organizationId } : {}),
        contact_name: customer.name || null,
        contact_email: customer.email || null,
        contact_phone: customer.phone || null,
        booqable_customer_id: customer.booqableId || null,
        contact_meta: Object.keys(contactMeta).length > 0 ? contactMeta : null,
        status: 'open',
        quote_status: 'draft',
        source: 'backoffice',
        starts_at: startsAt,
        stops_at: stopsAt,
        expires_at: expiresAt,
        request_context: summarizeContext(customer, items || [], startsAt, stopsAt),
        quote_items: storedQuoteItems,
        quote_total: quoteTotal,
        quote_deposit: quoteDeposit,
        quote_days: days,
        booqable_order_id: null,
        booqable_order_url: null,
      })
      .select('id')
      .single()

    if (convError) {
      throw new Error(`Supabase draft save failed: ${convError.message}`)
    }

    return NextResponse.json({
      success: true,
      conversationId: conv?.id || null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('save-quote-draft error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
