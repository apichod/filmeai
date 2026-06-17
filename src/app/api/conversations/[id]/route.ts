import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function quoteDays(startsAt?: string | null, stopsAt?: string | null) {
  if (!startsAt || !stopsAt) return 1
  const start = new Date(startsAt).getTime()
  const stop = new Date(stopsAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return 1
  return Math.max(1, Math.round((stop - start) / 86400000))
}

type QuoteItem = {
  type?: string
  quantity?: number
  unitPrice?: number
  deposit?: number
  lineTotal?: number
  lineDeposit?: number
}

function recalcItems(items: QuoteItem[], days: number) {
  return (items || []).map((item, index) => {
    const type = item.type || 'custom_charge'
    const quantity = type === 'section' ? 1 : Math.max(1, Math.round(Number(item.quantity) || 1))
    const unitPrice = Number(item.unitPrice || 0)
    const deposit = Number(item.deposit || 0)
    return {
      ...item,
      position: index + 1,
      quantity,
      unitPrice,
      deposit,
      lineTotal: type === 'product' ? unitPrice * quantity * days : 0,
      lineDeposit: type === 'product' ? deposit * quantity : 0,
    }
  })
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS })
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdmin()
    const { id } = params

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        id,
        contact_name,
        contact_email,
        contact_phone,
        status,
        quote_status,
        source,
        starts_at,
        stops_at,
        expires_at,
        request_context,
        quote_items,
        quote_total,
        quote_deposit,
        quote_days,
        booqable_order_id,
        booqable_order_url,
        closed_at,
        created_at,
        updated_at
      `)
      .eq('id', id)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS_HEADERS })
    }

    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })

    if (msgError) console.error('Messages fetch error:', msgError.message)

    return NextResponse.json(
      { ...conversation, messages: messages || [] },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('Conversation detail route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdmin()
    const body = await req.json() as {
      contact_name?: string | null
      contact_email?: string | null
      contact_phone?: string | null
      quote_status?: string | null
      starts_at?: string | null
      stops_at?: string | null
      expires_at?: string | null
      request_context?: string | null
      quote_items?: QuoteItem[]
      close?: boolean
    }

    const days = quoteDays(body.starts_at, body.stops_at)
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    for (const key of ['contact_name', 'contact_email', 'contact_phone', 'quote_status', 'starts_at', 'stops_at', 'expires_at', 'request_context'] as const) {
      if (key in body) patch[key] = body[key]
    }

    if (body.close) {
      patch.quote_status = 'closed'
      patch.closed_at = new Date().toISOString()
    }

    if (Array.isArray(body.quote_items)) {
      const quoteItems = recalcItems(body.quote_items, days)
      patch.quote_items = quoteItems
      patch.quote_days = days
      patch.quote_total = quoteItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0)
      patch.quote_deposit = quoteItems.reduce((sum, item) => sum + Number(item.lineDeposit || 0), 0)
    }

    const { data, error } = await supabase
      .from('conversations')
      .update(patch)
      .eq('id', params.id)
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, id: data.id }, { headers: CORS_HEADERS })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Conversation PATCH error:', msg)
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS_HEADERS })
  }
}
