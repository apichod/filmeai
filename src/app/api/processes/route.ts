import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── GET — liste tous les process ──────────────────────────────────────────────
export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('processes')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ processes: data || [] })
}

// ── POST — créer un process ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    slug: string
    title: string
    subtitle?: string
    steps?: unknown[]
    sort_order?: number
  }
  if (!body.slug || !body.title) {
    return NextResponse.json({ error: 'slug et title requis' }, { status: 400 })
  }
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('processes')
    .insert({
      slug:       body.slug,
      title:      body.title,
      subtitle:   body.subtitle || '',
      steps:      body.steps || [],
      sort_order: body.sort_order ?? 99,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ process: data })
}

// ── PATCH — mettre à jour un process (title, subtitle, steps) ─────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    id: string
    title?: string
    subtitle?: string
    steps?: unknown[]
    sort_order?: number
  }
  if (!body.id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title      !== undefined) patch.title      = body.title
  if (body.subtitle   !== undefined) patch.subtitle   = body.subtitle
  if (body.steps      !== undefined) patch.steps      = body.steps
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order

  const { error } = await supabase.from('processes').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── DELETE — supprimer un process ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('processes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
