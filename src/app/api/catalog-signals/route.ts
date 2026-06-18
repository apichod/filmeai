import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init?.headers || {}) },
  })
}

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

type SignalBody = {
  term?: string
  productId?: string | null
  productName?: string | null
  source?: string | null
  confidence?: number | null
}

export async function GET() {
  try {
    const supabase = getSupabase()
    const orgId = await getOrgId(supabase)
    if (!orgId) return json({ signals: [] })

    const { data, error } = await supabase
      .from('catalog_signals')
      .select('*')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(300)

    if (error) return json({ error: error.message }, { status: 500 })
    return json({ signals: data || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as SignalBody
    const term = (body.term || '').trim().slice(0, 220)
    const productName = (body.productName || '').trim().slice(0, 260)
    if (!term || !productName) {
      return json({ error: 'term et productName sont requis.' }, { status: 400 })
    }

    const supabase = getSupabase()
    const orgId = await getOrgId(supabase)
    if (!orgId) return json({ error: 'Organisation introuvable.' }, { status: 404 })

    const normalizedTerm = normalizeTerm(term)
    const now = new Date().toISOString()
    const source = (body.source || 'manual').trim().slice(0, 80)
    const productId = body.productId ? String(body.productId).trim() : null
    const confidence = typeof body.confidence === 'number'
      ? Math.max(0, Math.min(1, body.confidence))
      : null
    const approved = !source.startsWith('chat')

    const { data: existing, error: existingError } = await supabase
      .from('catalog_signals')
      .select('id, occurrences')
      .eq('organization_id', orgId)
      .eq('normalized_term', normalizedTerm)
      .eq('product_name', productName)
      .maybeSingle()

    if (existingError) return json({ error: existingError.message }, { status: 500 })

    if (existing?.id) {
      const { data, error } = await supabase
        .from('catalog_signals')
        .update({
          product_id: productId,
          source,
          confidence,
          approved,
          occurrences: Number(existing.occurrences || 1) + 1,
          updated_at: now,
          last_seen_at: now,
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) return json({ error: error.message }, { status: 500 })
      return json({ signal: data })
    }

    const { data, error } = await supabase
      .from('catalog_signals')
      .insert({
        organization_id: orgId,
        term,
        normalized_term: normalizedTerm,
        product_id: productId,
        product_name: productName,
        source,
        confidence,
        approved,
      })
      .select()
      .single()

    if (error) return json({ error: error.message }, { status: 500 })
    return json({ signal: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS })
}
