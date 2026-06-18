import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  try {
    const supabase = getSupabase()

    const { count, error: countErr } = await supabase
      .from('products_cache')
      .select('*', { count: 'exact', head: true })

    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })

    const { data: latest, error: latestErr } = await supabase
      .from('products_cache')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestErr) return NextResponse.json({ error: latestErr.message }, { status: 500 })

    return NextResponse.json({
      count: count ?? 0,
      lastSync: latest?.updated_at ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
