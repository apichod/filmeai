import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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
  customerName?: string
  customerEmail?: string
  startsAt?: string
  stopsAt?: string
  selectedProductIds?: string[]
  conversationId?: string
}

// ── Hybrid search ─────────────────────────────────────────────────────────────

async function hybridSearch(query: string, limit = 10): Promise<Product[]> {
  const supabase = getSupabaseAdmin()

  // 1. Generate embedding for the query
  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const embedding = embRes.data[0].embedding

  // 2. Call hybrid search function in Supabase
  const { data, error } = await supabase.rpc('search_products', {
    query_text: query,
    query_embedding: JSON.stringify(embedding),
    match_count: limit,
  })

  if (error) {
    console.error('Hybrid search error:', error.message)
    // Fallback: simple text search
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

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es l'assistant IA de Filme, loueur de matériel audiovisuel à Montreuil (Paris / Île-de-France).
Tu aides les visiteurs à obtenir un devis rapidement.

FLOW DE CONVERSATION :
1. Accueille le visiteur
2. Collecte ces infos UNE PAR UNE :
   - Prénom et nom
   - Email (pour envoyer le devis)
   - Matériel souhaité + contexte du projet (interview, clip, fiction, événement…)
   - Dates de location (début et fin)
3. Quand tu as le matériel et les dates, émets : [SEARCH: terme de recherche principal]
   → Le terme doit être le nom du produit principal (ex: "Profoto B10X", "Sony FX6", "micro cravate")
   → Un seul terme par recherche, le plus spécifique possible
4. Quand les produits sont affichés et le client confirme, émets : [CREATE_QUOTE]

RÈGLES :
- Réponds toujours en français
- Sois concis, professionnel et chaleureux
- Une seule question à la fois
- N'invente jamais de prix ou de produit
- Si plusieurs produits sont demandés, recherche le principal d'abord

INFOS FILME :
- Site : filme.fr | Email : bonjour@filme.fr
- Spécialité : caméra, optique, lumière, son, grip, accessoires cinéma
- Livraison Paris et Île-de-France`

// ── API route ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { messages, sessionData }: { messages: OpenAI.Chat.ChatCompletionMessageParam[], sessionData: SessionData } = body

    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ]

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

        let fullResponse = ''

        try {
          // ── Step 1: Stream GPT-4o response ─────────────────────────────────
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

            // Filter internal commands from display
            const display = delta.replace(/\[(?:SEARCH|CREATE_QUOTE)[^\]]*\]/g, '')
            if (display) {
              send({ type: 'delta', content: display })
            }
          }

          // ── Step 2: Hybrid search if AI requested it ────────────────────────
          const searchMatch = fullResponse.match(/\[SEARCH:\s*(.+?)\]/)
          if (searchMatch) {
            const query = searchMatch[1].trim()
            send({ type: 'searching', query })

            const products = await hybridSearch(query, 10)

            if (products.length === 0) {
              send({ type: 'delta', content: "\n\nJe n'ai pas trouvé ce produit dans notre catalogue. Pouvez-vous préciser ?" })
            } else {
              send({ type: 'products', products })

              // ── Step 3: GPT-4o-mini selects the most relevant products ──────
              const selectionPrompt = `Tu es un expert en location audiovisuelle chez Filme.
Le client cherche : "${query}"
Contexte de la conversation : ${messages.slice(-3).map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : ''}`).join(' | ')}

Voici les produits disponibles dans le catalogue :
${products.map((p, i) => `${i + 1}. [${p.id}] ${p.name} — ${p.price_per_day}€/jour — ${p.description?.slice(0, 150) || 'Pas de description'}`).join('\n')}

Sélectionne les 1 à 5 produits les plus pertinents pour la demande du client.
Réponds en JSON : { "selected": [{ "id": "...", "reason": "..." }], "response": "message en français pour le client présentant ces produits avec leurs prix" }`

              const selectionRes = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: selectionPrompt }],
                response_format: { type: 'json_object' },
                temperature: 0.3,
                max_tokens: 600,
              })

              type SelectionResult = {
                selected?: { id: string; reason: string }[]
                response?: string
              }
              let selection: SelectionResult = {}
              try {
                selection = JSON.parse(selectionRes.choices[0].message.content || '{}') as SelectionResult
              } catch {
                selection = {}
              }

              const selectedProducts = products.filter(p =>
                selection.selected?.some((s: { id: string }) => s.id === p.id)
              )
              const finalProducts = selectedProducts.length > 0 ? selectedProducts : products.slice(0, 3)

              send({ type: 'selected_products', products: finalProducts })

              const responseText = selection.response ||
                `\n\nVoici ce que nous avons :\n\n` +
                finalProducts.map((p, i) =>
                  `**${i + 1}. ${p.name}** — ${p.price_per_day}€/jour (caution ${p.deposit}€)`
                ).join('\n') +
                `\n\nCes produits vous conviennent-ils ? Souhaitez-vous que je crée un devis ?`

              send({ type: 'delta', content: '\n\n' + responseText })
            }
          }

          // ── Step 4: Create Booqable quote if confirmed ──────────────────────
          let booqableOrderId: string | null = null
          let booqableOrderUrl: string | null = null

          if (fullResponse.includes('[CREATE_QUOTE]') && sessionData?.customerEmail) {
            send({ type: 'creating_quote' })

            try {
              const BOOQABLE_BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/1`
              const KEY = process.env.BOOQABLE_API_KEY
              const name = sessionData.customerName || sessionData.customerEmail
              const startsAt = sessionData.startsAt || new Date().toISOString()
              const stopsAt = sessionData.stopsAt || new Date(Date.now() + 3 * 86400000).toISOString()

              // Create customer
              const custRes = await fetch(`${BOOQABLE_BASE}/customers?api_key=${KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer: { name, email: sessionData.customerEmail } }),
              })
              const custData = await custRes.json()
              const customerId = custData.customer?.id

              // Create order
              const orderRes = await fetch(`${BOOQABLE_BASE}/orders?api_key=${KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  order: { customer_id: customerId, starts_at: startsAt, stops_at: stopsAt, status: 'concept' },
                }),
              })
              const orderData = await orderRes.json()
              const orderId = orderData.order?.id

              if (!orderId) throw new Error(`Booqable order error: ${JSON.stringify(orderData)}`)

              // Add products
              if (sessionData.selectedProductIds?.length) {
                for (const productId of sessionData.selectedProductIds) {
                  await fetch(`${BOOQABLE_BASE}/order_lines?api_key=${KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order_line: { order_id: orderId, item_id: productId, quantity: 1 } }),
                  })
                }
              }

              booqableOrderId = orderId as string
              booqableOrderUrl = `https://filme.booqable.com/orders/${orderId}`
              send({ type: 'quote_created', orderId, customerId, quoteUrl: booqableOrderUrl })
              send({ type: 'delta', content: `\n\n✅ **Devis créé !** Vous recevrez une confirmation à **${sessionData.customerEmail}**.\n[Voir le devis →](${booqableOrderUrl})` })

            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              console.error('Quote error:', msg)
              send({ type: 'delta', content: `\n\nJe n'ai pas pu créer le devis automatiquement (${msg}). Contactez-nous à bonjour@filme.fr.` })
            }
          }

          // ── Step 5: Save conversation to Supabase ───────────────────────
          try {
            const supabase = getSupabaseAdmin()
            let conversationId = sessionData?.conversationId || null

            if (conversationId) {
              // Update existing conversation if contact info changed
              const updatePayload: Record<string, string> = {}
              if (sessionData?.customerName) updatePayload.contact_name = sessionData.customerName
              if (sessionData?.customerEmail) updatePayload.contact_email = sessionData.customerEmail
              if (Object.keys(updatePayload).length > 0) {
                await supabase.from('conversations').update(updatePayload).eq('id', conversationId)
              }
            } else {
              // Create new conversation
              const { data: conv } = await supabase
                .from('conversations')
                .insert({
                  contact_name: sessionData?.customerName || null,
                  contact_email: sessionData?.customerEmail || null,
                  status: 'open',
                })
                .select('id')
                .single()
              conversationId = conv?.id || null
            }

            if (conversationId) {
              // Save all messages from this exchange (user messages + AI response)
              const userMessages = (messages as { role: string; content: string }[]).map(m => ({
                conversation_id: conversationId,
                role: m.role,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              }))

              const assistantMessage = {
                conversation_id: conversationId,
                role: 'assistant',
                content: fullResponse.replace(/\[(?:SEARCH|CREATE_QUOTE)[^\]]*\]/g, '').trim(),
              }

              // Only insert user messages that aren't already saved (last user message is new)
              const lastUserMsg = userMessages.filter(m => m.role === 'user').slice(-1)
              await supabase.from('messages').insert([...lastUserMsg, assistantMessage])

              // Update conversation with booqable order if created
              if (booqableOrderId && booqableOrderUrl) {
                await supabase
                  .from('conversations')
                  .update({ booqable_order_id: booqableOrderId, booqable_order_url: booqableOrderUrl })
                  .eq('id', conversationId)
              }

              send({ type: 'conversation_saved', conversationId })
            }
          } catch (saveErr) {
            console.error('Supabase save error:', saveErr)
            // Don't fail the response if saving fails
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
        'Connection': 'keep-alive',
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
