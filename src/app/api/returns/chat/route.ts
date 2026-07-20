import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import {
  buildStepInstruction,
  buildToolArgs,
  extractVarsFromResult,
  advanceStep,
  type WorkflowStep,
  type WorkflowState,
} from '@/lib/workflow-state'
import { executeCodeStep } from '@/lib/workflow-executor'
import {
  fetchOrderByNumber,
  createSAVOrder,
  addTagToOrder,
  addInternalNote,
  addSAVComment,
  setOriginalOrder,
  searchProducts,
  getStockItems,
  addSAVLine,
  updateOrderReturnDate,
  stopOrder,
  reserveOrder,
  cancelOrder,
  removeProductLine,
  revertToConcept,
  clearTags,
  duplicateOrder,
  startSAVOrder,
  sendEmailViaBooqable,
} from '@/lib/booqable-orders'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Outils disponibles pour l'IA (construits dynamiquement depuis la DB) ──────

function buildTools(
  emailTemplates: Array<{ template_id: string; label: string }>,
  tags: string[]
): OpenAI.Chat.ChatCompletionTool[] {
  const templateIds  = emailTemplates.map(t => t.template_id)
  const templateList = emailTemplates.length > 0
    ? emailTemplates.map(t => `- ${t.template_id} : ${t.label}`).join('\n')
    : '(aucun template disponible)'
  const tagHint = tags.length > 0
    ? `Tags disponibles (depuis les workflows actifs) : ${tags.map(t => `"${t}"`).join(', ')}`
    : 'Utiliser les tags appropriés au scénario actif'

  return [
  {
    type: 'function',
    function: {
      name: 'fetch_order',
      description: 'Récupère les détails d\'une order Booqable par son numéro. Retourne les lignes enrichies avec product_name, product_group_id, stock_item_id et stock_item_label (ex: "ID-2"). Si product_group_id et stock_item_id sont présents dans une ligne, tu peux passer directement à create_new_return_order sans appeler search_products ni get_stock_items.',
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
      name: 'create_new_return_order',
      description: 'Crée une nouvelle return_order dans Booqable : même client que l\'original_order, date de fin au dernier jour de l\'année à 23h45, remise 100%, caution = aucune. NE PAS passer de produits ici — les ajouter ensuite avec add_new_product_line.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'UUID Booqable du client — utiliser EXACTEMENT le champ "customer_id" retourné par fetch_order. Ce champ est OBLIGATOIRE.' },
        },
        required: ['customer_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_tag',
      description: 'Ajoute et/ou supprime des tags sur une commande Booqable selon le scénario actif.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la commande' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: tagHint,
          },
          tags_to_remove: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags à supprimer de la commande (optionnel)',
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
      description: 'Ajoute le commentaire sur la return_order (numéro original_order + détail)',
      parameters: {
        type: 'object',
        properties: {
          order_id:             { type: 'string', description: 'UUID Booqable de la return_order — utiliser le champ "id" retourné par create_new_return_order' },
          origin_order_number:  { type: 'string', description: 'Numéro de l\'original_order' },
          comment:              { type: 'string', description: 'Détail du problème (et cas si cassé)' },
        },
        required: ['order_id', 'origin_order_number', 'comment'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_original_order',
      description: 'Renseigne la propriété "original_order" sur la return_order. À appeler après create_new_return_order pour lier la return_order à l\'original_order.',
      parameters: {
        type: 'object',
        properties: {
          return_order_id:        { type: 'string', description: 'UUID Booqable de la return_order (id retourné par create_new_return_order)' },
          original_order_number:  { type: 'string', description: 'Numéro de l\'original_order (ex: 1234)' },
        },
        required: ['return_order_id', 'original_order_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Cherche un produit dans le catalogue Booqable par nom. Retourne le type (bulk/trackable) pour chaque résultat.',
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
      description: 'Récupère tous les exemplaires (stock items) d\'un produit trackable. Appelle cette fonction avec le productGroupId retourné par search_products dès que tracking=trackable. Retourne la liste des unités avec leur UUID et identifiant (ex: "camera-sony-fx3-nue-id-2"). Quand l\'utilisateur dit "ID-2", trouve l\'item dont l\'identifier se termine par "-2" et utilise son UUID comme stock_item_id dans add_new_product_line.',
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
      name: 'add_new_product_line',
      description: 'Ajoute une ligne produit à la nouvelle commande. Pour un produit trackable avec unité identifiée : utiliser type=product avec product_group_id ET stock_item_id. Pour un produit bulk : utiliser type=product avec product_group_id seul. Pour un article non référencé : utiliser type=custom avec un titre descriptif.',
      parameters: {
        type: 'object',
        properties: {
          order_id:         { type: 'string', description: 'UUID de la return_order (champ "id" retourné par create_new_return_order)' },
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
          sav_order_id:       { type: 'string', description: 'ID Booqable de la return_order créée' },
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
      description: `Récupère le template email depuis la bibliothèque Filme et retourne subject + body bruts (avec {{variables}} Booqable préservées — Booqable les remplace à l'envoi).\nTemplates disponibles :\n${templateList}`,
      parameters: {
        type: 'object',
        properties: {
          template_id:      { type: 'string', enum: templateIds.length > 0 ? templateIds : ['retour_ok'], description: 'ID du template à utiliser' },
          insurance:        { type: 'boolean', description: 'Le client a souscrit à l\'assurance (pour sélection de variante)' },
          caution:          { type: 'boolean', description: 'Une caution est active (pour sélection de variante)' },
          amount_above_500: { type: 'boolean', description: 'Montant > 500 € (pour sélection de variante)' },
          late_payment:     { type: 'boolean', description: 'Retard de paiement (pour sélection de variante)' },
        },
        required: ['template_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'duplicate_order',
      description: 'Duplique l\'original_order pour créer une child_return_order. Retourne l\'ID et le numéro de la child_return_order. À appeler avant revert_to_concept dans le workflow split.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la commande à dupliquer (champ "id" de fetch_order)' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'choose_problem_tag',
      description: 'Présente 4 boutons à l\'opérateur pour choisir le type de problème : Retard (r11_late), Perte (r12_missing), Vol (r13_theft), Dommage (r14_damage). IMPORTANT : après avoir appelé cette fonction, STOP — ne pas appeler d\'autres tools. Attendre que l\'utilisateur réponde avec le tag sélectionné. Le prochain message de l\'utilisateur SERA le tag (ex: "r11_late"). À ce moment seulement, appeler add_tag avec ce tag + r21_open, puis continuer.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la commande concernée' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_tags',
      description: 'Supprime tous les tags d\'une commande Booqable.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la commande' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'revert_to_concept',
      description: 'Repasse une commande Booqable en état "concept" (draft) pour la rendre éditable. Fonctionne depuis started, reserved ou stopped.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la commande (champ "id" de fetch_order)' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_order',
      description: 'Annule une commande Booqable (quel que soit son état : started, reserved, concept). Utilisé pour annuler la commande d\'origine après duplication dans le workflow split.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la commande à annuler (champ "id" de fetch_order)' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_product_line',
      description: 'Supprime une ligne d\'une commande Booqable. Utiliser les line_id retournés par fetch_order. Appeler une fois par ligne à supprimer.',
      parameters: {
        type: 'object',
        properties: {
          line_id: { type: 'string', description: 'UUID de la ligne à supprimer (champ "line_id" dans les lignes de fetch_order)' },
        },
        required: ['line_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reserve_order',
      description: 'Passe une commande Booqable de "concept" à "reserved".',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la commande (champ "id" de fetch_order)' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_order',
      description: 'Passe une commande Booqable en "started" (pickup). Tente reserved→started, ou concept→reserved→started.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la commande' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_return_date',
      description: 'Change la date de retour (stops_at) d\'une commande Booqable à la date du jour. À appeler avant stop_order pour régulariser une commande rendue en retard.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la commande d\'origine (champ "id" de fetch_order)' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stop_order',
      description: 'Passe la commande de "started" à "stopped" dans Booqable (retour du matériel). À appeler après update_return_date.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la commande d\'origine (champ "id" de fetch_order)' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Envoie l\'email via Booqable (Booqable gère le destinataire depuis l\'order et remplace les {{variables}}). À appeler UNIQUEMENT après confirmation de l\'opérateur.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'UUID Booqable de la commande (champ "id" de fetch_order)' },
          subject:  { type: 'string', description: 'Objet de l\'email — copier EXACTEMENT depuis draft_email, sans modifier les {{variables}}' },
          body:     { type: 'string', description: 'Corps de l\'email — copier EXACTEMENT depuis draft_email, sans modifier les {{variables}}' },
        },
        required: ['order_id', 'subject', 'body'],
      },
    },
  },
  ] // fin buildTools
}


// ── Résolution UUID : accepte un UUID ou un numéro de commande ─────────────────
// Certains outils sont appelés avant fetch_order et reçoivent un numéro de commande.
// Cette fonction retourne l'UUID Booqable dans tous les cas.
async function resolveOrderId(orderIdOrNumber: string): Promise<string | null> {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (UUID_RE.test(orderIdOrNumber)) return orderIdOrNumber
  const order = await fetchOrderByNumber(orderIdOrNumber)
  return order?.id ?? null
}

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
            line_id: l.id,
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
            customer_name: order.customer?.name,
            customer_email: order.customer?.email || null,
            customer_id: order.customer_id,
            starts_at: order.starts_at,
            stops_at: order.stops_at,
            tags: order.tags,
            lines: linesStructured,
            note_interne: order.properties_attributes?.note_interne || null,
            notes_sav:    order.properties_attributes?.notes_sav    || null,
            order_sav:    order.properties_attributes?.order_sav    || null,
          }),
        }
      }

      case 'add_internal_note': {
        await addInternalNote(String(args.order_id), String(args.note))
        return { result: `✓ Note interne : ${String(args.note)}` }
      }

      case 'create_new_return_order': {
        const customerId = String(args.customer_id || '')
        if (!customerId) return { result: 'Erreur : customer_id manquant — utiliser le champ "customer_id" retourné par fetch_order' }
        const sav = await createSAVOrder({ customerId })
        if (!sav) return { result: 'Erreur : return_order non créée' }
        const numDisplay = sav.number ? ` (numéro: ${sav.number})` : ''
        return { result: `✓ return_order créée${numDisplay} | id: ${sav.id} | customer_id: ${customerId} | date de fin: 31 déc 23h45\nUtilise cet "id" pour add_new_product_line, add_tag, add_sav_comment, set_original_order.` }
      }

      case 'add_tag': {
        const resolvedTagOrderId = await resolveOrderId(String(args.order_id))
        if (!resolvedTagOrderId) return { result: `Erreur : commande "${args.order_id}" introuvable` }
        // Support both "tags"/"tags_add" and "tags_to_remove"/"tags_remove" (workflow step may use either)
        const tagList   = Array.isArray(args.tags)           ? args.tags.map(String)
                        : Array.isArray(args.tags_add)       ? args.tags_add.map(String)
                        : [String(args.tags || args.tags_add || args.tag || '')]
        const tagRemove = Array.isArray(args.tags_to_remove) ? args.tags_to_remove.map(String)
                        : Array.isArray(args.tags_remove)    ? args.tags_remove.map(String)
                        : []
        await addTagToOrder(resolvedTagOrderId, tagList, tagRemove.length > 0 ? tagRemove : undefined)
        const removePart = tagRemove.length > 0 ? ` | supprimés : ${tagRemove.join(', ')}` : ''
        return { result: `✓ Tags ajoutés : ${tagList.join(', ')}${removePart}` }
      }

      case 'duplicate_order': {
        const dupOrderId = await resolveOrderId(String(args.order_id))
        if (!dupOrderId) return { result: `Erreur : commande "${args.order_id}" introuvable` }
        const { newOrderId, newOrderNumber } = await duplicateOrder(dupOrderId)
        return { result: JSON.stringify({ success: true, new_order_id: newOrderId, new_order_number: newOrderNumber, message: `✓ Commande dupliquée — nouvelle commande : numéro ${newOrderNumber || '?'}, id: ${newOrderId}` }) }
      }

      case 'choose_problem_tag': {
        const orderId = String(args.order_id)
        // Retourne un marqueur spécial → le streaming émet un event SSE 'choices'
        return {
          result: JSON.stringify({
            __type__: 'choices',
            order_id: orderId,
            items: [
              { label: 'Retard',  tag: 'r11_late'    },
              { label: 'Perte',   tag: 'r12_missing'  },
              { label: 'Vol',     tag: 'r13_theft'    },
              { label: 'Dommage', tag: 'r14_damage'   },
            ],
          }),
        }
      }

      case 'clear_tags': {
        const clearOrderId = await resolveOrderId(String(args.order_id))
        if (!clearOrderId) return { result: `Erreur : commande "${args.order_id}" introuvable` }
        await clearTags(clearOrderId)
        return { result: `✓ Tous les tags supprimés sur la commande ${args.order_id}` }
      }

      case 'revert_to_concept': {
        const revertOrderId = await resolveOrderId(String(args.order_id))
        if (!revertOrderId) return { result: `Erreur : commande "${args.order_id}" introuvable` }
        await revertToConcept(revertOrderId)
        return { result: `✓ Commande ${args.order_id} repassée en draft (concept)` }
      }

      case 'cancel_order': {
        const cancelOrderId = await resolveOrderId(String(args.order_id))
        if (!cancelOrderId) return { result: `Erreur : commande "${args.order_id}" introuvable` }
        await cancelOrder(cancelOrderId)
        return { result: `✓ Commande ${args.order_id} annulée` }
      }

      case 'remove_product_line': {
        await removeProductLine(String(args.line_id))
        return { result: `✓ Ligne ${args.line_id} supprimée` }
      }

      case 'reserve_order': {
        const reserveOrderId = await resolveOrderId(String(args.order_id))
        if (!reserveOrderId) return { result: `Erreur : commande "${args.order_id}" introuvable` }
        await reserveOrder(reserveOrderId)
        return { result: `✓ Commande ${args.order_id} réservée (concept → reserved)` }
      }

      case 'start_order': {
        const startOrderId = await resolveOrderId(String(args.order_id))
        if (!startOrderId) return { result: `Erreur : commande "${args.order_id}" introuvable` }
        const { error } = await startSAVOrder(startOrderId)
        if (error) return { result: `⚠️ start_order non bloquant : ${error}` }
        return { result: `✓ Commande ${args.order_id} démarrée (started)` }
      }

      case 'update_return_date': {
        const resolvedId = await resolveOrderId(String(args.order_id))
        if (!resolvedId) return { result: `Erreur : commande "${args.order_id}" introuvable dans Booqable` }
        await updateOrderReturnDate(resolvedId)
        return { result: `✓ Date de retour mise à jour à aujourd'hui pour la commande ${args.order_id}` }
      }

      case 'stop_order': {
        const resolvedId = await resolveOrderId(String(args.order_id))
        if (!resolvedId) return { result: `Erreur : commande "${args.order_id}" introuvable dans Booqable` }
        await stopOrder(resolvedId)
        return { result: `✓ Commande ${args.order_id} passée en "stopped" (matériel retourné)` }
      }

      case 'add_sav_comment': {
        const savOrderId = await resolveOrderId(String(args.order_id))
        if (!savOrderId) return { result: `Erreur : commande "${args.order_id}" introuvable` }
        await addSAVComment(
          savOrderId,
          String(args.origin_order_number),
          String(args.comment)
        )
        return { result: `✓ Commentaire SAV (order #${args.origin_order_number}) : ${String(args.comment)}` }
      }

      case 'set_original_order': {
        await setOriginalOrder(
          String(args.return_order_id),
          String(args.original_order_number)
        )
        return { result: `✓ Commande d'origine renseignée : original_order = ${args.original_order_number}` }
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

      case 'add_new_product_line': {
        const orderId = String(args.order_id)
        const qty = typeof args.quantity === 'number' ? args.quantity : 1

        if (args.line_type === 'product' && args.product_group_id) {
          const stockItemId = args.stock_item_id ? String(args.stock_item_id) : undefined
          const { startError } = await addSAVLine({ type: 'product', orderId, productGroupId: String(args.product_group_id), quantity: qty, stockItemId })
          const stockInfo = stockItemId ? ` | stock_item_id: ${stockItemId}` : ''
          let result = `✓ Ligne produit ajoutée à la return_order (product_group_id: ${args.product_group_id}${stockInfo}, qté: ${qty})`
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
        const templateId = String(args.template_id || '')

        // Conditions pour sélection de variante (pas de données client ici)
        const conditions: Record<string, boolean> = {
          insurance:      Boolean(args.insurance),
          caution:        Boolean(args.caution),
          amountAbove500: Boolean(args.amount_above_500),
          latePayment:    Boolean(args.late_payment),
        }

        // Charger le template depuis la DB
        const sbDraft = getSupabaseAdmin()
        const { data: rows } = await sbDraft
          .from('email_templates')
          .select('case_key, subject, body, conditions, sort_order')
          .eq('template_id', templateId)
          .order('sort_order')

        if (rows && rows.length > 0) {
          const best = rows.reduce((prev, cur) => {
            const score = (row: typeof rows[0]) => {
              const c = (row.conditions as Record<string, boolean>) || {}
              return Object.entries(c).filter(([k, v]) => conditions[k] === v).length
                   - Object.entries(c).filter(([k, v]) => conditions[k] !== v).length
            }
            return score(cur) >= score(prev) ? cur : prev
          })
          // Retourner subject + body BRUTS — {{variables}} préservées pour Booqable
          return { result: JSON.stringify({ subject: best.subject, body: best.body }) }
        }

        return { result: `Erreur : template "${templateId}" introuvable en DB.` }
      }

      case 'send_email': {
        const sendOrderId = await resolveOrderId(String(args.order_id || ''))
        if (!sendOrderId) return { result: `Erreur : commande "${args.order_id}" introuvable` }
        const subject = String(args.subject)
        const body    = String(args.body)
        await sendEmailViaBooqable(sendOrderId, subject, body)
        return { result: `✓ Email envoyé via Booqable pour la commande ${args.order_id}` }
      }

      default:
        return { result: `Outil inconnu: ${name}` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { result: `Erreur lors de l'exécution de ${name}: ${msg}` }
  }
}

// ── Prompts par scénario ──────────────────────────────────────────────────────

function buildScenarioPrompt(scenario: string | null | undefined): string {
  switch (scenario) {
    case 'late':
      return `
═══════════════════════════════════════════════════
SCÉNARIO ACTIF : EN RETARD
═══════════════════════════════════════════════════
Le matériel n'a pas été rendu. Il est toujours chez le client.
Workflow :
1. fetch_order → afficher les articles de la commande.
2. Si pas déjà précisé : "Quels articles n'ont pas été rendus ?"
3. B0 : demander à l'opérateur de retourner manuellement les articles dans Booqable, attendre confirmation.
4. create_new_return_order(customer_id)
5. add_new_product_line pour chaque article non rendu.
6. add_tag : tags=["late"]
7. add_sav_comment(origin_order_number, détail)
8. log_case(problem_type="manquant", problem_description="Retard - matériel non rendu")
9. Pas d'email automatique sauf si l'opérateur le demande.`

    case 'late_returned':
      return `
═══════════════════════════════════════════════════
SCÉNARIO ACTIF : RENDU EN RETARD
═══════════════════════════════════════════════════
Tout le matériel a été rendu, mais avec du retard. Pas de dommage.
Workflow :
1. fetch_order → confirmer les articles.
2. B0 : si pas encore fait, demander à l'opérateur de retourner les articles dans Booqable, attendre confirmation.
3. create_new_return_order(customer_id)
4. add_new_product_line pour les articles rendus en retard.
5. add_tag : tags=["late_returned"]
6. add_sav_comment(origin_order_number, "Rendu en retard — tout OK")
7. log_case(problem_type="manquant", problem_description="Rendu en retard - tout OK")
8. draft_email template=retour_ok (customer_name, customer_email, order_number) → proposer l'envoi.`

    case 'late_partial':
      return `
═══════════════════════════════════════════════════
SCÉNARIO ACTIF : RENDU EN RETARD PARTIEL
═══════════════════════════════════════════════════
Une partie du matériel a été rendue (avec retard), le reste est encore manquant.
Workflow :
1. fetch_order → afficher tous les articles.
2. "Quels articles ont été rendus ? Lesquels sont encore manquants ?"
3. B0 : demander à l'opérateur de retourner manuellement dans Booqable les articles rendus, attendre confirmation.
4. create_new_return_order(customer_id)
5. add_new_product_line UNIQUEMENT pour les articles encore manquants.
6. add_tag : tags=["late"] (pour les articles encore en attente)
7. add_sav_comment avec la liste des articles rendus vs manquants.
8. log_case(problem_type="manquant", problem_description="Rendu partiel en retard - articles manquants : ...")
9. Pas d'email automatique sauf si demandé.`

    case 'missing':
      return `
═══════════════════════════════════════════════════
SCÉNARIO ACTIF : PERTE
═══════════════════════════════════════════════════
Le matériel est perdu ou volé. Non rendu, confirmé perdu.
Workflow :
1. fetch_order → identifier les articles perdus.
2. Poser les questions : "Le client a-t-il souscrit une assurance ? Y a-t-il une caution active sur la commande ?"
3. B0 : demander à l'opérateur de retourner les articles dans Booqable, attendre confirmation.
4. create_new_return_order(customer_id)
5. add_new_product_line pour chaque article perdu.
6. add_tag : tags=["missing"]
7. add_sav_comment(origin_order_number, détail de la perte)
8. log_case(problem_type="manquant", problem_description="Perte - ...", metadata={insurance, caution})
9. draft_email template=retour_manquant (customer_name, customer_email, origin_order_number, sav_comment, insurance, caution) → proposer l'envoi.`

    case 'damage':
      return `
═══════════════════════════════════════════════════
SCÉNARIO ACTIF : DOMMAGE
═══════════════════════════════════════════════════
Du matériel a été endommagé à son retour.
Workflow :
1. fetch_order → identifier les articles endommagés.
2. Poser : "Le client a-t-il souscrit une assurance ? Y a-t-il une caution active ?"
3. Déterminer le cas (1: assurance+caution / 2: assurance seule / 3: caution seule / 4: aucun)
4. B0 : demander à l'opérateur de retourner les articles dans Booqable, attendre confirmation.
5. create_new_return_order(customer_id)
6. add_new_product_line pour chaque article endommagé (avec stock_item_id si trackable et connu).
7. add_tag : tags=["damage"]
8. add_sav_comment(origin_order_number, détail + cas)
9. log_case(problem_type="casse", problem_description="Dommage - ...", metadata={insurance, caution, cas})
10. draft_email template=retour_casse (customer_name, customer_email, origin_order_number, sav_comment, insurance, caution) → proposer l'envoi.`

    default:
      return ''
  }
}

// ── Route principale ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    messages: OpenAI.Chat.ChatCompletionMessageParam[]
    workflowSlug?: string
    caseId?: string
    scenario?: string | null
    customerId?: string | null
    customerName?: string | null
    customerEmail?: string | null
    workflowState?: WorkflowState | null   // état du workflow envoyé par le client
  }

  const { messages, caseId = null, scenario = null, customerId: bodyCustomerId = null, workflowState: clientWorkflowState = null } = body

  // Charge le prompt du workflow correspondant au scénario (ou tous si pas de scénario)
  const supabase = getSupabaseAdmin()
  let query = supabase.from('return_workflows').select('slug, prompt, steps').eq('is_active', true)
  if (scenario) query = query.eq('slug', scenario)

  const { data: workflows } = await query

  // Charge les templates email depuis la DB → enum dynamique pour draft_email
  const { data: emailTemplateRows } = await supabase
    .from('email_templates')
    .select('template_id, label')
    .order('sort_order')
  const emailTemplatesMap = new Map<string, { template_id: string; label: string }>()
  for (const t of (emailTemplateRows || [])) {
    if (!emailTemplatesMap.has(t.template_id)) {
      emailTemplatesMap.set(t.template_id, { template_id: t.template_id, label: t.label as string })
    }
  }
  const emailTemplates = Array.from(emailTemplatesMap.values())

  // Extrait les tags depuis les étapes add_tag de tous les workflows actifs
  // WorkflowStep est importé depuis @/lib/workflow-state

  const allTags = (() => {
    const tags = new Set<string>()
    for (const w of (workflows || [])) {
      for (const step of ((w.steps || []) as WorkflowStep[])) {
        if (step.booqable_action === 'add_tag') {
          // Priorité : parameters.tags (tableau structuré)
          const paramTags = step.parameters?.tags
          if (Array.isArray(paramTags)) {
            paramTags.forEach((t: unknown) => typeof t === 'string' && tags.add(t))
          } else if (step.description) {
            // Fallback : extraire les guillemets dans la description
            const matches = step.description.match(/"([^"]+)"/g) || []
            matches.forEach(m => tags.add(m.replace(/"/g, '')))
          }
        }
      }
    }
    return Array.from(tags)
  })()

  // Construit les outils dynamiquement
  const tools = buildTools(emailTemplates, allTags)

  // Convertit les étapes structurées en instructions lisibles par l'IA
  function stepsToPrompt(steps: WorkflowStep[]): string {
    if (!steps || steps.length === 0) return ''
    const lines = steps.map((s, i) => {
      const tool = s.booqable_action ? ` → ${s.booqable_action}` : ''
      const desc = s.description ? ` : ${s.description}` : ''
      const params = s.parameters && Object.keys(s.parameters).length > 0
        ? ` [params: ${JSON.stringify(s.parameters)}]`
        : ''

      if (s.type === 'check') {
        // Étape bloquante : l'IA DOIT vérifier article par article et redemander si incomplet
        return `${i + 1}. [⚠ ARRÊT — VÉRIFICATION OBLIGATOIRE AVANT DE CONTINUER]\n` +
          `   Condition : ${s.title}${desc}\n` +
          `   → Passe en revue CHAQUE article listé, UN PAR UN.\n` +
          `   → Pour chaque article, si une information requise manque : POSE LA QUESTION et ATTENDS la réponse avant de passer à l'article suivant.\n` +
          `   → L'opérateur doit répondre explicitement pour chaque article (ex: "pas d'ID" est une réponse valide).\n` +
          `   → NE JAMAIS supposer, déduire ou inventer une valeur manquante.\n` +
          `   → Ne passe à l'étape suivante QUE lorsque chaque article a été validé individuellement.`
      }

      const tag = s.type === 'action' ? '[ACTION]' : s.type === 'question' ? '[QUESTION]' : '[INSTRUCTION]'
      return `${i + 1}. ${tag} ${s.title}${tool}${desc}${params}`
    })
    return 'ÉTAPES À SUIVRE (dans cet ordre) :\n' + lines.join('\n')
  }

  const workflowUsesStateMachine = (workflows || []).some(w =>
    (w.steps as WorkflowStep[] || []).some(s => s.execution === 'code' || s.execution === 'ai')
  )

  const combinedPrompt = (workflows || [])
    .map(w => {
      const steps = (w.steps || []) as WorkflowStep[]
      // Si le workflow utilise le state machine (au moins un step avec execution défini),
      // on ne génère PAS stepsToPrompt : le state machine est le séquenceur.
      // Inclure la liste complète ferait ré-exécuter des steps déjà faits par le code executor.
      const usesStateMachine = steps.some(s => s.execution === 'code' || s.execution === 'ai')
      const stepsPart = usesStateMachine ? '' : stepsToPrompt(steps)
      const promptPart = (w.prompt || '').trim()
      return [stepsPart, promptPart].filter(Boolean).join('\n\n')
    })
    .filter(Boolean)
    .join('\n\n---\n\n')

  const uuidReminder = `
RÈGLES CRITIQUES — CES INSTRUCTIONS PRÉVALENT SUR TOUT LE RESTE.

Les DB prompts ci-dessus sont des références. Les règles ci-dessous sont la procédure exacte à suivre.
Ne PAS appeler add_internal_note (retiré du workflow).

RÈGLE ABSOLUE — duplicate_order :
Ne jamais appeler duplicate_order si "child_order_id" est déjà défini dans le CONTEXTE VARIABLES de l'étape courante (section ci-dessous). Si child_order_id est présent, la duplication est déjà faite par le système.

RÈGLE ABSOLUE — choose_problem_tag :
Après avoir appelé choose_problem_tag, STOPPER immédiatement — ne pas appeler d'autres tools dans le même tour.
Le prochain message de l'utilisateur est TOUJOURS le tag sélectionné (ex: "r11_late", "r12_missing", "r14_damage").
À la réception de ce message : appeler add_tag avec CE tag + r21_open, puis passer directement au step suivant. NE PAS rappeler add_sav_comment, clear_tags, ou choose_problem_tag.

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
  - product_group_id : UUID Booqable (utiliser directement dans add_new_product_line si présent)
  - stock_item_id    : UUID de l'exemplaire assigné (si trackable)
  - stock_item_label : ex: "ID-2"

A1. Récupère l'original_order avec fetch_order, puis affiche les articles :
    "Voici les articles de l'original_order [numéro] :
    1x Caméra Sony FX3
    2x Carte CFexpress Type A
    ..."
    Format OBLIGATOIRE : une ligne par article, "{quantité}x {nom} (ID-X)" si stock_item_label est présent, sinon "{quantité}x {nom}" — pas de numérotation, pas de parenthèses supplémentaires.
    Puis : "Quel(s) article(s) est/sont [endommagé(s) / manquant(s)] ?"
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
      appelle get_stock_items pour trouver le stock_item_id correspondant, puis utilise-le dans add_new_product_line.
      Si l'ID n'est pas précisé, ajoute quand même la ligne (sans stock_item_id).
    → Si aucun résultat catalogue : crée une ligne custom.

A3. Répète A2 pour chaque article avant de passer à B.

═══════════════════════════════════════════════════
ÉTAPE B — CRÉER LA RETURN ORDER
═══════════════════════════════════════════════════

B0. AVANT de créer la return_order, annonce à l'opérateur :
    "⚠️ Avant de continuer, merci de retourner manuellement les articles [liste] dans l'original_order #[numéro] dans Booqable."
    Attends une confirmation ou un "ok" avant de passer à B1.

B1. "Je crée la return_order..."
    → create_new_return_order(customer_id). Mémorise l'"id" retourné.

B2. "J'ajoute [article] à la return_order..."
    → add_new_product_line pour chaque article :
      - Trackable avec unité : line_type=product, product_group_id + stock_item_id
      - Bulk : line_type=product, product_group_id seul
      - Custom : line_type=custom, custom_title

B3. "J'ajoute les tags..."
    → add_tag en un seul appel :
      - CASSE  → tags: ["LATE", "TO_BE_REPAIRED"]
      - MANQUANT → tags: ["LATE"]

B4. "J'ajoute le commentaire..."
    → add_sav_comment(return_order_id, origin_order_number, détail_du_problème)
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

C2. Présente l'email EXACTEMENT comme retourné par draft_email — ne remplace JAMAIS les {{variables}} :
    "Voici l'email que je propose :
    Objet : [subject tel quel]
    [body tel quel, avec {{variables}} visibles]
    Souhaitez-vous envoyer cet email ?"

C3. Confirmation opérateur → send_email(order_id, subject, body).
    order_id = UUID de la commande (original_order ou return_order selon le workflow).
    subject et body = copie EXACTE de draft_email, {{variables}} incluses.

═══════════════════════════════════════════════════
RÈGLES IDs — JAMAIS LES MÉLANGER
═══════════════════════════════════════════════════

- fetch_order → "id" (UUID) = id de l'original_order / "number" pour affichage humain.
- create_new_return_order → "id" (UUID) = id de la return_order, à utiliser pour add_tag, add_sav_comment, add_new_product_line.
- customer_id pour create_new_return_order = champ "customer_id" de fetch_order.
- Pour draft_email : passer uniquement template_id + flags conditions (insurance, caution, etc.). NE PAS passer customer_name, customer_email — Booqable les gère via {{variables}}.

RÈGLE ABSOLUE — EMAIL DRAFT :
Quand tu affiches le brouillon d'email retourné par draft_email, tu dois copier-coller le subject et le body EXACTEMENT tels quels, sans modifier un seul caractère.
INTERDIT : remplacer, compléter, interpréter ou substituer les variables {{...}} (ex: {{customer.name}}, {{originOrderNumber}}, {{order.starts_at}}).
Ces variables sont des placeholders Booqable : Booqable les remplace automatiquement à l'envoi. Si tu les remplaces toi-même, l'email envoyé sera cassé.
Exemple CORRECT : "Bonjour {{customer.name}},"
Exemple INTERDIT : "Bonjour CINELOC," ou "Bonjour [Nom du client],"
Affiche les {{...}} littéralement, toujours.`

  const scenarioSection = buildScenarioPrompt(scenario)

  // ── Moteur d'état workflow ────────────────────────────────────────────────
  // Récupère les steps du workflow actif
  const activeWorkflow = scenario
    ? (workflows || []).find(w => w.slug === scenario) ?? (workflows || [])[0]
    : (workflows || [])[0]
  const activeSteps = ((activeWorkflow?.steps || []) as WorkflowStep[])

  // État courant : envoyé par le client, ou initialisation à l'étape 0
  let wfState: WorkflowState = clientWorkflowState ?? { step_index: 0, vars: {}, status: 'running' }

  // Si l'étape courante est une QUESTION et qu'on attend une réponse → l'utilisateur vient de répondre → avancer
  if (activeSteps.length > 0 && wfState.status === 'waiting_for_input') {
    wfState = advanceStep(wfState, activeSteps.length)
  }

  // Construire l'instruction pour l'étape courante (si workflow actif avec steps)
  const currentStep = activeSteps.length > 0 ? activeSteps[wfState.step_index] : null
  const stepInstruction = currentStep
    ? buildStepInstruction(currentStep, wfState.vars, wfState.step_index, activeSteps.length)
    : null
  // ─────────────────────────────────────────────────────────────────────────

  const systemPrompt = (combinedPrompt
    ? combinedPrompt + (workflowUsesStateMachine ? '' : '\n\n' + uuidReminder)
    : `Tu es un assistant de gestion des retours. Guide le responsable de stock étape par étape.\n\n${uuidReminder}`)
    + (scenarioSection ? '\n\n' + scenarioSection : '')
    + (stepInstruction ? '\n\n' + stepInstruction : '')

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

        // ── waiting_for_input → avance automatiquement ────────────────────────
        // Si le dernier tour s'est terminé sur une question (waiting_for_input),
        // l'utilisateur vient de répondre → on passe à l'étape suivante.
        if (activeSteps.length > 0 && wfState.status === 'waiting_for_input') {
          wfState = advanceStep(wfState, activeSteps.length)
        }

        // ── Code execution pre-pass ────────────────────────────────────────────
        // Exécute en séquence tous les steps consécutifs marqués execution:'code'
        // sans appeler le LLM. Plus rapide, 100% fiable.
        if (activeSteps.length > 0) {
          const ghostMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []
          let codeStepRan = false
          const ts = Date.now()
          let stepSeq = 0

          while (
            wfState.status === 'running' &&
            wfState.step_index < activeSteps.length
          ) {
            const codeStep = activeSteps[wfState.step_index] as WorkflowStep
            if (codeStep.execution !== 'code') break

            codeStepRan = true
            const toolName = codeStep.booqable_action ?? 'code_step'
            const callId   = `code_${ts}_${stepSeq++}`
            const argsSnap = buildToolArgs(codeStep, wfState.vars)   // snapshot avant update vars

            send(JSON.stringify({ type: 'tool_call', name: toolName }))

            const { resultText, newVars } = await executeCodeStep(codeStep, wfState.vars)

            if (Object.keys(newVars).length > 0) {
              wfState = { ...wfState, vars: { ...wfState.vars, ...newVars } }
            }
            wfState = advanceStep(wfState, activeSteps.length)

            send(JSON.stringify({ type: 'tool_result', name: toolName, result: resultText }))

            // Ghost messages — l'IA verra l'historique complet des appels code
            ghostMessages.push({
              role: 'assistant' as const,
              content: null,
              tool_calls: [{ id: callId, type: 'function' as const, function: { name: toolName, arguments: JSON.stringify(argsSnap) } }],
            })
            ghostMessages.push({ role: 'tool' as const, tool_call_id: callId, content: resultText })
          }

          // Workflow terminé sans passer par le LLM
          if (wfState.status === 'completed') {
            send(JSON.stringify({ type: 'done', caseId: currentCaseId, workflowState: wfState }))
            controller.close()
            return
          }

          // Des steps code ont tourné → rebuild system message pour la nouvelle étape IA
          if (codeStepRan) {
            const updatedStep = activeSteps[wfState.step_index] as WorkflowStep | undefined
            const updatedInstruction = updatedStep
              ? buildStepInstruction(updatedStep, wfState.vars, wfState.step_index, activeSteps.length)
              : null
            const updatedPrompt = (combinedPrompt
              ? combinedPrompt + (workflowUsesStateMachine ? '' : '\n\n' + uuidReminder)
              : `Tu es un assistant de gestion des retours. Guide le responsable de stock étape par étape.\n\n${uuidReminder}`)
              + (scenarioSection ? '\n\n' + scenarioSection : '')
              + (updatedInstruction ? '\n\n' + updatedInstruction : '')

            currentMessages = [
              { role: 'system' as const, content: updatedPrompt },
              ...messages,
              ...ghostMessages,
            ]
          }
        }
        // ── Fin code execution pre-pass ────────────────────────────────────────

        // Boucle agent (gère les tool_calls)
        while (true) {
          // ── Étape courante ─────────────────────────────────────────────────
          const aiStep = activeSteps.length > 0 && wfState.step_index < activeSteps.length
            ? activeSteps[wfState.step_index] as WorkflowStep | undefined
            : undefined

          // ── Rebuild system message à chaque itération (step peut avoir avancé) ──
          if (workflowUsesStateMachine) {
            const loopInstruction = aiStep
              ? buildStepInstruction(aiStep, wfState.vars, wfState.step_index, activeSteps.length)
              : null
            const loopSystemContent = (combinedPrompt || 'Tu es un assistant de gestion des retours.')
              + (scenarioSection ? '\n\n' + scenarioSection : '')
              + (loopInstruction ? '\n\n' + loopInstruction : '')
            currentMessages = [
              { role: 'system' as const, content: loopSystemContent },
              ...currentMessages.slice(1),
            ]
          }

          // ── tool_choice ────────────────────────────────────────────────────
          // question step  → 'none' (texte uniquement, pas d'outil)
          // ai action step → forcer l'outil exact du step
          // sinon          → 'auto'
          const isQuestionStep = aiStep?.type === 'question'
          const forcedToolChoice: OpenAI.Chat.ChatCompletionToolChoiceOption = isQuestionStep
            ? 'none'
            : aiStep?.execution === 'ai' && aiStep?.type === 'action' && aiStep?.booqable_action
              ? { type: 'function', function: { name: aiStep.booqable_action } }
              : 'auto'

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: currentMessages,
            // Ne pas passer tools quand tool_choice='none' (question step)
            ...(forcedToolChoice === 'none' ? {} : { tools }),
            tool_choice: forcedToolChoice,
            parallel_tool_calls: false,
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

            // Fallback : si l'IA passe un placeholder pour customer_id, récupérer l'UUID réel
            if (entry.name === 'create_new_return_order') {
              const providedId = String(args.customer_id || '')
              const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
              const isValidUuid = UUID_RE.test(providedId)
              if (!isValidUuid) {
                // 1. Priorité : customer_id mémorisé côté client (envoyé dans le body)
                if (bodyCustomerId && UUID_RE.test(bodyCustomerId)) {
                  args = { ...args, customer_id: bodyCustomerId }
                } else {
                  // 2. Fallback : parcourir l'historique en mémoire (même session HTTP)
                  for (let i = currentMessages.length - 1; i >= 0; i--) {
                    const msg = currentMessages[i]
                    if (msg.role === 'tool') {
                      try {
                        const parsed = JSON.parse(String(msg.content)) as Record<string, unknown>
                        const cid = String(parsed.customer_id || '')
                        if (UUID_RE.test(cid)) {
                          args = { ...args, customer_id: cid }
                          break
                        }
                      } catch { /* pas JSON, continuer */ }
                    }
                  }
                }
              }
            }

            const { result, caseId: newCaseId } = await executeTool(entry.name, args)
            if (newCaseId) currentCaseId = newCaseId

            // ── Mise à jour de l'état workflow ──────────────────────────────
            if (activeSteps.length > 0) {
              const stepAtExecution = activeSteps[wfState.step_index] as WorkflowStep | undefined
              // Extraire les variables du résultat (fetch_order → order_id, duplicate_order → child_order_id…)
              const newVars = extractVarsFromResult(entry.name, result, stepAtExecution ?? { id: '', type: 'action', title: '' })
              if (Object.keys(newVars).length > 0) {
                wfState = { ...wfState, vars: { ...wfState.vars, ...newVars } }
              }
              // Avancer l'étape si ACTION réussie
              if (stepAtExecution?.type === 'action') {
                wfState = advanceStep(wfState, activeSteps.length)
              }
            }
            // ───────────────────────────────────────────────────────────────

            // Émettre un event SSE 'choices' si le tool retourne un marqueur spécial
            try {
              const parsed = JSON.parse(result) as { __type__?: string; items?: unknown; order_id?: string }
              if (parsed.__type__ === 'choices') {
                send(JSON.stringify({ type: 'choices', order_id: parsed.order_id, items: parsed.items }))
              }
            } catch { /* pas JSON, continuer */ }

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

          // ── State machine : après UNE action AI ────────────────────────────
          // Exécute les steps code consécutifs qui suivent, puis :
          //   - si question step → continue le loop pour poser la question
          //   - sinon → break (un seul appel AI par tour)
          if (workflowUsesStateMachine) {
            const codeTs = Date.now()
            let codeSeq = 0
            while (wfState.status === 'running' && wfState.step_index < activeSteps.length) {
              const postCodeStep = activeSteps[wfState.step_index] as WorkflowStep
              if (postCodeStep.execution !== 'code') break
              const codeId   = `code_post_${codeTs}_${codeSeq++}`
              const codeArgs = buildToolArgs(postCodeStep, wfState.vars)
              send(JSON.stringify({ type: 'tool_call', name: postCodeStep.booqable_action ?? 'code_step' }))
              const codeRes = await executeCodeStep(postCodeStep, wfState.vars)
              if (Object.keys(codeRes.newVars).length > 0) {
                wfState = { ...wfState, vars: { ...wfState.vars, ...codeRes.newVars } }
              }
              wfState = advanceStep(wfState, activeSteps.length)
              send(JSON.stringify({ type: 'tool_result', name: postCodeStep.booqable_action ?? 'code_step', result: codeRes.resultText }))
              currentMessages = [
                ...currentMessages,
                { role: 'assistant' as const, content: null, tool_calls: [{ id: codeId, type: 'function' as const, function: { name: postCodeStep.booqable_action ?? '', arguments: JSON.stringify(codeArgs) } }] },
                { role: 'tool' as const, tool_call_id: codeId, content: codeRes.resultText },
              ]
            }
            if (wfState.status === 'completed') {
              send(JSON.stringify({ type: 'done', caseId: currentCaseId, workflowState: wfState }))
              controller.close()
              return
            }
            // Si la prochaine étape est une question → on continue le loop pour la poser
            const afterCodeStep = wfState.step_index < activeSteps.length
              ? activeSteps[wfState.step_index] as WorkflowStep | undefined
              : undefined
            if (afterCodeStep?.type === 'question') continue
            // Sinon → break (un seul appel AI par requête)
            break
          }
        }

        // Si on a terminé sans tool call sur une étape QUESTION → passer en waiting_for_input
        if (activeSteps.length > 0) {
          const stepNow = activeSteps[wfState.step_index] as WorkflowStep | undefined
          if (stepNow?.type === 'question' && wfState.status === 'running') {
            wfState = { ...wfState, status: 'waiting_for_input' }
          }
        }

        // Fin du stream — renvoyer l'état mis à jour au client
        send(JSON.stringify({ type: 'done', caseId: currentCaseId, workflowState: activeSteps.length > 0 ? wfState : null }))
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
