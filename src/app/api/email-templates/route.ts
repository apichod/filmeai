import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getSeedRows, EMAIL_TEMPLATE_LABELS } from '@/lib/email-templates'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET — retourne toutes les lignes groupées par template_id, seed si vide
export async function GET() {
  const supabase = getSupabaseAdmin()

  // Vérifie si la table est vide
  const { count } = await supabase
    .from('email_templates')
    .select('*', { count: 'exact', head: true })

  if (count === 0) {
    // Seed depuis les TypeScript defaults
    const rows = getSeedRows()
    await supabase.from('email_templates').insert(rows)
  }

  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .order('template_id')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Grouper par template_id
  const grouped: Record<string, {
    template_id: string
    label: string
    cases: typeof data
  }> = {}

  for (const row of data || []) {
    if (!grouped[row.template_id]) {
      grouped[row.template_id] = {
        template_id: row.template_id,
        label: EMAIL_TEMPLATE_LABELS[row.template_id as keyof typeof EMAIL_TEMPLATE_LABELS] || row.template_id,
        cases: [],
      }
    }
    grouped[row.template_id].cases.push(row)
  }

  return NextResponse.json(Object.values(grouped))
}

// PATCH — met à jour subject et/ou body d'une variante
export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    template_id: string
    case_key: string
    subject?: string
    body?: string
  }

  if (!body.template_id || !body.case_key) {
    return NextResponse.json({ error: 'template_id et case_key requis' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const updates: Record<string, string> = { updated_at: new Date().toISOString() }
  if (body.subject !== undefined) updates.subject = body.subject
  if (body.body    !== undefined) updates.body    = body.body

  const { error } = await supabase
    .from('email_templates')
    .update(updates)
    .eq('template_id', body.template_id)
    .eq('case_key',    body.case_key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
