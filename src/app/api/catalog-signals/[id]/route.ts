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
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.id ? String(data.id) : null
}

function normalizeTerm(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

type SignalPatchBody = {
  approved?: boolean
  term?: string
  productName?: string
  productId?: string | null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json() as SignalPatchBody
    const supabase = getSupabase()
    const orgId = await getOrgId(supabase)
    if (!orgId) return NextResponse.json({ error: 'Organisation introuvable.' }, { status: 404 })

    const patch: Record<string, string | boolean | null> = {
      updated_at: new Date().toISOString(),
    }

    if (body.approved !== undefined) patch.approved = body.approved === true

    if (body.term !== undefined) {
      const term = body.term.trim().slice(0, 220)
      if (!term) return NextResponse.json({ error: 'Terme client requis.' }, { status: 400 })
      patch.term = term
      patch.normalized_term = normalizeTerm(term)
    }

    if (body.productName !== undefined) {
      const productName = body.productName.trim().slice(0, 260)
      if (!productName) return NextResponse.json({ error: 'Produit catalogue requis.' }, { status: 400 })
      patch.product_name = productName
    }

    if (body.productId !== undefined) {
      patch.product_id = body.productId ? String(body.productId).trim() : null
    }

    const { data, error } = await supabase
      .from('catalog_signals')
      .update(patch)
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ signal: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabase()
    const orgId = await getOrgId(supabase)
    if (!orgId) return NextResponse.json({ error: 'Organisation introuvable.' }, { status: 404 })

    const { error } = await supabase
      .from('catalog_signals')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', orgId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
