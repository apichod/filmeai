import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── GET — liste des workflows ─────────────────────────────────────────────────
export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('return_workflows')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ workflows: data || [] })
}

// ── POST — créer un workflow ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    slug: string
    name: string
    description?: string
    prompt?: string
    steps?: unknown[]
    is_active?: boolean
  }

  if (!body.slug || !body.name) return NextResponse.json({ error: 'slug et name requis' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('return_workflows')
    .insert({
      slug:        body.slug,
      name:        body.name,
      description: body.description || '',
      prompt:      body.prompt || '',
      steps:       body.steps || [],
      is_active:   body.is_active ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ workflow: data })
}

// ── PATCH — mettre à jour un workflow ─────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    id: string
    name?: string
    description?: string
    prompt?: string
    steps?: unknown[]
    is_active?: boolean
  }

  if (!body.id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.name        !== undefined) patch.name        = body.name
  if (body.description !== undefined) patch.description = body.description
  if (body.prompt      !== undefined) patch.prompt      = body.prompt
  if (body.steps       !== undefined) patch.steps       = body.steps
  if (body.is_active   !== undefined) patch.is_active   = body.is_active

  const { error } = await supabase.from('return_workflows').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
