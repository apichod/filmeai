import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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
  return data?.id ?? null
}

export async function GET() {
  const supabase = getSupabase()
  const orgId = await getOrgId(supabase)
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('knowledge_urls')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ urls: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const orgId = await getOrgId(supabase)
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { url } = await req.json() as { url?: string }
  if (!url?.trim()) return NextResponse.json({ error: 'URL requise.' }, { status: 400 })

  const { data, error } = await supabase
    .from('knowledge_urls')
    .insert({ organization_id: orgId, url: url.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: data })
}
