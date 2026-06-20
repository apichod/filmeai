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

type FinalChoice = {
  id?: string | null
  name?: string | null
}

type DiagnosticShape = {
  requestedName?: string | null
  matchingRaw?: string | null
  searchQuery?: string | null
  section?: string | null
  quantity?: number | null
  selectedBy?: string | null
  finalChoice?: FinalChoice | null
  rerank?: {
    confidence?: number | null
    reason?: string | null
  } | null
  candidates?: unknown
}

type CorrectionBody = {
  source?: string | null
  correctionType?: string | null
  conversationId?: string | null
  quoteDraftId?: string | null
  quoteItemUid?: string | null
  requestedText?: string | null
  matchingRaw?: string | null
  searchQuery?: string | null
  section?: string | null
  quantity?: number | null
  aiSelectedProductId?: string | null
  aiSelectedProductName?: string | null
  aiConfidence?: number | null
  aiSelectedBy?: string | null
  aiReason?: string | null
  correctedProductId?: string | null
  correctedProductName?: string | null
  diagnostic?: unknown
  candidates?: unknown
  metadata?: Record<string, unknown> | null
  createdBy?: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function diagnosticShape(value: unknown): DiagnosticShape | null {
  return asRecord(value) as DiagnosticShape | null
}

function cleanText(value: unknown, max = 500) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text.slice(0, max) : null
}

function cleanNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function cleanConfidence(value: unknown) {
  const number = cleanNumber(value)
  if (number == null) return null
  return Math.max(0, Math.min(1, number))
}

function cleanUuid(value: unknown) {
  const text = cleanText(value, 80)
  if (!text) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null
}

function isAllowedOrigin(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (!origin) return true
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'filmeai.vercel.app' ||
      hostname === 'filme.fr' ||
      hostname === 'www.filme.fr' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1'
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedOrigin(req)) {
      return json({ error: 'Origin non autorisée.' }, { status: 403 })
    }

    const body = await req.json() as CorrectionBody
    const diagnostic = diagnosticShape(body.diagnostic)
    const correctionType = cleanText(body.correctionType, 80)
    if (!correctionType) {
      return json({ error: 'correctionType est requis.' }, { status: 400 })
    }

    const supabase = getSupabase()
    const orgId = await getOrgId(supabase)
    if (!orgId) return json({ error: 'Organisation introuvable.' }, { status: 404 })

    const finalChoice = diagnostic?.finalChoice || null
    const candidatesFromDiagnostic = diagnostic && 'candidates' in diagnostic ? diagnostic.candidates : null

    const requestedText = cleanText(body.requestedText, 800) || cleanText(diagnostic?.requestedName, 800)
    const matchingRaw = cleanText(body.matchingRaw, 800) || cleanText(diagnostic?.matchingRaw, 800)
    const searchQuery = cleanText(body.searchQuery, 800) || cleanText(diagnostic?.searchQuery, 800)
    const quantity = cleanNumber(body.quantity) ?? cleanNumber(diagnostic?.quantity)
    const aiConfidence = cleanConfidence(body.aiConfidence) ?? cleanConfidence(diagnostic?.rerank?.confidence)

    const { data, error } = await supabase
      .from('catalog_correction_events')
      .insert({
        organization_id: orgId,
        source: cleanText(body.source, 80) || 'unknown',
        correction_type: correctionType,
        conversation_id: cleanUuid(body.conversationId),
        quote_draft_id: cleanUuid(body.quoteDraftId),
        quote_item_uid: cleanText(body.quoteItemUid, 120),
        requested_text: requestedText,
        matching_raw: matchingRaw,
        search_query: searchQuery,
        section: cleanText(body.section, 180) || cleanText(diagnostic?.section, 180),
        quantity: quantity == null ? null : Math.max(1, Math.round(quantity)),
        ai_selected_product_id: cleanText(body.aiSelectedProductId, 120) || cleanText(finalChoice?.id, 120),
        ai_selected_product_name: cleanText(body.aiSelectedProductName, 260) || cleanText(finalChoice?.name, 260),
        ai_confidence: aiConfidence,
        ai_selected_by: cleanText(body.aiSelectedBy, 80) || cleanText(diagnostic?.selectedBy, 80),
        ai_reason: cleanText(body.aiReason, 1200) || cleanText(diagnostic?.rerank?.reason, 1200),
        corrected_product_id: cleanText(body.correctedProductId, 120),
        corrected_product_name: cleanText(body.correctedProductName, 260),
        diagnostic: body.diagnostic ?? null,
        candidates: body.candidates ?? candidatesFromDiagnostic ?? null,
        metadata: asRecord(body.metadata) || {},
        created_by: cleanText(body.createdBy, 180),
      })
      .select()
      .single()

    if (error) return json({ error: error.message }, { status: 500 })
    return json({ correction: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS })
}
