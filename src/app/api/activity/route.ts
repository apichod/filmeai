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

/** GET /api/activity?action=&user=&limit=50&offset=0 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const actionFilter = searchParams.get('action') ?? ''
    const userFilter = searchParams.get('user') ?? ''
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
    const offset = parseInt(searchParams.get('offset') ?? '0')

    const supabase = getSupabase()
    const orgId = await getOrgId(supabase)
    if (!orgId) return NextResponse.json({ logs: [], total: 0 })

    let query = supabase
      .from('activity_log')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (actionFilter) query = query.eq('action', actionFilter)
    if (userFilter) query = query.eq('user_email', userFilter)

    const { data, count, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ logs: data ?? [], total: count ?? 0 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** POST /api/activity  { action, target_id?, user_email? } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { action?: string; target_id?: string; user_email?: string }
    if (!body.action) return NextResponse.json({ error: 'action requis' }, { status: 400 })

    const supabase = getSupabase()
    const orgId = await getOrgId(supabase)
    if (!orgId) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 })

    const { error } = await supabase.from('activity_log').insert({
      organization_id: orgId,
      action: body.action,
      target_id: body.target_id ?? null,
      user_email: body.user_email ?? null,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
