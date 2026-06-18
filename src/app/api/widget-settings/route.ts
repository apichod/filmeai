import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const DEFAULT_GREETING = "Bonjour ! 👋 Je suis l'assistant FilmeAI de Filme, votre loueur de matériel audiovisuel.\n\nJe peux vous préparer un devis en quelques minutes. Pour commencer, pourriez-vous me donner votre prénom et nom ?"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, max-age=0',
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getOrgId(supabase: ReturnType<typeof getSupabase>) {
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ? String(data.id) : null
}

export async function GET() {
  try {
    const supabase = getSupabase()
    const orgId = await getOrgId(supabase)
    if (!orgId) {
      return NextResponse.json({ greeting_message: DEFAULT_GREETING }, { headers: CORS_HEADERS })
    }

    const { data, error } = await supabase
      .from('assistant_settings')
      .select('greeting_message, assistant_name, primary_color')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({
      greeting_message: data?.greeting_message?.trim() || DEFAULT_GREETING,
      assistant_name: data?.assistant_name || 'filmeAI',
      primary_color: data?.primary_color || '#000000',
    }, { headers: CORS_HEADERS })
  } catch {
    return NextResponse.json({ greeting_message: DEFAULT_GREETING }, { headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS })
}
