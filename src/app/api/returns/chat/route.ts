import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import nodemailer from 'nodemailer'
import { renderEmail, type EmailTemplateId } from '@/lib/email-templates'
import {
  fetchOrderByNumber,
  createSAVOrder,
  addTagToOrder,
  addInternalNote,
  addSAVComment,
  searchProducts,
  getStockItems,
  addSAVLine,
  startSAVOrder,
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
      description: 'Récupère les détails d\'une order Booqable par son numéro. Retourne les lignes enrichies avec product_name, product_group_id, stock_item_id et stock_item_label (ex: "ID-2"). Si product_group_id et stock_item_id sont présents dans une ligne, tu peux passer directement à create_sav_order sans appeler search_products ni get_stock_items.',
      parameters: {
        type: 'object',
        properties: {
          order_number: { type: 'string', description: 'Numéro de l\'order à récupérer' },
        },
        required: ['order_number'],
      },
    },
  },
  // add_internal_note retiré du workflow automatique (disponible en cas de besoin manuel uniquement)
  {
    type: 'function',
    function: {
      name: 'create_sav_order',
      description: 'Crée une nouvelle order SAV vide dans Booqable pour le même client. NE PAS passer de produits ici — les ajouter ensuite avec add_sav_line.',
      parameters: {
        type: 'object',
        properties: {
          customer_id:   { type: 'string', description: 'UUID Booqable du client — utiliser le champ "customer_id" retourné par fetch_order' },
          full_discount: { type: 'boolean', description: 'Si true → remise 100%, caution = aucune (matériel manquant)' },
          return_days:   { type: 'number',  description: 'Durée en jours avant retour (défaut 30)' },
        },
        required: ['customer_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_tag',
      description: 'Ajoute un ou plusieurs tags à une SAV order Booqable. Pour une casse : tags=["LATE","TO_BE_REPAIRED"]. Pour un retard seul : tags=["LATE"].',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la SAV order — utiliser le champ "id" retourné par create_sav_order' },
          tags: {
            type: 'array',
            items: { type: 'string', enum: ['LATE', 'TO_BE_REPAIRED'] },
            description: 'Liste de tags à ajouter. Casse → ["TO_BE_REPAIRED","LATE"]. Retard → ["LATE"].',
          },
        },
        required: ['order_id', 'tags'],
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
      name: 'get_stock_items',
      description: 'Récupère tous les exemplaires (stock items) d\'un produit trackable. Appelle cette fonction avec le productGroupId retourné par search_products dès que tracking=trackable. Retourne la liste des unités avec leur UUID et identifiant (ex: "camera-sony-fx3-nue-id-2"). Quand l\'utilisateur dit "ID-2", trouve l\'item dont l\'identifier se termine par "-2" et utilise son UUID comme stock_item_id dans add_sav_line.',
      parameters: {
        type: 'object',
        properties: {
          product_group_id: { type: 'string', description: 'UUID du product_group Booqable (champ "id" de search_products)' },
        },
        required: ['product_group_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_sav_line',
      description: 'Ajoute une ligne à la SAV order. Pour un produit trackable avec unité identifiée : utiliser type=product avec product_group_id ET stock_item_id. Pour un produit bulk : utiliser type=product avec product_group_id seul. Pour un article non référencé : utiliser type=custom avec un titre descriptif.',
      parameters: {
        type: 'object',
        properties: {
          order_id:         { type: 'string', description: 'UUID de la SAV order (champ "id" de create_sav_order)' },
          line_type:        { type: 'string', enum: ['product', 'custom'], description: '"product" si trouvé dans le catalogue, "custom" sinon' },
          product_group_id: { type: 'string', description: 'ID du product_group Booqable (si line_type=product)' },
          stock_item_id:    { type: 'string', description: 'UUID du stock item spécifique (si produit trackable — obtenu via get_stock_items)' },
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
  {
    type: 'function',
    function: {
      name: 'draft_email',
      description: `Génère un email client à partir de la bibliothèque de templates Filme. À appeler après log_case.
Templates disponibles :
- retour_ok : #10 tout est OK, pas de problème
- retour_casse : #11 contrôle retour matériel cassé (requiert insurance, caution)
- retour_manquant : #11 contrôle retour matériel manquant
- facturation_casse : #12 facture réparation (requiert insurance, caution, amount_above_500)
- facturation_perdu : #12 facture perte matériel (requiert insurance, caution)
- facturation_vole : #12 facture vol matériel (requiert insurance, caution, amount_above_500)`,
      parameters: {
        type: 'object',
        properties: {
          template_id:         { type: 'string', enum: ['retour_ok','retour_casse','retour_manquant','facturation_casse','facturation_perdu','facturation_vole'], description: 'ID du template à utiliser' },
          insurance:           { type: 'boolean', description: 'Le client a souscrit à l\'assurance' },
          caution:             { type: 'boolean', description: 'Une caution est active sur l\'order' },
          amount_above_500:    { type: 'boolean', description: 'Montant réparation/remplacement > 500 € (pour templates facturation avec franchise)' },
          late_payment:        { type: 'boolean', description: 'Cas retard de paiement (templates facturation uniquement)' },
          customer_name:       { type: 'string', description: 'Prénom/nom du client' },
          customer_email:      { type: 'string', description: 'Email du client (champ customer_email de fetch_order)' },
          order_number:        { type: 'string', description: 'Numéro de location (pour retour_ok)' },
          origin_order_number: { type: 'string', description: 'Numéro de l\'order d\'origine (order_sav)' },
          sav_comment:         { type: 'string', description: 'Détail du problème (notes_sav)' },
          payment_link:        { type: 'string', description: 'Lien paiement CB (templates facturation)' },
          document_number:     { type: 'string', description: 'Numéro de facture Booqable (templates facturation)' },
        },
        required: ['template_id', 'customer_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Envoie l\'email au client. À appeler UNIQUEMENT si l\'opérateur a confirmé l\'envoi.',
      parameters: {
        type: 'object',
        properties: {
          to:      { type: 'string', description: 'Adresse email du destinataire' },
          subject: { type: 'string', description: 'Objet de l\'email' },
          body:    { type: 'string', description: 'Corps de l\'email (texte brut)' },
        },
        required: ['to', 'subject', 'body'],
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

        // Lignes structurées : product_name + product_group_id + stock_item_id (si trackable assigné)
        const linesStructured = (order.lines || []).map(l => {
          const stockLabel = l.stock_item_identifier
            ? (() => {
                const m = l.stock_item_identifier.match(/-(\d+)$/)
                return m ? `ID-${m[1]}` : l.stock_item_identifier
              })()
            : null
          return {
            product_name: l.product_name,
            quantity: l.quantity,
            product_group_id: l.product_group_id || null,
            stock_item_id: l.stock_item_id || null,
            stock_item_label: stockLabel, // ex: "ID-2" — utile si l'exemplaire est déjà connu
          }
        })

        return {
          result: JSON.stringify({
            id: order.id,
            number: order.number,
            status: order.status,
            customer: order.customer?.name,
            customer_email: order.customer?.email || null,
            customer_id: order.customer_id,
            starts_at: order.starts_at,
            stops_at: order.stops_at,
            tags: order.tags,
            lines: linesStructured,
            note_interne: order.properties_attributes?.note_interne || null,
          }),
        }
      }

      case 'add_internal_note': {
        await addInternalNote(String(args.order_id), String(args.note))
        return { result: `✓ Note interne : ${String(args.note)}` }
      }

      case 'create_sav_order': {
        const sav = await createSAVOrder({
          customerId:   String(args.customer_id),
          fullDiscount: Boolean(args.full_discount),
          returnDays:   typeof args.return_days === 'number' ? args.return_days : 30,
        })
        if (!sav) return { result: 'Erreur : SAV order non créée' }
        const numDisplay = sav.number ? ` (numéro: ${sav.number})` : ''
        return { result: `✓ SAV order créée${numDisplay} | id: ${sav.id} | status: ${sav.status}\nUtilise cet "id" pour add_sav_line, add_tag, add_sav_comment.` }
      }

      case 'add_tag': {
        const tagList = Array.isArray(args.tags) ? args.tags.map(String) : [String(args.tags || args.tag || '')]
        await addTagToOrder(String(args.order_id), tagList)
        // Pickup automatique après ajout des tags (toutes les lignes sont déjà ajoutées à ce stade)
        const { error: startErr } = await startSAVOrder(String(args.order_id))
        let result = `✓ Tags ajoutés : ${tagList.join(', ')}`
        if (startErr) result += ` | ⚠️ Pickup non bloquant : ${startErr}`
        return { result }
      }

      case 'add_sav_comment': {
        await addSAVComment(
          String(args.order_id),
          String(args.origin_order_number),
          String(args.comment)
        )
        return { result: `✓ Commentaire SAV (order #${args.origin_order_number}) : ${String(args.comment)}` }
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

      case 'get_stock_items': {
        const items = await getStockItems(String(args.product_group_id))
        if (items.length === 0) {
          return { result: 'Aucun stock item trouvé pour ce produit.' }
        }
        const summary = items.map(item => {
          const snPart = item.serial_number ? ` | S/N: ${item.serial_number}` : ''
          // Extract the ID number from identifier suffix (e.g. "camera-sony-fx3-nue-id-2" → "ID-2")
          const match = item.identifier.match(/-(\d+)$/)
          const label = match ? `ID-${match[1]}` : item.identifier
          return `- ${label} | uuid: ${item.id} | identifier: ${item.identifier} | statut: ${item.status}${snPart}`
        }).join('\n')
        return { result: `Stock items :\n${summary}` }
      }

      case 'add_sav_line': {
        const orderId = String(args.order_id)
        const qty = typeof args.quantity === 'number' ? args.quantity : 1

        if (args.line_type === 'product' && args.product_group_id) {
          const stockItemId = args.stock_item_id ? String(args.stock_item_id) : undefined
          const { startError } = await addSAVLine({ type: 'product', orderId, productGroupId: String(args.product_group_id), quantity: qty, stockItemId })
          const stockInfo = stockItemId ? ` | stock_item_id: ${stockItemId}` : ''
          let result = `✓ Ligne produit ajoutée à la SAV order (product_group_id: ${args.product_group_id}${stockInfo}, qté: ${qty})`
          if (startError) result += `\n⚠️ Réservation non bloquante échouée : ${startError}`
          return { result }
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

      case 'draft_email': {
        const templateId = String(args.template_id || 'retour_casse') as EmailTemplateId
        const email = renderEmail(templateId, {
          customerName:       String(args.customer_name || ''),
          customerEmail:      args.customer_email ? String(args.customer_email) : undefined,
          orderNumber:        args.order_number ? String(args.order_number) : undefined,
          originOrderNumber:  args.origin_order_number ? String(args.origin_order_number) : undefined,
          notesSav:           args.sav_comment ? String(args.sav_comment) : undefined,
          insurance:          Boolean(args.insurance),
          caution:            Boolean(args.caution),
          amountAbove500:     Boolean(args.amount_above_500),
          latePayment:        Boolean(args.late_payment),
          paymentLink:        args.payment_link ? String(args.payment_link) : undefined,
          documentNumber:     args.document_number ? String(args.document_number) : undefined,
          orderStartsAt:      args.order_starts_at ? String(args.order_starts_at) : undefined,
          orderStopsAt:       args.order_stops_at ? String(args.order_stops_at) : undefined,
        })
        return { result: JSON.stringify({ subject: email.subject, body: email.body, to: email.to || args.customer_email || '' }) }
      }

      case 'send_email': {
        const to      = String(args.to)
        const subject = String(args.subject)
        const body    = String(args.body)

        if (!to || !to.includes('@')) {
          return { result: 'Erreur : adresse email destinataire manquante ou invalide.' }
        }

        const transporter = nodemailer.createTransport({
          host:   'smtp.gmail.com',
          port:   465,
          secure: true,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        })

        await transporter.sendMail({
          from:    `"filme" <${process.env.SMTP_USER}>`,
          to,
          subject,
          text: body,
          html: body.replace(/\n/g, '<br>'),
        })

        return { result: `✓ Email envoyé à ${to}` }
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
RÈGLES CRITIQUES — CES INSTRUCTIONS PRÉVALENT SUR TOUT LE RESTE.

Les DB prompts ci-dessus sont des références. Les règles ci-dessous sont la procédure exacte à suivre.
Ne PAS appeler add_internal_note (retiré du workflow).

═══════════════════════════════════════════════════
DÉTERMINATION DU TYPE DE CAS
═══════════════════════════════════════════════════

Détermine si c'est un cas CASSE ou MANQUANT selon le message initial ou en posant la question.
- CASSE : matériel endommagé, cassé, en panne → tags: ["LATE", "TO_BE_REPAIRED"], template: retour_casse
- MANQUANT : matériel absent, non rendu, perdu → tags: ["LATE"], template: retour_manquant

Pour CASSE : pose d'abord assurance/caution → détermine le cas 1/2/3/4.
Pour MANQUANT : pas besoin de questions préalables.

═══════════════════════════════════════════════════
ÉTAPE A — IDENTIFIER LES ARTICLES CONCERNÉS
═══════════════════════════════════════════════════

fetch_order retourne les lignes enrichies :
  - product_name     : nom du produit
  - product_group_id : UUID Booqable (utiliser directement dans add_sav_line si présent)
  - stock_item_id    : UUID de l'exemplaire assigné (si trackable)
  - stock_item_label : ex: "ID-2"

A1. Récupère l'order avec fetch_order, puis affiche les articles :
    "Voici les articles de l'order [numéro] : [liste]. Quel(s) article(s) est/sont [endommagé(s) / manquant(s)] ?"
    → Si déjà mentionné par l'utilisateur, utilise directement cette info.

A2. Pour chaque article concerné, identifie le product_group_id et stock_item_id :

    CAS CASSE — article trackable (ex: caméra avec ID-X) :
    → SI la ligne fetch_order a product_group_id ET stock_item_id correspondant à l'exemplaire décrit :
        Utilise-les directement. PAS besoin de search_products ni get_stock_items.
    → SI la ligne a product_group_id mais pas stock_item_id (ou mauvais exemplaire) :
        Appelle get_stock_items(product_group_id) → demande confirmation de l'unité.
    → SI pas de product_group_id dans la ligne :
        Appelle search_products → si trackable, appelle get_stock_items → demande confirmation.

    CAS MANQUANT — article bulk ou trackable :
    → SI la ligne fetch_order a product_group_id : utilise-le directement.
    → SI pas de product_group_id : appelle search_products.
    → Pour un trackable manquant : si l'utilisateur a précisé un numéro d'ID (ex: "ID 8", "ID 1"),
      appelle get_stock_items pour trouver le stock_item_id correspondant, puis utilise-le dans add_sav_line.
      Si l'ID n'est pas précisé, ajoute quand même la ligne (sans stock_item_id).
    → Si aucun résultat catalogue : crée une ligne custom.

A3. Répète A2 pour chaque article avant de passer à B.

═══════════════════════════════════════════════════
ÉTAPE B — CRÉER LA SAV ORDER
═══════════════════════════════════════════════════

B0. AVANT de créer la SAV order, annonce à l'opérateur :
    "⚠️ Avant de continuer, merci de retourner manuellement les articles [liste] dans l'order d'origine #[numéro] dans Booqable."
    Attends une confirmation ou un "ok" avant de passer à B1.

B1. "Je crée la nouvelle order SAV..."
    → create_sav_order(customer_id). Mémorise l'"id" retourné.

B2. "J'ajoute [article] à la SAV order..."
    → add_sav_line pour chaque article :
      - Trackable avec unité : line_type=product, product_group_id + stock_item_id
      - Bulk : line_type=product, product_group_id seul
      - Custom : line_type=custom, custom_title

B3. "J'ajoute les tags..."
    → add_tag en un seul appel :
      - CASSE  → tags: ["LATE", "TO_BE_REPAIRED"]
      - MANQUANT → tags: ["LATE"]

B4. "J'ajoute le commentaire SAV..."
    → add_sav_comment(sav_order_id, origin_order_number, détail_du_problème)
      Pour CASSE : inclure le cas (ex: "Cas 3 : Pas d'assurance + Pas de caution.")

B5. "J'enregistre le cas..."
    → log_case(problem_type: 'casse' | 'manquant', problem_description, metadata: {insurance, caution, cas})

═══════════════════════════════════════════════════
ÉTAPE C — EMAIL CLIENT (après log_case)
═══════════════════════════════════════════════════

C1. Appelle draft_email avec le template adapté :
    - CASSE contrôle retour    → retour_casse   (insurance, caution, customer_name, customer_email, origin_order_number, sav_comment)
    - MANQUANT contrôle retour → retour_manquant (customer_name, customer_email, origin_order_number, sav_comment)
    - Facturation réparation   → facturation_casse   (+ amount_above_500, payment_link ou document_number)
    - Facturation perte        → facturation_perdu
    - Facturation vol          → facturation_vole

C2. Présente l'email :
    "Voici l'email que je propose d'envoyer à [customer_email] :
    Objet : [subject]
    [body]
    Souhaitez-vous envoyer cet email ?"

C3. Confirmation opérateur → send_email(to, subject, body).

═══════════════════════════════════════════════════
RÈGLES IDs — JAMAIS LES MÉLANGER
═══════════════════════════════════════════════════

- fetch_order → "id" (UUID) pour toutes les actions sur l'order d'origine / "number" pour affichage humain.
- create_sav_order → "id" (UUID) pour add_tag, add_sav_comment, add_sav_line.
- customer_id pour create_sav_order = champ "customer_id" de fetch_order.`

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

          // Génère les IDs UNE SEULE FOIS pour que assistant + tool results soient cohérents
          const ts = Date.now()
          const toolCallEntries = Object.entries(toolCallsAccum).map(([idx, tc]) => ({
            id: `call_${idx}_${ts}`,
            name: tc.name,
            arguments: tc.arguments,
          }))

          const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
            role: 'assistant',
            content: assistantContent || null,
            tool_calls: toolCallEntries.map(entry => ({
              id: entry.id,
              type: 'function' as const,
              function: { name: entry.name, arguments: entry.arguments },
            })),
          }
          currentMessages = [...currentMessages, assistantMessage]

          // Exécute chaque tool call en réutilisant les mêmes IDs
          for (const entry of toolCallEntries) {
            send(JSON.stringify({ type: 'tool_call', name: entry.name }))

            let args: Record<string, unknown> = {}
            try { args = JSON.parse(entry.arguments) } catch { /* ignore */ }

            const { result, caseId: newCaseId } = await executeTool(entry.name, args)
            if (newCaseId) currentCaseId = newCaseId

            send(JSON.stringify({ type: 'tool_result', name: entry.name, result }))

            currentMessages = [
              ...currentMessages,
              {
                role: 'tool' as const,
                tool_call_id: entry.id,
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
