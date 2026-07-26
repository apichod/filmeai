import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── GET — liste des catégories (filtrable par chat_type) ──────────────────────
export async function GET(req: NextRequest) {
  const chatType = req.nextUrl.searchParams.get('chat_type')
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('chat_categories')
    .select('*')
    .order('sort_order', { ascending: true })

  if (chatType) query = query.eq('chat_type', chatType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ categories: data || [] })
}

// ── POST — créer une catégorie ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    chat_type: string
    label: string
    key: string
    sort_order?: number
    is_active?: boolean
  }

  if (!body.chat_type || !body.label || !body.key) {
    return NextResponse.json({ error: 'chat_type, label et key sont requis' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('chat_categories')
    .insert({
      chat_type:  body.chat_type,
      label:      body.label,
      key:        body.key,
      sort_order: body.sort_order ?? 99,
      is_active:  body.is_active ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data })
}

// ── PATCH — mettre à jour une ou plusieurs catégories ─────────────────────────
// Accepte un seul objet { id, ...champs } OU un tableau [{ id, ...champs }]
// pour les mises à jour en masse (réordonnancement)
export async function PATCH(req: NextRequest) {
  const body = await req.json() as
    | { id: string; label?: string; key?: string; sort_order?: number; is_active?: boolean }
    | { id: string; label?: string; key?: string; sort_order?: number; is_active?: boolean }[]

  const items = Array.isArray(body) ? body : [body]
  const supabase = getSupabaseAdmin()

  for (const item of items) {
    if (!item.id) continue
    const patch: Record<string, unknown> = {}
    if (item.label      !== undefined) patch.label      = item.label
    if (item.key        !== undefined) patch.key        = item.key
    if (item.sort_order !== undefined) patch.sort_order = item.sort_order
    if (item.is_active  !== undefined) patch.is_active  = item.is_active
    if (Object.keys(patch).length === 0) continue
    const { error } = await supabase.from('chat_categories').update(patch).eq('id', item.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// ── DELETE — supprimer une catégorie ──────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('chat_categories').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
