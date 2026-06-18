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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabase()
  const orgId = await getOrgId(supabase)
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { question?: string; answer?: string }
  const update: Record<string, string> = { updated_at: new Date().toISOString() }
  if (body.question !== undefined) update.question = body.question.trim()
  if (body.answer !== undefined) update.answer = body.answer.trim()

  const { data, error } = await supabase
    .from('faq_items')
    .update(update)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabase()
  const orgId = await getOrgId(supabase)
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('faq_items')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
