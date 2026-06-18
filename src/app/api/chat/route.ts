import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  DEFAULT_CHAT_SYSTEM_PROMPT,
  DEFAULT_QUOTE_EXTRACTION_PROMPT,
  DEFAULT_QUOTE_RERANK_PROMPT,
  normalizeEditablePrompt,
  splitQuoteBackendPrompt,
} from '@/lib/defaultAssistantPrompts'
import { searchKnowledge, type KnowledgeChunk } from '@/lib/knowledgeSync'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Product = {
  id: string
  name: string
  description: string | null
  price_per_day: number | null
  deposit: number | null
  photo_url: string | null
  similarity?: number
  is_bundle?: boolean
  bundle_items?: string[]
}

type SessionData = {
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  startsAt?: string | null
  stopsAt?: string | null
  selectedProductIds?: string[]
  quoteMatches?: unknown[]
  conversationId?: string | null
  quoteMode?: 'immediate' | 'manual' | null
}

type IncomingBody = {
  messages?: OpenAI.Chat.ChatCompletionMessageParam[]
  sessionData?: SessionData
}

type QuoteParseItem = {
  requestedName: string
  searchQuery: string
  section: string | null
  quantity: number
  matched: Product | null
  confidence: number
  reason: string | null
  alternatives: Product[]
}

type QuoteParseResponse = {
  items?: QuoteParseItem[]
  error?: string
}

type SelectionResult = {
  selected?: { id: string; reason: string }[]
  response?: string
}

type ConversationPatch = {
  organization_id?: string
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  status?: string
  source?: string
  starts_at?: string | null
  stops_at?: string | null
  request_context?: string | null
  booqable_order_id?: string | null
  booqable_order_url?: string | null
  updated_at?: string
}

type AssistantPromptSettings = {
  chat_system_prompt?: string | null
  quote_extraction_prompt?: string | null
  quote_rerank_prompt?: string | null
  quote_backend_prompt?: string | null
  forbidden_topics?: string[] | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function textFromMessage(message: OpenAI.Chat.ChatCompletionMessageParam): string {
  if (typeof message.content === 'string') return message.content
  if (!message.content) return ''
  return JSON.stringify(message.content)
}

function getLastUserText(messages: OpenAI.Chat.ChatCompletionMessageParam[]): string {
  const last = [...messages].reverse().find(message => message.role === 'user')
  return last ? textFromMessage(last) : ''
}

function getPreviousUserText(messages: OpenAI.Chat.ChatCompletionMessageParam[]): string {
  const users = messages.filter(message => message.role === 'user')
  const previous = users[users.length - 2]
  return previous ? textFromMessage(previous) : ''
}

function cleanAssistantText(text: string): string {
  return text
    .replace(/\[(?:SEARCH|CREATE_QUOTE)[^\]]*\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractEmail(text: string): string | null {
  return text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || null
}

function extractPhone(text: string): string | null {
  return text.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/)?.[0]?.replace(/\s+/g, ' ') || null
}

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1, janv: 1,
  fevrier: 2, février: 2, fev: 2, fév: 2,
  mars: 3,
  avril: 4, avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7, juil: 7,
  aout: 8, août: 8,
  septembre: 9, sept: 9,
  octobre: 10, oct: 10,
  novembre: 11, nov: 11,
  decembre: 12, décembre: 12, dec: 12, déc: 12,
}

const FRENCH_MONTH_PATTERN = 'janvier|janv|février|fevrier|fév|fev|mars|avril|avr|mai|juin|juillet|juil|août|aout|septembre|sept|octobre|oct|novembre|nov|décembre|decembre|déc|dec'

function monthNumber(value: string | undefined | null): number | null {
  if (!value) return null
  const key = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  return FRENCH_MONTHS[key] || null
}

function isoDateAtNine(day: number, month: number, year?: number): string | null {
  const currentYear = new Date().getFullYear()
  const safeYear = year || currentYear
  if (!day || !month || month > 12 || day > 31) return null
  return new Date(Date.UTC(safeYear, month - 1, day, 9, 0, 0)).toISOString()
}

function parseFrenchDate(value: string): string | null {
  const match = value.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/)
  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  let year = match[3] ? Number(match[3]) : undefined
  if (year && year < 100) year += 2000

  return isoDateAtNine(day, month, year)
}

function isLikelyFilterDensity(value: string): boolean {
  const match = value.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/)
  if (!match) return false
  const numerator = Number(match[1])
  const denominator = Number(match[2])
  return numerator >= 1 && numerator <= 4 && [4, 8, 16].includes(denominator)
}

function extractNaturalDateRange(text: string): { startsAt: string | null; stopsAt: string | null } {
  const monthPattern = FRENCH_MONTH_PATTERN
  const connector = '(?:au|à|a|jusqu(?:\'|’)au|jusqu(?:\'|’)à|jusqu(?:\'|’)a|-)'

  // “du 21 au 26 juin”, “21-26 juin”
  const sharedMonth = new RegExp(`(?:du\\s+)?(\\d{1,2})\\s*${connector}\\s*(\\d{1,2})\\s*(${monthPattern})(?:\\s+(\\d{4}))?`, 'i')
  const sharedMatch = text.match(sharedMonth)
  if (sharedMatch) {
    const month = monthNumber(sharedMatch[3])
    const year = sharedMatch[4] ? Number(sharedMatch[4]) : undefined
    return {
      startsAt: month ? isoDateAtNine(Number(sharedMatch[1]), month, year) : null,
      stopsAt: month ? isoDateAtNine(Number(sharedMatch[2]), month, year) : null,
    }
  }

  // “du 21 juin au 26 juin”
  const explicitMonths = new RegExp(`(?:du\\s+)?(\\d{1,2})\\s*(${monthPattern})\\s*${connector}\\s*(\\d{1,2})\\s*(${monthPattern})(?:\\s+(\\d{4}))?`, 'i')
  const explicitMatch = text.match(explicitMonths)
  if (explicitMatch) {
    const startMonth = monthNumber(explicitMatch[2])
    const stopMonth = monthNumber(explicitMatch[4])
    const year = explicitMatch[5] ? Number(explicitMatch[5]) : undefined
    return {
      startsAt: startMonth ? isoDateAtNine(Number(explicitMatch[1]), startMonth, year) : null,
      stopsAt: stopMonth ? isoDateAtNine(Number(explicitMatch[3]), stopMonth, year) : null,
    }
  }

  return { startsAt: null, stopsAt: null }
}

function extractDates(text: string): { startsAt: string | null; stopsAt: string | null } {
  const natural = extractNaturalDateRange(text)
  if (natural.startsAt || natural.stopsAt) return natural

  const matches = text.match(/\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?/g) || []
  if (matches.length === 1 && isLikelyFilterDensity(matches[0]) && !/\b(?:date|dates|du|au|debut|début|fin|location|essai|rendu|retrait|retour|depart|départ)\b/i.test(text)) {
    return { startsAt: null, stopsAt: null }
  }

  if (matches.length > 0) {
    return {
      startsAt: matches[0] ? parseFrenchDate(matches[0]) : null,
      stopsAt: matches[1] ? parseFrenchDate(matches[1]) : null,
    }
  }

  return { startsAt: null, stopsAt: null }
}

function isDateOnlyResponse(text: string): boolean {
  const dates = extractDates(text)
  if (!dates.startsAt && !dates.stopsAt) return false

  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  const productish = /\b(?:sony|canon|arri|aputure|profoto|smallhd|teradek|dzofilm|camera|camera|objectif|moniteur|trepied|filtre|micro|lumiere|pack|kit|rf|fx\d+|c50|c70|c80|c300|c400|b10x?|d2|prohead|atem|sachtler|magliner|x\s*\d+|\d+\s*x)\b/.test(normalized)
  if (productish) return false

  return normalized.length <= 80
}

function hasQuoteDraft(sessionData: SessionData): boolean {
  return Boolean(
    (sessionData.selectedProductIds && sessionData.selectedProductIds.length > 0) ||
    (sessionData.quoteMatches && sessionData.quoteMatches.length > 0)
  )
}

function textHasDateSignal(text: string): boolean {
  const numericDates = text.match(/\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?/g) || []
  return new RegExp(`\\b(${FRENCH_MONTH_PATTERN})\\b`, 'i').test(text) ||
    /\b(?:date|dates|du|au|debut|début|fin|location|essai|rendu|retrait|retour|depart|départ)\b/i.test(text) ||
    numericDates.length >= 2 ||
    (numericDates.length === 1 && !isLikelyFilterDensity(numericDates[0]))
}

function extractRelevantDates(messages: OpenAI.Chat.ChatCompletionMessageParam[]): { startsAt: string | null; stopsAt: string | null } {
  const userTexts = messages
    .filter(message => message.role === 'user')
    .map(textFromMessage)
    .reverse()

  for (const text of userTexts) {
    if (!textHasDateSignal(text)) continue
    const dates = extractDates(text)
    if (dates.startsAt || dates.stopsAt) return dates
  }

  return { startsAt: null, stopsAt: null }
}

function countUnresolvedQuoteMatches(value?: unknown[]): number {
  if (!Array.isArray(value)) return 0

  return value.filter(item => {
    if (!item || typeof item !== 'object') return true
    const record = item as Record<string, unknown>
    const selectedProductId = typeof record.selectedProductId === 'string' ? record.selectedProductId.trim() : ''
    const leaveToFilme = record.leaveToFilme === true
    return leaveToFilme || !selectedProductId
  }).length
}

function formatDateRangeForUser(startsAt?: string | null, stopsAt?: string | null): string {
  const formatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })
  const start = startsAt ? formatter.format(new Date(startsAt)) : null
  const stop = stopsAt ? formatter.format(new Date(stopsAt)) : null
  if (start && stop) return `du ${start} au ${stop}`
  if (start) return `à partir du ${start}`
  if (stop) return `jusqu’au ${stop}`
  return 'sur ces dates'
}

function inferSessionData(messages: OpenAI.Chat.ChatCompletionMessageParam[], sessionData: SessionData): SessionData {
  const fullText = messages.map(textFromMessage).join('\n')
  const firstUserText = messages.find(message => message.role === 'user')
  const dates = extractRelevantDates(messages)

  const inferredName = sessionData.customerName || (
    firstUserText &&
    textFromMessage(firstUserText).length <= 80 &&
    !extractEmail(textFromMessage(firstUserText))
      ? textFromMessage(firstUserText).trim()
      : null
  )

  return {
    ...sessionData,
    customerName: inferredName || sessionData.customerName || null,
    customerEmail: sessionData.customerEmail || extractEmail(fullText),
    customerPhone: sessionData.customerPhone || extractPhone(fullText),
    startsAt: dates.startsAt || sessionData.startsAt || null,
    stopsAt: dates.stopsAt || sessionData.stopsAt || null,
    selectedProductIds: sessionData.selectedProductIds || [],
    quoteMatches: sessionData.quoteMatches || [],
    conversationId: sessionData.conversationId || null,
    quoteMode: sessionData.quoteMode || null,
  }
}

function looksLikeQuoteList(text: string, conversationText = '', forceQuoteMode = false): boolean {
  if (isDateOnlyResponse(text)) return false

  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  const quantityHits = text.match(/(?:^|\n|\s)(?:x|×)?\d+\s*(?:x|×)?\s+[A-Za-zÀ-ÖØ-öø-ÿ0-9]/gi)?.length || 0
  const sectionHits = text.match(/^[A-Za-zÀ-ÖØ-öø-ÿ /&+-]{3,}:\s*$/gm)?.length || 0
  const productVocabularyHit = /\b(?:pack|sony|canon|arri|aputure|profoto|smallhd|moniteur|cam[eé]ra|objectif|tr[eé]pied|filtre|micro|lumi[eè]re|fx\d+|c50|c70|c80|c300|c400|b10x?|d2|cine|sachtler|teradek|dzofilm|rf)\b/i.test(text)
  const modelHits = text.match(/\b(?:fx3|fx6|fx9|fx30|c50|c70|c80|c300|c400|r5c?|r6|komodo|venice|alexa|b10x?|d2|pro-?11|prohead|atem|24\s*[-–—]\s*70|24\s*[-–—]\s*105|70\s*[-–—]\s*200|16\s*[-–—]\s*35)\b/gi)?.length || 0
  const naturalListHits = text.split(/\b(?:avec|et|plus|,|\+)\b|\n/gi)
    .map(part => part.trim())
    .filter(part => /\b(?:une?|des?|c50|c70|c80|c300|c400|fx\d+|rf|24\s*[-–—]\s*70|24\s*[-–—]\s*105|70\s*[-–—]\s*200|16\s*[-–—]\s*35)\b/i.test(part))
    .length
  const assistantAskedForGear = /quel mat[eé]riel souhaitez-vous louer|collez votre liste|liste de mat[eé]riel|mat[eé]riel souhait[eé]|faire un devis/i.test(conversationText)
  const immediateModeGearSignal = forceQuoteMode && (
    modelHits >= 1 ||
    quantityHits >= 1 ||
    naturalListHits >= 2 ||
    /\b(?:cam[eé]ra|objectif|moniteur|tr[eé]pied|filtre|micro|lumi[eè]re|pack|rf|24\s*[-–—]\s*70|24\s*[-–—]\s*105|70\s*[-–—]\s*200|16\s*[-–—]\s*35)\b/i.test(text)
  )

  return (
    immediateModeGearSignal
  ) || (
    quantityHits >= 3
  ) || (
    quantityHits >= 2
  ) || (
    quantityHits >= 1 && (productVocabularyHit || assistantAskedForGear)
  ) || (
    lines.length >= 8 && sectionHits >= 1
  ) || (
    /devis|liste|mat[eé]riel|location/i.test(text) && quantityHits >= 2
  ) || (
    assistantAskedForGear && modelHits >= 2
  ) || (
    assistantAskedForGear && naturalListHits >= 2 && productVocabularyHit
  )
}

function isBrandClarification(text: string): boolean {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  return (
    /^(ce sont|c est|c'est|ils sont|elles sont|tout est|tous sont|toutes sont).*\b(canon|sony|arri|blackmagic|profoto|aputure|smallhd|sachtler)\b/.test(normalized) ||
    /^(canon|sony|arri|blackmagic|profoto|aputure|smallhd|sachtler)$/.test(normalized)
  )
}

function isExplicitQuoteConfirmation(text: string): boolean {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  if (/^\d+\s*\/\s*\d+$/.test(normalized)) return false
  if (isListConfirmation(normalized)) return false

  return /\b(je confirme|confirme|confirmation|valider|valide|creer le devis|cree le devis|créer le devis|crée le devis|generer le devis|générer le devis|pousser dans booqable|envoyer le devis)\b/.test(normalized)
}

function isListConfirmation(text: string): boolean {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  return /\b(confirme|valide|validation|confirmer|valider)\b.*\b(liste|selection|sélection|materiel|matériel)\b/.test(normalized) ||
    /\b(liste|selection|sélection|materiel|matériel)\b.*\b(confirmee|confirmée|validee|validée|ok)\b/.test(normalized)
}

function compactDescription(value: string | null): string {
  if (!value) return ''
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 180)
}

function buildChatSystemPrompt(basePrompt: string, forbiddenTopics?: string[] | null): string {
  const cleanTopics = Array.isArray(forbiddenTopics)
    ? forbiddenTopics.map(topic => topic.trim()).filter(Boolean)
    : []

  if (cleanTopics.length === 0) return basePrompt

  return `${basePrompt}

GARDE-FOUS CONFIGURÉS DANS LE BACK-OFFICE :
- Ne réponds pas aux sujets / marques interdits suivants : ${cleanTopics.join(', ')}.
- Si un visiteur insiste sur un sujet interdit, refuse brièvement et recentre vers la location de matériel audiovisuel Filme.`
}

function shouldSearchKnowledge(text: string): boolean {
  const clean = text.trim()
  if (clean.length < 4) return false
  if (extractEmail(clean)) return false
  if (/^(oui|non|ok|merci|bonjour|salut|hello)$/i.test(clean)) return false
  if (/^[A-Za-zÀ-ÖØ-öø-ÿ' -]{2,28}$/.test(clean) && !/[?]/.test(clean)) return false

  return clean.length >= 14 || /[?]/.test(clean) || /\b(livraison|assurance|caution|horaire|retrait|retour|disponibilit[eé]|conditions?|cgl|conciergerie|chef|op[eé]rateur|test|pack|paiement|annulation)\b/i.test(clean)
}

function buildKnowledgeContext(hits: KnowledgeChunk[]): string {
  if (hits.length === 0) return ''

  const context = hits
    .slice(0, 5)
    .map((hit, index) => {
      const source = hit.source_type === 'faq' ? 'FAQ' : hit.source_type === 'url' ? 'Page web' : 'Document'
      const title = hit.title || 'Sans titre'
      const url = hit.url ? `\nURL : ${hit.url}` : ''
      return `[${index + 1}] ${source} — ${title}${url}\n${hit.content.slice(0, 1100)}`
    })
    .join('\n\n---\n\n')

  return `\n\nBASE DE CONNAISSANCES FILME — EXTRAITS PERTINENTS :\n${context}\n\nRÈGLES D'UTILISATION DE CETTE BASE :\n- Utilise ces extraits prioritairement pour répondre aux questions pratiques sur Filme.\n- Ne cite pas la base de connaissances comme une source technique ; réponds naturellement.\n- Si l'information n'apparaît pas dans les extraits, ne l'invente pas : propose de vérifier avec l'équipe Filme.`
}

async function getDefaultOrganizationId(supabase: SupabaseAdmin): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (existing?.id) return existing.id as string

  const { data: created, error: createError } = await supabase
    .from('organizations')
    .insert({ name: 'Filme' })
    .select('id')
    .single()

  if (createError) throw new Error(createError.message)
  if (!created?.id) throw new Error('Impossible de créer l’organisation Filme')
  return created.id as string
}

async function getAssistantPromptSettings(supabase: SupabaseAdmin): Promise<{
  chatSystemPrompt: string
  quoteExtractionPrompt: string
  quoteRerankPrompt: string
}> {
  try {
    const organizationId = await getDefaultOrganizationId(supabase)
    const { data, error } = await supabase
      .from('assistant_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    const settings = (data || {}) as AssistantPromptSettings
    const legacyPrompts = splitQuoteBackendPrompt(settings.quote_backend_prompt)
    const baseChatPrompt = normalizeEditablePrompt(settings.chat_system_prompt, DEFAULT_CHAT_SYSTEM_PROMPT)
    return {
      chatSystemPrompt: buildChatSystemPrompt(baseChatPrompt, settings.forbidden_topics),
      quoteExtractionPrompt: normalizeEditablePrompt(settings.quote_extraction_prompt, legacyPrompts.extractionPrompt),
      quoteRerankPrompt: normalizeEditablePrompt(settings.quote_rerank_prompt, legacyPrompts.rerankPrompt),
    }
  } catch (err) {
    console.warn('Assistant prompt settings fallback:', err instanceof Error ? err.message : String(err))
    return {
      chatSystemPrompt: DEFAULT_CHAT_SYSTEM_PROMPT,
      quoteExtractionPrompt: DEFAULT_QUOTE_EXTRACTION_PROMPT,
      quoteRerankPrompt: DEFAULT_QUOTE_RERANK_PROMPT,
    }
  }
}

async function saveConversationExchange({
  messages,
  sessionData,
  assistantText,
  requestContext,
  booqableOrderId,
  booqableOrderUrl,
}: {
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
  sessionData: SessionData
  assistantText: string
  requestContext?: string | null
  booqableOrderId?: string | null
  booqableOrderUrl?: string | null
}): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const organizationId = await getDefaultOrganizationId(supabase)
  const now = new Date().toISOString()
  let conversationId = sessionData.conversationId || null

  const patch: ConversationPatch = {
    organization_id: organizationId,
    contact_name: sessionData.customerName || null,
    contact_email: sessionData.customerEmail || null,
    contact_phone: sessionData.customerPhone || null,
    starts_at: sessionData.startsAt || null,
    stops_at: sessionData.stopsAt || null,
    request_context: requestContext || null,
    source: 'widget',
    status: 'open',
    updated_at: now,
  }

  if (booqableOrderId && booqableOrderUrl) {
    patch.booqable_order_id = booqableOrderId
    patch.booqable_order_url = booqableOrderUrl
  }

  if (conversationId) {
    const { error } = await supabase
      .from('conversations')
      .update(patch)
      .eq('id', conversationId)

    if (error) throw new Error(error.message)
  } else {
    const { data, error } = await supabase
      .from('conversations')
      .insert(patch)
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    conversationId = data?.id || null
  }

  if (!conversationId) return null

  const lastUserMessage = [...messages].reverse().find(message => message.role === 'user')
  const rows: { conversation_id: string; role: string; content: string }[] = []

  if (lastUserMessage) {
    rows.push({
      conversation_id: conversationId,
      role: 'user',
      content: textFromMessage(lastUserMessage),
    })
  }

  if (assistantText.trim()) {
    rows.push({
      conversation_id: conversationId,
      role: 'assistant',
      content: assistantText.trim(),
    })
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('messages').insert(rows)
    if (error) throw new Error(error.message)
  }

  return conversationId
}

// ── Hybrid search ─────────────────────────────────────────────────────────────

async function hybridSearch(query: string, limit = 10): Promise<Product[]> {
  const supabase = getSupabaseAdmin()

  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const embedding = embRes.data[0].embedding

  const { data, error } = await supabase.rpc('search_products', {
    query_text: query,
    query_embedding: JSON.stringify(embedding),
    match_count: limit,
  })

  if (error) {
    console.error('Hybrid search error:', error.message)
    const { data: fallback } = await supabase
      .from('products_cache')
      .select('id, name, description, price_per_day, deposit, photo_url')
      .eq('archived', false)
      .eq('show_in_store', true)
      .ilike('name', `%${query}%`)
      .limit(limit)
    return (fallback || []) as Product[]
  }

  return (data || []) as Product[]
}

async function parseQuoteList(
  req: NextRequest,
  message: string,
  quoteExtractionPrompt: string,
  quoteRerankPrompt: string
): Promise<QuoteParseItem[]> {
  const url = new URL('/api/parse-request', req.url)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, quoteExtractionPrompt, quoteRerankPrompt }),
    cache: 'no-store',
  })

  const data = await res.json() as QuoteParseResponse
  if (!res.ok) throw new Error(data.error || `Parse request failed (${res.status})`)
  return data.items || []
}

function buildQuoteWorkflowResponse(items: QuoteParseItem[], hasDates: boolean): string {
  if (items.length === 0) {
    return "Je n’ai pas réussi à extraire clairement les lignes matériel. Pouvez-vous me renvoyer la liste avec une ligne par article et les quantités ?"
  }

  const strongCount = items.filter(item => item.matched && item.confidence >= 0.8).length
  const uncertainCount = items.length - strongCount
  const parts = [
    `J’ai vérifié ${items.length} ligne${items.length > 1 ? 's' : ''} dans le catalogue, en gardant exactement l’ordre de votre demande.`,
    `${strongCount} correspondance${strongCount > 1 ? 's' : ''} forte${strongCount > 1 ? 's' : ''} ajoutée${strongCount > 1 ? 's' : ''} au brouillon.`,
  ]

  if (uncertainCount > 0) {
    parts.push(`${uncertainCount} ligne${uncertainCount > 1 ? 's' : ''} à choisir ou à laisser à Filme.`)
  }

  parts.push('Vous pouvez supprimer chaque bloc avec ×, ou choisir une option quand le match est incertain.')
  parts.push(hasDates
    ? 'Une fois la liste validée, je vérifierai les disponibilités et les prix sur vos dates.'
    : 'Prochaine étape : indiquez vos dates de location pour vérifier disponibilité et prix.'
  )
  return parts.join('\n')
}

// ── API route ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as IncomingBody
    const incomingMessages = Array.isArray(body.messages) ? body.messages : []
    const sessionData = inferSessionData(incomingMessages, body.sessionData || {})
    const lastUserText = getLastUserText(incomingMessages)
    const previousUserText = getPreviousUserText(incomingMessages)
    const conversationText = incomingMessages.map(textFromMessage).join('\n')
    const forceQuoteMode = sessionData.quoteMode === 'immediate'
    const lastIsDateOnly = Boolean(lastUserText && isDateOnlyResponse(lastUserText))
    const lastLooksLikeQuoteList = Boolean(lastUserText && looksLikeQuoteList(lastUserText, conversationText, forceQuoteMode))
    const previousLooksLikeQuoteList = Boolean(previousUserText && looksLikeQuoteList(previousUserText, conversationText, forceQuoteMode))
    const quoteRequestText = lastLooksLikeQuoteList
      ? lastUserText
      : isBrandClarification(lastUserText) && previousLooksLikeQuoteList
        ? `${previousUserText}\nPrécision client : ${lastUserText}`
        : ''
    const supabaseAdmin = getSupabaseAdmin()
    const { chatSystemPrompt, quoteExtractionPrompt, quoteRerankPrompt } = await getAssistantPromptSettings(supabaseAdmin)
    let knowledgeContext = ''

    if (!quoteRequestText && shouldSearchKnowledge(lastUserText)) {
      try {
        const knowledgeHits = await searchKnowledge(supabaseAdmin, lastUserText, 5)
        knowledgeContext = buildKnowledgeContext(knowledgeHits)
      } catch (err) {
        console.warn('Knowledge context fallback:', err instanceof Error ? err.message : String(err))
      }
    }

    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: `${chatSystemPrompt}${knowledgeContext}` },
      ...incomingMessages,
    ]

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

        let fullResponse = ''
        let requestContext: string | null = null
        let booqableOrderId: string | null = null
        let booqableOrderUrl: string | null = null

        try {
          // ── Dates seules après matching catalogue : on complète le brouillon,
          // sans relancer l'extraction produit.
          if (lastIsDateOnly && hasQuoteDraft(sessionData)) {
            const responseText = `Parfait, j’ai noté les dates ${formatDateRangeForUser(sessionData.startsAt, sessionData.stopsAt)}. Je garde la liste produit déjà préparée.\n\nProchaine étape : vérification des disponibilités et des prix avant préparation du devis.`
            fullResponse += responseText
            send({ type: 'delta', content: responseText })
          } else if (isListConfirmation(lastUserText) && hasQuoteDraft(sessionData)) {
            const unresolvedCount = countUnresolvedQuoteMatches(sessionData.quoteMatches)
            const unresolvedText = unresolvedCount > 0
              ? `\nJ’ai bien noté que ${unresolvedCount} ligne${unresolvedCount > 1 ? 's' : ''} seront laissées à l’équipe Filme pour proposition manuelle.`
              : ''
            const responseText = sessionData.startsAt && sessionData.stopsAt
              ? `Parfait, votre liste est confirmée ${formatDateRangeForUser(sessionData.startsAt, sessionData.stopsAt)}.${unresolvedText}\n\nProchaine étape : vérification des disponibilités et des prix avant préparation du devis.`
              : `Parfait, votre liste est confirmée.${unresolvedText}\n\nIndiquez maintenant vos dates de location pour vérifier les disponibilités et préparer le devis.`
            fullResponse += responseText
            send({ type: 'delta', content: responseText })
          } else if (quoteRequestText) {
            requestContext = quoteRequestText
            const intro = 'Je regarde ce qui est disponible dans notre catalogue !'
            fullResponse += intro
            send({ type: 'delta', content: intro })
            send({ type: 'progress', step: 'parse_request', message: 'Analyse de la liste matériel…' })

            const progressMessages = [
              'Extraction des lignes matériel…',
              'Recherche dans le catalogue Filme…',
              'Comparaison des correspondances…',
              'Préparation des choix produit par produit…',
            ]
            let progressIndex = 0
            const progressTimer = setInterval(() => {
              const message = progressMessages[Math.min(progressIndex, progressMessages.length - 1)]
              progressIndex++
              send({ type: 'progress', step: 'parse_request', message })
            }, 1800)

            let items: QuoteParseItem[] = []
            try {
              items = await parseQuoteList(req, quoteRequestText, quoteExtractionPrompt, quoteRerankPrompt)
            } finally {
              clearInterval(progressTimer)
            }

            send({ type: 'progress', step: 'render_matches', message: `${items.length} ligne${items.length > 1 ? 's' : ''} détectée${items.length > 1 ? 's' : ''}. Affichage des correspondances…` })
            items.forEach((item, index) => {
              send({ type: 'quote_match_item', item, index, total: items.length })
            })
            send({ type: 'quote_matches_done', total: items.length })

            const responseText = buildQuoteWorkflowResponse(items, Boolean(sessionData.startsAt && sessionData.stopsAt))
            fullResponse += `\n\n${responseText}`
            send({ type: 'delta', content: `\n\n${responseText}` })
          } else {
            // ── Step 1: Stream GPT-4o response ───────────────────────────────
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: openaiMessages,
              stream: true,
              temperature: 0.7,
              max_tokens: 800,
            })

            for await (const chunk of completion) {
              const delta = chunk.choices[0]?.delta?.content || ''
              fullResponse += delta

              const display = delta.replace(/\[(?:SEARCH|CREATE_QUOTE)[^\]]*\]/g, '')
              if (display) send({ type: 'delta', content: display })
            }

            // ── Step 2: Hybrid search if AI requested it ─────────────────────
            const searchMatch = fullResponse.match(/\[SEARCH:\s*(.+?)\]/)
            if (searchMatch) {
              const query = searchMatch[1].trim()
              send({ type: 'searching', query })

              const products = await hybridSearch(query, 10)

              if (products.length === 0) {
                const notFound = "\n\nJe n'ai pas trouvé ce produit dans notre catalogue. Pouvez-vous préciser ?"
                fullResponse += notFound
                send({ type: 'delta', content: notFound })
              } else {
                send({ type: 'products', products })

                const selectionPrompt = `Tu es un expert en location audiovisuelle chez Filme.
Le client cherche : "${query}"
Contexte de la conversation : ${incomingMessages.slice(-3).map(m => `${m.role}: ${textFromMessage(m)}`).join(' | ')}

Voici les produits disponibles dans le catalogue :
${products.map((p, i) => `${i + 1}. [${p.id}] ${p.name} — ${compactDescription(p.description) || 'Pas de description'}`).join('\n')}

Sélectionne les 1 à 5 produits les plus pertinents pour la demande du client.
Réponds en JSON : { "selected": [{ "id": "...", "reason": "..." }], "response": "message en français pour le client présentant ces produits sans prix, puis demande les dates si elles manquent" }`

                const selectionRes = await openai.chat.completions.create({
                  model: 'gpt-4o-mini',
                  messages: [{ role: 'user', content: selectionPrompt }],
                  response_format: { type: 'json_object' },
                  temperature: 0.3,
                  max_tokens: 600,
                })

                let selection: SelectionResult = {}
                try {
                  selection = JSON.parse(selectionRes.choices[0].message.content || '{}') as SelectionResult
                } catch {
                  selection = {}
                }

                const selectedProducts = products.filter(product =>
                  selection.selected?.some(selected => selected.id === product.id)
                )
                const finalProducts = selectedProducts.length > 0 ? selectedProducts : products.slice(0, 3)

                send({ type: 'selected_products', products: finalProducts })

                const responseText = selection.response ||
                  `\n\nVoici les correspondances catalogue possibles :\n\n` +
                  finalProducts.map((p, i) =>
                    `**${i + 1}. ${p.name}**`
                  ).join('\n') +
                  `\n\nCes produits vous conviennent-ils ? Indiquez vos dates pour vérifier disponibilité et prix.`

                fullResponse += `\n\n${responseText}`
                send({ type: 'delta', content: `\n\n${responseText}` })
              }
            }

            // ── Step 4: Create Booqable quote if confirmed ───────────────────
            if (fullResponse.includes('[CREATE_QUOTE]') && sessionData.customerEmail) {
              if (!isExplicitQuoteConfirmation(lastUserText)) {
                const needsExplicitConfirmation = "\n\nJ’ai bien noté cette précision. Je ne prépare pas encore le devis : confirmez explicitement la liste validée quand elle vous convient."
                fullResponse += needsExplicitConfirmation
                send({ type: 'delta', content: needsExplicitConfirmation })
              } else if (!sessionData.selectedProductIds || sessionData.selectedProductIds.length === 0) {
                const needsSelection = "\n\nJe ne crée pas encore le devis : aucun produit catalogue n’a été validé. Envoyez ou collez votre liste matériel, puis choisissez les correspondances proposées avant de confirmer."
                fullResponse += needsSelection
                send({ type: 'delta', content: needsSelection })
              } else if (!sessionData.startsAt || !sessionData.stopsAt) {
                const needsDates = "\n\nJe ne prépare pas encore le devis : il me manque les dates de location. Indiquez par exemple « du 21 au 26 juin » pour vérifier les disponibilités."
                fullResponse += needsDates
                send({ type: 'delta', content: needsDates })
              } else {
                send({ type: 'creating_quote' })

                try {
                const booqableBase = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/1`
                const key = process.env.BOOQABLE_API_KEY
                const name = sessionData.customerName || sessionData.customerEmail
                const startsAt = sessionData.startsAt
                const stopsAt = sessionData.stopsAt

                const custRes = await fetch(`${booqableBase}/customers?api_key=${key}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ customer: { name, email: sessionData.customerEmail } }),
                })
                const custData = await custRes.json() as { customer?: { id?: string } }
                const customerId = custData.customer?.id

                const orderRes = await fetch(`${booqableBase}/orders?api_key=${key}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    order: { customer_id: customerId, starts_at: startsAt, stops_at: stopsAt, status: 'concept' },
                  }),
                })
                const orderData = await orderRes.json() as { order?: { id?: string } }
                const orderId = orderData.order?.id

                if (!orderId) throw new Error(`Booqable order error: ${JSON.stringify(orderData)}`)

                if (sessionData.selectedProductIds?.length) {
                  for (const productId of sessionData.selectedProductIds) {
                    await fetch(`${booqableBase}/order_lines?api_key=${key}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ order_line: { order_id: orderId, item_id: productId, quantity: 1 } }),
                    })
                  }
                }

                booqableOrderId = orderId
                booqableOrderUrl = `https://filme.booqable.com/orders/${orderId}`
                send({ type: 'quote_created', orderId, customerId, quoteUrl: booqableOrderUrl })

                const createdText = `\n\n✅ **Demande de devis enregistrée !** Vous recevrez une confirmation à **${sessionData.customerEmail}**.`
                fullResponse += createdText
                send({ type: 'delta', content: createdText })
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err)
                  console.error('Quote error:', msg)
                  const errorText = `\n\nJe n'ai pas pu créer le devis automatiquement (${msg}). Contactez-nous à bonjour@filme.fr.`
                  fullResponse += errorText
                  send({ type: 'delta', content: errorText })
                }
              }
            }
          }

          // ── Step 5: Save conversation to Supabase ─────────────────────────
          try {
            const conversationId = await saveConversationExchange({
              messages: incomingMessages,
              sessionData,
              assistantText: cleanAssistantText(fullResponse),
              requestContext,
              booqableOrderId,
              booqableOrderUrl,
            })

            if (conversationId) send({ type: 'conversation_saved', conversationId })
          } catch (saveErr) {
            const msg = saveErr instanceof Error ? saveErr.message : String(saveErr)
            console.error('Supabase save error:', msg)
            send({ type: 'conversation_save_error', message: msg })
          }

          send({ type: 'done' })
        } catch (err) {
          console.error('Stream error:', err)
          send({ type: 'error', message: 'Une erreur est survenue.' })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (err) {
    console.error('Route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
