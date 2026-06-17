import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
  if (!orgId) return NextResponse.json({ settings: null })

  const { data, error } = await supabase
    .from('assistant_settings')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Upsert default row if none exists
  if (!data) {
    const { data: created } = await supabase
      .from('assistant_settings')
      .insert({ organization_id: orgId })
      .select()
      .single()
    return NextResponse.json({ settings: created })
  }

  return NextResponse.json({ settings: data })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>
  const supabase = getSupabase()
  const orgId = await getOrgId(supabase)
  if (!orgId) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 })

  const { data, error } = await supabase
    .from('assistant_settings')
    .upsert(
      { organization_id: orgId, ...body, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}
