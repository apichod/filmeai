import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import {
  fetchOrderByNumber,
  createSAVOrder,
  addTagToOrder,
  addInternalNote,
  addSAVComment,
  searchProducts,
  addSAVLine,
} from '@/lib/booqable-orders'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Outils disponibles pour l'IA ──────────────────────────────────────────────

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_order',
      description: 'Récupère les détails d\'une order Booqable par son numéro',
      parameters: {
        type: 'object',
        properties: {
          order_number: { type: 'string', description: 'Numéro de l\'order à récupérer' },
        },
        required: ['order_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_internal_note',
      description: 'Ajoute une note interne à l\'order Booqable',
      parameters: {
        type: 'object',
        properties: {
          order_id:  { type: 'string', description: 'UUID Booqable de l\'order — utiliser le champ "id" retourné par fetch_order, PAS le numéro lisible' },
          note:      { type: 'string', description: 'Texte de la note interne' },
        },
        required: ['order_id', 'note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_sav_order',
      description: 'Crée une nouvelle order SAV dans Booqable pour le même client',
      parameters: {
        type: 'object',
        properties: {
          customer_id:   { type: 'string', description: 'UUID Booqable du client — utiliser le champ "customer_id" retourné par fetch_order' },
          products:      {
            type: 'array',
            description: 'Liste des produits à inclure',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'string' },
                quantity:   { type: 'number' },
              },
              required: ['product_id', 'quantity'],
            },
          },
          full_discount: { type: 'boolean', description: 'Si true → remise 100%, caution = aucune (matériel manquant)' },
          return_days:   { type: 'number',  description: 'Durée en jours avant retour (défaut 30)' },
        },
        required: ['customer_id', 'products'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_tag',
      description: 'Ajoute un tag à une order Booqable (LATE ou TOBEREPAIRED)',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la SAV order — utiliser le champ "id" retourné par create_sav_order' },
          tag:      { type: 'string', description: 'LATE ou TOBEREPAIRED', enum: ['LATE', 'TOBEREPAIRED'] },
        },
        required: ['order_id', 'tag'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_sav_comment',
      description: 'Ajoute le commentaire SAV à la SAV order (numéro order origine + détail)',
      parameters: {
        type: 'object',
        properties: {
          order_id:             { type: 'string', description: 'UUID Booqable de la SAV order — utiliser le champ "id" retourné par create_sav_order' },
          origin_order_number:  { type: 'string', description: 'Numéro de l\'order d\'origine' },
          comment:              { type: 'string', description: 'Détail du problème (et cas si cassé)' },
        },
        required: ['order_id', 'origin_order_number', 'comment'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Cherche un produit dans le catalogue Booqable par nom. Retourne le type (bulk/trackable) pour chaque résultat. À appeler pour chaque article endommagé avant de créer la SAV order.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom ou description du produit à chercher' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_sav_line',
      description: 'Ajoute une ligne à la SAV order. Pour un produit trouvé dans le catalogue (bulk ou trackable) : utiliser type=product avec product_group_id. Pour un article non référencé : utiliser type=custom avec un titre descriptif.',
      parameters: {
        type: 'object',
        properties: {
          order_id:         { type: 'string', description: 'UUID de la SAV order (champ "id" de create_sav_order)' },
          line_type:        { type: 'string', enum: ['product', 'custom'], description: '"product" si trouvé dans le catalogue, "custom" sinon' },
          product_group_id: { type: 'string', description: 'ID du product_group Booqable (si line_type=product)' },
          custom_title:     { type: 'string', description: 'Nom descriptif (si line_type=custom)' },
          quantity:         { type: 'number', description: 'Quantité' },
          note:             { type: 'string', description: 'Note optionnelle (numéro de série, détail du problème)' },
        },
        required: ['order_id', 'line_type', 'quantity'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_case',
      description: 'Enregistre le cas dans le tableau de suivi FilmeAI',
      parameters: {
        type: 'object',
        properties: {
          origin_order:       { type: 'string', description: 'Numéro de l\'order d\'origine' },
          origin_order_id:    { type: 'string', description: 'ID Booqable de l\'order d\'origine' },
          sav_order_id:       { type: 'string', description: 'ID Booqable de la SAV order créée' },
          problem_type:       { type: 'string', description: 'manquant ou casse', enum: ['manquant', 'casse'] },
          problem_description:{ type: 'string', description: 'Description du problème' },
          metadata:           { type: 'object', description: 'Infos supplémentaires (assurance, caution, cas, etc.)' },
        },
        required: ['origin_order', 'problem_type', 'problem_description'],
      },
    },
  },
]

// ── Exécution des outils ──────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ result: string; caseId?: string }> {
  try {
    switch (name) {

      case 'fetch_order': {
        const order = await fetchOrderByNumber(String(args.order_number))
        if (!order) return { result: `Aucune order trouvée avec le numéro ${args.order_number}` }
        const lines = order.lines?.map(l => `${l.quantity}× ${l.product_name}`).join(', ') || 'aucun article'
        return {
          result: JSON.stringify({
            id: order.id,
            number: order.number,
            status: order.status,
            customer: order.customer?.name,
            customer_id: order.customer_id,
            starts_at: order.starts_at,
            stops_at: order.stops_at,
            tags: order.tags,
            lines,
            note_interne: order.properties_attributes?.note_interne || null,
          }),
        }
      }

      case 'add_internal_note': {
        await addInternalNote(String(args.order_id), String(args.note))
        return { result: `✓ Note interne ajoutée à l'order ${args.order_id}` }
      }

      case 'create_sav_order': {
        const products = (args.products as Array<{ product_id: string; quantity: number }>) || []
        const sav = await createSAVOrder({
          customerId:   String(args.customer_id),
          products:     products.map(p => ({ productId: p.product_id, quantity: p.quantity })),
          fullDiscount: Boolean(args.full_discount),
          returnDays:   typeof args.return_days === 'number' ? args.return_days : 30,
        })
        if (!sav) return { result: 'Erreur : SAV order non créée' }
        return { result: JSON.stringify({ id: sav.id, number: sav.number, status: sav.status }) }
      }

      case 'add_tag': {
        await addTagToOrder(String(args.order_id), String(args.tag))
        return { result: `✓ Tag ${args.tag} ajouté à l'order ${args.order_id}` }
      }

      case 'add_sav_comment': {
        await addSAVComment(
          String(args.order_id),
          String(args.origin_order_number),
          String(args.comment)
        )
        return { result: `✓ Commentaire SAV ajouté (order origine: ${args.origin_order_number})` }
      }

      case 'search_products': {
        const results = await searchProducts(String(args.query))
        if (results.length === 0) {
          return { result: `Aucun produit trouvé pour "${args.query}" dans le catalogue Booqable. Il faudra créer une ligne custom.` }
        }
        const summary = results.map(r =>
          `- ${r.name} | id: ${r.id} | tracking: ${r.tracking}${r.price_per_day ? ` | ${r.price_per_day}€/j` : ''}`
        ).join('\n')
        return { result: `Produits trouvés :\n${summary}` }
      }

      case 'add_sav_line': {
        const orderId = String(args.order_id)
        const qty = typeof args.quantity === 'number' ? args.quantity : 1

        if (args.line_type === 'product' && args.product_group_id) {
          await addSAVLine({ type: 'product', orderId, productGroupId: String(args.product_group_id), quantity: qty })
          return { result: `✓ Ligne produit ajoutée à la SAV order (product_group_id: ${args.product_group_id}, qté: ${qty})` }
        } else {
          const title = args.custom_title ? String(args.custom_title) : 'Article non référencé'
          await addSAVLine({ type: 'custom', orderId, title, quantity: qty, note: args.note ? String(args.note) : undefined })
          return { result: `✓ Ligne custom ajoutée : "${title}" (qté: ${qty})` }
        }
      }

      case 'log_case': {
        const supabase = getSupabaseAdmin()
        const { data, error } = await supabase
          .from('return_cases')
          .insert({
            origin_order:        args.origin_order,
            origin_order_id:     args.origin_order_id || null,
            sav_order_id:        args.sav_order_id || null,
            problem_type:        args.problem_type,
            problem_description: args.problem_description,
            metadata:            args.metadata || {},
            status:              'open',
          })
          .select('id, case_number')
          .single()

        if (error) return { result: `Erreur lors du log du cas: ${error.message}` }
        return {
          result: `✓ Cas #${data.case_number} loggué avec succès (ID: ${data.id})`,
          caseId: data.id,
        }
      }

      default:
        return { result: `Outil inconnu: ${name}` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { result: `Erreur lors de l'exécution de ${name}: ${msg}` }
  }
}

// ── Route principale ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    messages: OpenAI.Chat.ChatCompletionMessageParam[]
    workflowSlug?: string  // 'manquant' | 'casse' (facultatif, l'IA détecte)
    caseId?: string
  }

  const { messages, caseId = null } = body

  // Charge le prompt système depuis la DB (ou fallback)
  const supabase = getSupabaseAdmin()
  const { data: workflows } = await supabase
    .from('return_workflows')
    .select('slug, prompt')
    .eq('is_active', true)

  const combinedPrompt = (workflows || [])
    .map(w => w.prompt)
    .join('\n\n---\n\n')

  const uuidReminder = `
RÈGLES CRITIQUES :

IDs Booqable :
- fetch_order retourne "id" (UUID ex: "f0d5301b-...") et "number" (ex: "8648"). Utilise TOUJOURS "id" pour add_internal_note, add_tag, add_sav_comment — jamais le "number".
- create_sav_order retourne aussi un "id" (UUID) : utilise-le pour add_tag, add_sav_comment, add_sav_line.
- customer_id dans create_sav_order = champ "customer_id" de fetch_order.

Identification des articles endommagés (étape obligatoire avant create_sav_order) :
1. Pour chaque article signalé, appelle search_products avec son nom.
2. Si résultat trouvé avec tracking=bulk → pas besoin de préciser l'unité, utilise product_group_id.
3. Si résultat trouvé avec tracking=trackable → demande à l'utilisateur de préciser l'unité (numéro de série ou identifiant). Utilise quand même le product_group_id pour la ligne (l'affectation de l'unité se fait dans Booqable).
4. Si aucun résultat → crée une ligne custom avec le nom descriptif.
5. Plusieurs articles possibles : traite-les un par un.
6. Ajoute les lignes avec add_sav_line APRÈS avoir créé la SAV order.`

  const systemPrompt = combinedPrompt
    ? combinedPrompt + '\n\n' + uuidReminder
    : `Tu es un assistant de gestion des retours. Guide le responsable de stock étape par étape.\n\n${uuidReminder}`

  const systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
    role: 'system',
    content: systemPrompt,
  }

  // Streaming avec tool use
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()

      function send(data: string) {
        controller.enqueue(enc.encode(`data: ${data}\n\n`))
      }

      try {
        let currentMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          systemMessage,
          ...messages,
        ]
        let currentCaseId = caseId

        // Boucle agent (gère les tool_calls)
        while (true) {
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: currentMessages,
            tools: TOOLS,
            tool_choice: 'auto',
            stream: true,
            temperature: 0.3,
          })

          let assistantContent = ''
          const toolCallsAccum: Record<string, { name: string; arguments: string }> = {}

          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta

            // Texte de l'assistant → stream au client
            if (delta?.content) {
              assistantContent += delta.content
              send(JSON.stringify({ type: 'text', content: delta.content }))
            }

            // Accumulation des tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = String(tc.index)
                if (!toolCallsAccum[idx]) {
                  toolCallsAccum[idx] = { name: tc.function?.name || '', arguments: '' }
                }
                if (tc.function?.name) toolCallsAccum[idx].name = tc.function.name
                if (tc.function?.arguments) toolCallsAccum[idx].arguments += tc.function.arguments
              }
            }
          }

          // Pas de tool calls → conversation terminée
          const toolCalls = Object.values(toolCallsAccum)
          if (toolCalls.length === 0) break

          // Ajoute le message assistant avec les tool calls
          const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
            role: 'assistant',
            content: assistantContent || null,
            tool_calls: Object.entries(toolCallsAccum).map(([idx, tc]) => ({
              id: `call_${idx}_${Date.now()}`,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            })),
          }
          currentMessages = [...currentMessages, assistantMessage]

          // Exécute chaque tool call
          for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i]
            const toolCallId = `call_${i}_${Date.now()}`

            send(JSON.stringify({ type: 'tool_call', name: tc.name }))

            let args: Record<string, unknown> = {}
            try { args = JSON.parse(tc.arguments) } catch { /* ignore */ }

            const { result, caseId: newCaseId } = await executeTool(tc.name, args)
            if (newCaseId) currentCaseId = newCaseId

            send(JSON.stringify({ type: 'tool_result', name: tc.name, result }))

            currentMessages = [
              ...currentMessages,
              {
                role: 'tool' as const,
                tool_call_id: toolCallId,
                content: result,
              },
            ]
          }
        }

        // Fin du stream
        send(JSON.stringify({ type: 'done', caseId: currentCaseId }))
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        send(JSON.stringify({ type: 'error', message: msg }))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection:      'keep-alive',
    },
  })
}
