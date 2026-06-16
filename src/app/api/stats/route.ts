import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS })
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const [totalRes, quotesRes, contactsRes] = await Promise.all([
      supabase.from('conversations').select('id', { count: 'exact', head: true }),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).not('booqable_order_id', 'is', null),
      supabase.from('conversations').select('contact_email').not('contact_email', 'is', null),
    ])

    const totalConversations = totalRes.count ?? 0
    const totalQuotes = quotesRes.count ?? 0

    // Count distinct emails
    const emails = new Set((contactsRes.data || []).map(r => r.contact_email as string))
    const contacts = emails.size

    return NextResponse.json(
      { total_conversations: totalConversations, total_quotes: totalQuotes, contacts },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('Stats route error:', err)
    return NextResponse.json(
      { total_conversations: 0, total_quotes: 0, contacts: 0 },
      { headers: CORS_HEADERS }
    )
  }
}
