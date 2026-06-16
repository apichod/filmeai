import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type BooqableProduct = {
  id: string
  name: string
  archived: boolean
  base_price_as_decimal: string
  deposit_as_decimal: string
  description?: string
  photo_url?: string
}
const BOOQABLE_BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/1`
const BOOQABLE_KEY = process.env.BOOQABLE_API_KEY

// ── Booqable helpers ─────────────────────────────────────────────────────────

async function searchProducts(query: string) {
  const url = `${BOOQABLE_BASE}/products?api_key=${BOOQABLE_KEY}&q=${encodeURIComponent(query)}&per=10`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return (data.products || [])
    .filter((p: BooqableProduct) => !p.archived)
    .map((p: BooqableProduct) => ({
      id: p.id,
      name: p.name,
      price_per_day: p.base_price_as_decimal,
      deposit: p.deposit_as_decimal,
      description: p.description?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
      photo_url: p.photo_url || null,
    }))
}

async function createOrder(
  customerName: string,
  customerEmail: string,
  startsAt: string,
  stopsAt: string
) {
  // 1. Create or find customer
  const customerRes = await fetch(`${BOOQABLE_BASE}/customers?api_key=${BOOQABLE_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: customerName,
        email: customerEmail,
      },
    }),
  })
  const customerData = await customerRes.json()
  const customerId = customerData.customer?.id

  // 2. Create order
  const orderRes = await fetch(`${BOOQABLE_BASE}/orders?api_key=${BOOQABLE_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order: {
        customer_id: customerId,
        starts_at: startsAt,
        stops_at: stopsAt,
        status: 'concept',
      },
    }),
  })
  const orderData = await orderRes.json()
  return { orderId: orderData.order?.id, customerId }
}

async function addOrderLine(orderId: string, productId: string, quantity: number = 1) {
  const res = await fetch(`${BOOQABLE_BASE}/order_lines?api_key=${BOOQABLE_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_line: {
        order_id: orderId,
        item_id: productId,
        quantity,
      },
    }),
  })
  return res.json()
}

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es l'assistant IA de Filme, une société de location de matériel audiovisuel basée à Montreuil (livraison sur Paris et Île-de-France).
Tu aides les visiteurs à obtenir un devis de location rapidement.

TON RÔLE :
1. Accueille chaleureusement le visiteur
2. Collecte ces informations étape par étape (une question à la fois) :
   - Prénom et nom
   - Email (pour envoyer le devis)
   - Matériel souhaité (caméra, objectif, lumière, son, accessoires, etc.)
   - Dates de location (début et fin)
3. Une fois que tu as toutes les infos, dis : "[SEARCH_PRODUCTS: {query}]" où query est le terme de recherche pour Booqable
4. Quand tu reçois les résultats produits, propose-les avec les prix
5. Quand le client confirme sa sélection, dis : "[CREATE_QUOTE]"

RÈGLES :
- Réponds toujours en français
- Sois concis et professionnel mais chaleureux
- Ne pose qu'une seule question à la fois
- Si le client demande un produit spécifique, recherche-le directement
- Les prix sont en euros HT par jour
- Si tu n'as pas encore les infos client, collecte-les avant de créer un devis

INFOS FILME :
- Site : filme.fr
- Spécialité : matériel cinéma, photo, son, lumière, grip, accessoires
- Zone : Paris et Île-de-France
- Contact : bonjour@filme.fr`

// ── API route ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { messages, sessionData } = body

    // Build messages for OpenAI
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ]

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = ''
        let productResults: { id: string; name: string; price_per_day: string; deposit: string; description: string; photo_url: string | null }[] = []

        try {
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: openaiMessages,
            stream: true,
            temperature: 0.7,
            max_tokens: 1000,
          })

          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content || ''
            fullResponse += delta

            // Stream to client — filter out internal commands from display
            const displayDelta = delta.replace(/\[(?:SEARCH_PRODUCTS|CREATE_QUOTE)[^\]]*\]/g, '')
            if (displayDelta) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: displayDelta })}\n\n`))
            }
          }

          // ── Handle SEARCH_PRODUCTS command ────────────────────────────────
          const searchMatch = fullResponse.match(/\[SEARCH_PRODUCTS:\s*(.+?)\]/)
          if (searchMatch) {
            const query = searchMatch[1].trim()
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'searching', query })}\n\n`))

            productResults = await searchProducts(query)

            if (productResults.length === 0) {
              const noResults = "\n\nJe n'ai pas trouvé de produits correspondants dans notre catalogue. Pouvez-vous préciser votre demande ?"
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: noResults })}\n\n`))
            } else {
              // Let GPT format the results
              const resultsMsg = `Voici les produits disponibles chez Filme :\n\n` +
                productResults.map((p, i) =>
                  `**${i + 1}. ${p.name}**\n- Prix : ${p.price_per_day}€/jour\n- Caution : ${p.deposit}€\n${p.description ? `- ${p.description}` : ''}`
                ).join('\n\n') +
                `\n\nCes produits correspondent-ils à votre besoin ? Souhaitez-vous que je crée un devis ?`

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'products', products: productResults })}\n\n`))
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: '\n\n' + resultsMsg.split('\n\n').slice(1).join('\n\n') })}\n\n`))
              // Send the product list text
              const productText = `\n\nVoici ce que nous avons :\n\n` + productResults.map((p, i) =>
                `**${i + 1}. ${p.name}** — ${p.price_per_day}€/jour (caution ${p.deposit}€)`
              ).join('\n') + `\n\nSouhaitez-vous que je crée un devis avec ces articles ?`
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: productText })}\n\n`))
            }
          }

          // ── Handle CREATE_QUOTE command ────────────────────────────────────
          const createQuoteMatch = fullResponse.includes('[CREATE_QUOTE]')
          if (createQuoteMatch && sessionData?.customerName && sessionData?.customerEmail) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'creating_quote' })}\n\n`))

            try {
              const { orderId } = await createOrder(
                sessionData.customerName,
                sessionData.customerEmail,
                sessionData.startsAt || new Date().toISOString(),
                sessionData.stopsAt || new Date(Date.now() + 86400000).toISOString()
              )

              if (orderId && sessionData.selectedProductIds?.length) {
                for (const productId of sessionData.selectedProductIds) {
                  await addOrderLine(orderId, productId)
                }
              }

              const quoteUrl = `https://filme.booqable.com/orders/${orderId}`
              const quoteMsg = `\n\n✅ **Votre devis a été créé !**\n\nVous recevrez une confirmation à **${sessionData.customerEmail}**.\nVous pouvez aussi consulter votre devis ici : ${quoteUrl}`
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'quote_created', orderId, quoteUrl })}\n\n`))
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: quoteMsg })}\n\n`))
            } catch (err) {
              console.error('Quote creation error:', err)
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: '\n\nJe rencontre une difficulté pour créer le devis. Veuillez contacter bonjour@filme.fr' })}\n\n`))
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
        } catch (err) {
          console.error('Stream error:', err)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Une erreur est survenue.' })}\n\n`))
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
