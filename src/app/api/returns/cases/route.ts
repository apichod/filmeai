import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── GET — liste des cas ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const supabase = getSupabaseAdmin()
  const single = searchParams.get('id')

  if (single) {
    // Détail d'un cas (inclut messages)
    const { data, error } = await supabase
      .from('return_cases')
      .select('*')
      .eq('id', single)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ case: data })
  }

  let query = supabase
    .from('return_cases')
    .select('id, case_number, origin_order, sav_order_id, problem_type, problem_description, status, metadata, created_at, updated_at, resolved_at')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cases: data || [] })
}

// ── POST — créer un cas ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    origin_order?: string
    origin_order_id?: string
    sav_order_id?: string
    problem_type?: string
    problem_description?: string
    metadata?: Record<string, unknown>
    messages?: unknown[]
    actions_taken?: unknown[]
    workflow_id?: string
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('return_cases')
    .insert({
      origin_order:       body.origin_order,
      origin_order_id:    body.origin_order_id,
      sav_order_id:       body.sav_order_id,
      problem_type:       body.problem_type,
      problem_description: body.problem_description,
      metadata:           body.metadata || {},
      messages:           body.messages || [],
      actions_taken:      body.actions_taken || [],
      workflow_id:        body.workflow_id,
      status:             'open',
    })
    .select('id, case_number')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, id: data.id, case_number: data.case_number })
}

// ── PATCH — mettre à jour un cas (statut, notes, messages) ───────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    id: string
    status?: string
    notes?: string
    messages?: unknown[]
    actions_taken?: unknown[]
    sav_order_id?: string
    metadata?: Record<string, unknown>
  }

  if (!body.id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.status)        patch.status        = body.status
  if (body.notes !== undefined) patch.notes   = body.notes
  if (body.messages)      patch.messages      = body.messages
  if (body.actions_taken) patch.actions_taken = body.actions_taken
  if (body.sav_order_id)  patch.sav_order_id  = body.sav_order_id
  if (body.metadata)      patch.metadata      = body.metadata
  if (body.status === 'resolved') patch.resolved_at = new Date().toISOString()

  const { error } = await supabase.from('return_cases').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// ── DELETE — supprimer des cas ────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const body = await req.json() as { ids: string[] }
  if (!body.ids || body.ids.length === 0)
    return NextResponse.json({ error: 'ids manquants' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('return_cases').delete().in('id', body.ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
