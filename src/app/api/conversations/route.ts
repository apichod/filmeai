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

    const { data: conversations, error } = await supabase
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
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Conversations fetch error:', error.message)
      return NextResponse.json([], { headers: CORS_HEADERS })
    }

    if (!conversations || conversations.length === 0) {
      return NextResponse.json([], { headers: CORS_HEADERS })
    }

    const conversationIds = conversations.map(c => c.id)
    const { data: lastMessages } = await supabase
      .from('messages')
      .select('conversation_id, content, role, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })

    const lastMessageMap = new Map<string, { content: string; role: string; created_at: string }>()
    for (const msg of lastMessages || []) {
      if (!lastMessageMap.has(msg.conversation_id)) {
        lastMessageMap.set(msg.conversation_id, {
          content: msg.content,
          role: msg.role,
          created_at: msg.created_at,
        })
      }
    }

    const result = conversations.map(conv => ({
      ...conv,
      last_message: lastMessageMap.get(conv.id) || null,
    }))

    return NextResponse.json(result, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('Conversations route error:', err)
    return NextResponse.json([], { headers: CORS_HEADERS })
  }
}
