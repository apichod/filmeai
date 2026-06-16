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

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdmin()
    const { id } = params

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, contact_name, contact_email, status, booqable_order_id, booqable_order_url, created_at, updated_at')
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

    if (msgError) {
      console.error('Messages fetch error:', msgError.message)
    }

    return NextResponse.json(
      { ...conversation, messages: messages || [] },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('Conversation detail route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}
