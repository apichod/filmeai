import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
}

type SessionData = {
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  startsAt?: string | null
  stopsAt?: string | null
  selectedProductIds?: string[]
  conversationId?: string | null
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

function parseFrenchDate(value: string): string | null {
  const match = value.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/)
  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const currentYear = new Date().getFullYear()
  let year = match[3] ? Number(match[3]) : currentYear
  if (year < 100) year += 2000
  if (!day || !month || month > 12) return null

  return new Date(Date.UTC(year, month - 1, day, 9, 0, 0)).toISOString()
}

function extractDates(text: string): { startsAt: string | null; stopsAt: string | null } {
  const matches = text.match(/\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?/g) || []
  return {
    startsAt: matches[0] ? parseFrenchDate(matches[0]) : null,
    stopsAt: matches[1] ? parseFrenchDate(matches[1]) : null,
  }
}

function inferSessionData(messages: OpenAI.Chat.ChatCompletionMessageParam[], sessionData: SessionData): SessionData {
  const fullText = messages.map(textFromMessage).join('\n')
  const firstUserText = messages.find(message => message.role === 'user')
  const dates = extractDates(fullText)

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
    startsAt: sessionData.startsAt || dates.startsAt,
    stopsAt: sessionData.stopsAt || dates.stopsAt,
    selectedProductIds: sessionData.selectedProductIds || [],
    conversationId: sessionData.conversationId || null,
  }
}

function looksLikeQuoteList(text: string): boolean {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  const quantityHits = text.match(/(?:^|\n|\s)(?:x|×)?\d+\s*(?:x|×)?\s+[A-Za-zÀ-ÖØ-öø-ÿ0-9]/gi)?.length || 0
  const sectionHits = text.match(/^[A-Za-zÀ-ÖØ-öø-ÿ /&+-]{3,}:\s*$/gm)?.length || 0

  return (
    lines.length >= 5 && quantityHits >= 3
  ) || (
    lines.length >= 8 && sectionHits >= 1
  ) || (
    /devis|liste|mat[eé]riel|location/i.test(text) && quantityHits >= 2
  )
}

function formatPrice(value: number | null): string {
  if (typeof value !== 'number') return 'prix à confirmer'
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}€/j`
}

function compactDescription(value: string | null): string {
  if (!value) return ''
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 180)
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
      .ilike('name', `%${query}%`)
      .limit(limit)
    return (fallback || []) as Product[]
  }

  return (data || []) as Product[]
}

async function parseQuoteList(req: NextRequest, message: string): Promise<QuoteParseItem[]> {
  const url = new URL('/api/parse-request', req.url)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    cache: 'no-store',
  })

  const data = await res.json() as QuoteParseResponse
  if (!res.ok) throw new Error(data.error || `Parse request failed (${res.status})`)
  return data.items || []
}

function buildQuoteWorkflowResponse(items: QuoteParseItem[]): string {
  if (items.length === 0) {
    return "Je n’ai pas réussi à extraire clairement les lignes matériel. Pouvez-vous me renvoyer la liste avec une ligne par article et les quantités ?"
  }

  const found = items.filter(item => item.matched && item.confidence >= 0.5)
  const uncertain = items.filter(item => !item.matched || item.confidence < 0.5)
  const lines: string[] = []

  lines.push("Voici ce que j’ai trouvé dans notre catalogue. J’ai gardé l’ordre de votre liste pour que ce soit simple à vérifier.")

  if (found.length > 0) {
    lines.push('', '**Trouvés**')
    let currentSection: string | null = null
    for (const item of found) {
      if (item.section && item.section !== currentSection) {
        currentSection = item.section
        lines.push('', `**${item.section.toUpperCase()}**`)
      }
      const product = item.matched!
      const confidence = Math.round((item.confidence || 0) * 100)
      lines.push(`✓ ${item.quantity}× ${product.name} — ${formatPrice(product.price_per_day)} (${confidence}% match)`)
    }
  }

  if (uncertain.length > 0) {
    lines.push('', '**À préciser / à valider**')
    for (const item of uncertain.slice(0, 8)) {
      lines.push(`! ${item.quantity}× « ${item.requestedName} » — lequel exactement ?`)
      const alternatives = item.alternatives?.slice(0, 3) || []
      for (const alternative of alternatives) {
        lines.push(`  • ${alternative.name} — ${formatPrice(alternative.price_per_day)}`)
      }
      if (alternatives.length === 0) lines.push('  • Je peux laisser l’équipe Filme faire une proposition.')
    }

    if (uncertain.length > 8) {
      lines.push(`  • ${uncertain.length - 8} autre(s) ligne(s) à vérifier.`)
    }
  }

  lines.push('', 'Confirmez-moi les lignes à préciser, et je prépare ensuite le devis complet.')
  return lines.join('\n')
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es l'assistant IA de Filme, loueur de matériel audiovisuel à Montreuil (Paris / Île-de-France).
Tu aides les visiteurs à obtenir un devis rapidement.

FLOW STANDARD :
1. Accueille le visiteur.
2. Collecte ces infos UNE PAR UNE : prénom/nom, email, matériel souhaité, dates de location.
3. Si le client veut faire un devis sur liste, demande-lui de coller la liste avec quantités et dates.
4. Quand tu as une demande produit simple, émets : [SEARCH: terme de recherche principal]
5. Quand les produits sont affichés et le client confirme, émets : [CREATE_QUOTE]

STYLE POUR UNE DEMANDE DEVIS SUR LISTE :
- Commence par : "Avec plaisir ! Collez votre liste de matériel..." si la liste n'est pas encore fournie.
- Une fois la liste fournie, sois court : "Je regarde ce qui est disponible dans notre catalogue !"
- Ne réécris pas toute la liste client en prose.
- Explique ensuite les lignes trouvées et les lignes à préciser.
- N'invente jamais de prix ou de produit.

RÈGLES :
- Réponds toujours en français.
- Sois concis, professionnel et chaleureux.
- Une seule question à la fois.
- Si plusieurs produits sont demandés en liste, le backend analysera chaque ligne : ne lance pas une recherche unique globale.

INFOS FILME :
- Site : filme.fr | Email : bonjour@filme.fr
- Spécialité : caméra, optique, lumière, son, grip, accessoires cinéma
- Livraison Paris et Île-de-France`

// ── API route ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as IncomingBody
    const incomingMessages = Array.isArray(body.messages) ? body.messages : []
    const sessionData = inferSessionData(incomingMessages, body.sessionData || {})
    const lastUserText = getLastUserText(incomingMessages)

    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
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
          // ── Mode liste matériel / workflow devis ───────────────────────────
          if (lastUserText && looksLikeQuoteList(lastUserText)) {
            requestContext = lastUserText
            const intro = 'Je regarde ce qui est disponible dans notre catalogue !'
            fullResponse += intro
            send({ type: 'delta', content: intro })
            send({ type: 'progress', step: 'parse_request', message: 'Analyse de la liste matériel…' })

            const items = await parseQuoteList(req, lastUserText)
            const foundProducts = items
              .filter(item => item.matched && item.confidence >= 0.5)
              .map(item => item.matched as Product)

            send({ type: 'quote_matches', items })
            if (foundProducts.length > 0) send({ type: 'products', products: foundProducts })

            const responseText = buildQuoteWorkflowResponse(items)
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
${products.map((p, i) => `${i + 1}. [${p.id}] ${p.name} — ${p.price_per_day}€/jour — ${compactDescription(p.description) || 'Pas de description'}`).join('\n')}

Sélectionne les 1 à 5 produits les plus pertinents pour la demande du client.
Réponds en JSON : { "selected": [{ "id": "...", "reason": "..." }], "response": "message en français pour le client présentant ces produits avec leurs prix" }`

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
                  `\n\nVoici ce que nous avons :\n\n` +
                  finalProducts.map((p, i) =>
                    `**${i + 1}. ${p.name}** — ${formatPrice(p.price_per_day)} (caution ${p.deposit ?? 'à confirmer'}€)`
                  ).join('\n') +
                  `\n\nCes produits vous conviennent-ils ? Souhaitez-vous que je crée un devis ?`

                fullResponse += `\n\n${responseText}`
                send({ type: 'delta', content: `\n\n${responseText}` })
              }
            }

            // ── Step 4: Create Booqable quote if confirmed ───────────────────
            if (fullResponse.includes('[CREATE_QUOTE]') && sessionData.customerEmail) {
              send({ type: 'creating_quote' })

              try {
                const booqableBase = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/1`
                const key = process.env.BOOQABLE_API_KEY
                const name = sessionData.customerName || sessionData.customerEmail
                const startsAt = sessionData.startsAt || new Date().toISOString()
                const stopsAt = sessionData.stopsAt || new Date(Date.now() + 3 * 86400000).toISOString()

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

                const createdText = `\n\n✅ **Devis créé !** Vous recevrez une confirmation à **${sessionData.customerEmail}**.\n[Voir le devis →](${booqableOrderUrl})`
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
