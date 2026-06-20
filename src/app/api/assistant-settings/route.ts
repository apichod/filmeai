import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
}

const ALLOWED_FIELDS = new Set([
  // Apparence
  'primary_color',
  'bubble_icon',
  'position',
  'size',
  'assistant_name',
  'show_teaser',
  'teaser_text',
  'teaser_delay',
  'attract_attention',
  'show_branding',

  // Comportement
  'language',
  'greeting_message',
  'internal_persona',
  'chat_system_prompt',
  'chat_system_prompt_disponibilite',
  'chat_system_prompt_technique',
  'chat_system_prompt_general',
  'quote_extraction_prompt',
  'quote_rerank_prompt',
  // Ancien champ conservé pour compatibilité.
  'quote_backend_prompt',
  'forbidden_topics',

  // Conditions
  'opening_hours',
  'delivery_enabled',
  'delivery_pricing',
  'round_trip',
  'delivery_fee',
  'delivery_fee_return',
  'delivery_zones',
  'booking_delay',
  'payment_methods',
  'default_pickup_time',
  'default_return_time',

  // Devis
  'quote_mode',
  'out_of_stock',
  'upsell_mode',
  'accessories_mode',
  'list_mode',

  // Intégration
  'allowed_domains',
])

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: NO_STORE_HEADERS,
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
  return data?.id ?? null
}

function sanitizeSettings(body: Record<string, unknown>) {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(key)) clean[key] = value
  }
  return clean
}

async function readSettings(supabase: ReturnType<typeof getSupabase>, orgId: string) {
  const { data, error } = await supabase
    .from('assistant_settings')
    .select('*')
    .eq('organization_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function GET() {
  try {
    const supabase = getSupabase()
    const orgId = await getOrgId(supabase)
    if (!orgId) return json({ settings: null })

    const existing = await readSettings(supabase, orgId)
    if (existing) return json({ settings: existing })

    const { data: created, error } = await supabase
      .from('assistant_settings')
      .insert({ organization_id: orgId })
      .select()
      .single()

    if (error) return json({ error: error.message }, { status: 500 })
    return json({ settings: created })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    const patch = sanitizeSettings(body)
    const supabase = getSupabase()
    const orgId = await getOrgId(supabase)
    if (!orgId) return json({ error: 'Organisation introuvable' }, { status: 404 })

    const existing = await readSettings(supabase, orgId)
    const payload = { ...patch, updated_at: new Date().toISOString() }

    if (existing?.id) {
      const { data, error } = await supabase
        .from('assistant_settings')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single()

      if (error) return json({ error: error.message }, { status: 500 })
      // Log activity (best-effort)
      void supabase.from('activity_log').insert({ organization_id: orgId, action: 'Réglages assistant modifiés' })
      return json({ settings: data })
    }

    const { data, error } = await supabase
      .from('assistant_settings')
      .insert({ organization_id: orgId, ...payload })
      .select()
      .single()

    if (error) return json({ error: error.message }, { status: 500 })
    return json({ settings: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, { status: 500 })
  }
}
