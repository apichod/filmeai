/**
 * Workflow Executor — exécution directe des steps "code" sans LLM.
 *
 * Utilise TOOL_REGISTRY pour extraire les variables résultantes
 * (plus de switch/case hardcodé).
 */

import { createClient } from '@supabase/supabase-js'
import {
  fetchOrderById,
  duplicateOrder,
  clearTags,
  revertToConcept,
  reserveOrder,
  cancelOrder,
  updateOrderReturnDate,
  stopOrder,
  addTagToOrder,
  startSAVOrder,
  removeProductLine,
  setLineQuantity,
  fetchOrderByNumber,
  createSAVOrder,
  zeroOutOrderLines,
  setOriginalOrder,
  addInternalNote,
  sendEmailViaBooqable,
  addSAVComment,
  addSAVLine,
} from './booqable-orders'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

import {
  TOOL_REGISTRY,
  getOrderIdForStep,
  getOrderNumberForStep,
  extractVarsFromResult,
  type WorkflowStep,
  type WorkflowVars,
} from './workflow-state'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CodeStepResult = {
  success:    boolean
  resultText: string                 // JSON stringifié renvoyé comme tool_result
  newVars:    Partial<WorkflowVars>  // variables à merger dans wfState.vars
}

// ── Exécuteur principal ───────────────────────────────────────────────────────

export async function executeCodeStep(
  step: WorkflowStep,
  vars: WorkflowVars,
): Promise<CodeStepResult> {
  const orderId  = getOrderIdForStep(step, vars)
  const orderNum = getOrderNumberForStep(step, vars)
  const params   = step.parameters ?? {}
  const label    = orderNum ? `#${orderNum}` : orderId ? `(${orderId.slice(0, 8)}…)` : '?'

  function ok(data: Record<string, unknown>): CodeStepResult {
    const resultText = JSON.stringify(data)
    const newVars    = extractVarsFromResult(step.booqable_action ?? '', resultText, step)
    return { success: true, resultText, newVars }
  }
  function err(message: string): CodeStepResult {
    return { success: false, resultText: JSON.stringify({ error: message }), newVars: {} }
  }

  try {
    // ── Instruction step : affiche le titre/description comme message dans le chat ──
    if (step.type === 'instruction') {
      const msg = step.description ?? step.title ?? 'Information'
      return { success: true, resultText: JSON.stringify({ message: msg }), newVars: {} }
    }

    switch (step.booqable_action) {

      case 'list_order': {
        const ctx      = step.order_context ?? 'parent'
        const linesRaw = vars[`${ctx}.lines`]
        type Line = { product_name?: string; quantity?: number; stock_item_label?: string | null }
        let lines: Line[] = []
        if (linesRaw) {
          try { lines = JSON.parse(linesRaw) as Line[] } catch { /* ignore */ }
        } else if (orderId) {
          const order = await fetchOrderById(orderId)
          lines = order?.lines ?? []
        }
        if (!lines.length) return ok({ success: true, message: `Aucun article sur la commande ${label}` })
        const formatted = lines
          .map(l => `${l.quantity ?? 1} x ${l.product_name ?? '?'}${l.stock_item_label ? ` ${l.stock_item_label}` : ''}`)
          .join('\n')
        return ok({ success: true, message: `Articles de la commande ${label} :\n${formatted}` })
      }

      case 'fetch_order': {
        const ctx = step.order_context ?? 'parent'
        let order = null
        if (orderId) {
          order = await fetchOrderById(orderId)
        } else {
          // Fallback : numéro depuis vars (ex: 'parent.number' seedé depuis le message user)
          const fallbackNum = vars[`${ctx}.number`] ?? String(params.order_number ?? '')
          if (fallbackNum) order = await fetchOrderByNumber(fallbackNum)
        }
        if (!order) return err(`fetch_order : commande ${label} introuvable`)
        return ok({
          id:          order.id,
          number:      order.number,
          status:      order.status,
          customer_id: order.customer_id,
          tags:        order.tags,
          lines:       order.lines,
        })
      }

      case 'duplicate_order': {
        if (!orderId) return err('duplicate_order : order_id manquant dans les variables')
        const { newOrderId, newOrderNumber } = await duplicateOrder(orderId)
        return ok({
          success:          true,
          new_order_id:     newOrderId,
          new_order_number: newOrderNumber,
          message:          `✓ Commande ${label} dupliquée → nouvelle commande #${newOrderNumber}`,
        })
      }

      case 'revert_to_concept': {
        if (!orderId) return err('revert_to_concept : order_id manquant')
        await revertToConcept(orderId)
        return ok({ success: true, message: `✓ Commande ${label} repassée en draft` })
      }

      case 'clear_tags': {
        if (!orderId) return err('clear_tags : order_id manquant')
        await clearTags(orderId)
        return ok({ success: true, message: `✓ Tags supprimés sur la commande ${label}` })
      }

      case 'add_tag': {
        if (!orderId) return err('add_tag : order_id manquant')
        const ctx        = step.order_context ?? 'parent'
        const tagsAdd    = [...((params.tags_add as string[] | undefined) ?? [])]
        const tagsRemove = (params.tags_remove as string[] | undefined) ?? []
        // Ajouter automatiquement le tag choisi via choose_problem_tag si présent
        const chosenTag  = vars[`${ctx}.chosen_tag`]
        if (chosenTag && !tagsAdd.includes(chosenTag)) tagsAdd.push(chosenTag)
        await addTagToOrder(orderId, tagsAdd, tagsRemove.length > 0 ? tagsRemove : undefined)
        return ok({ success: true, tags_added: tagsAdd,
          message: `✓ Tags ajoutés sur ${label} : ${tagsAdd.join(', ')}` })
      }

      case 'choose_article': {
        // Présente les articles de la commande comme boutons — chosen_tag stockera le line_id choisi
        const ctx      = step.order_context ?? 'parent'
        const linesRaw = vars[`${ctx}.lines`]
        if (!linesRaw) return err('choose_article : lignes manquantes dans les variables (fetch_order requis avant)')
        try {
          const lines = JSON.parse(linesRaw) as Array<{ id: string; product_name: string; quantity: number; stock_item_identifier?: string }>
          const items = lines.map(l => {
            const shortId = l.stock_item_identifier?.match(/(\d+)$/)?.[1] ?? ''
            return {
              label: `${l.quantity ?? 1}x ${l.product_name}${shortId ? ' ID ' + shortId : ''}`,
              tag:   l.id,
            }
          })
          return ok({ __type__: 'choices', multiSelect: true, order_id: orderId ?? '', items,
            message: `Quels articles souhaitez-vous conserver sur la commande ${label} ? Les autres seront supprimés automatiquement.` })
        } catch {
          return err('choose_article : impossible de parser les lignes')
        }
      }

      case 'remove_other_lines': {
        // Supprime / réduit toutes les lignes SAUF celles dans vars[ctx.chosen_tag]
        // Supporte les IDs synthétiques (format: realLineId__siId) pour les lignes qty>1.
        const ctx        = step.order_context ?? 'parent'
        const keepTagStr = vars[`${ctx}.chosen_tag`]
        const linesRaw   = vars[`${ctx}.lines`]
        if (!linesRaw)   return err('remove_other_lines : lignes manquantes (fetch_order requis avant)')
        if (!keepTagStr) return err('remove_other_lines : chosen_tag manquant (choose_article requis avant)')

        const keepIds = keepTagStr.split(',').map(s => s.trim()).filter(Boolean)
        const lines   = JSON.parse(linesRaw) as Array<{ id: string; product_name?: string }>

        // Grouper les IDs synthétiques par real line ID
        // ID synthétique format : "realLineId__siId" ; ID normal : pas de "__"
        type LineGroup = { keep: number; total: number }
        const groups = new Map<string, LineGroup>()
        for (const line of lines) {
          const realId = line.id.includes('__') ? line.id.split('__')[0] : line.id
          const g = groups.get(realId) || { keep: 0, total: 0 }
          g.total++
          if (keepIds.includes(line.id)) g.keep++
          groups.set(realId, g)
        }

        let removedCount = 0
        let reducedCount = 0
        for (const [realLineId, g] of Array.from(groups.entries())) {
          if (g.keep === 0) {
            // Aucune unité à conserver → supprimer la ligne entière
            await removeProductLine(realLineId)
            removedCount++
          } else if (g.keep < g.total) {
            // Certaines unités à conserver → réduire la quantité
            await setLineQuantity(realLineId, g.keep)
            reducedCount++
          }
          // Si toutes unités conservées → rien à faire
        }

        // Lignes formatées pour le Commentaire SAV automatique
        // Format : "1 x [Nom produit] [ID si]" par ligne conservée
        const typedLines = lines as Array<{ id: string; product_name?: string }>
        const keptFormatted = typedLines
          .filter(l => keepIds.includes(l.id))
          .map(l => `1 x ${l.product_name || 'Article'}`)
        const keptProductsFormatted = keptFormatted.join('\n')

        return ok({
          success:            true,
          removed:            removedCount,
          reduced:            reducedCount,
          kept_product_names: keptProductsFormatted,
          message: `✓ ${removedCount} ligne(s) supprimée(s)${reducedCount > 0 ? `, ${reducedCount} réduite(s)` : ''}`,
        })
      }

      case 'choose_problem_tag': {
        // Envoie les options au frontend via l'événement SSE 'choices'
        // Le résultat __type__: 'choices' est intercepté dans route.ts
        const DEFAULT_PROBLEM_OPTIONS = [
          { label: 'Retard de retour',      tag: 'r11_late'    },
          { label: 'Perte du matériel',     tag: 'r12_missing' },
          { label: 'Vol du matériel',       tag: 'r13_theft'   },
          { label: 'Dommage sur matériel',  tag: 'r14_damage'  },
        ]
        const paramOptions = params.options as Array<{ label: string; tag: string }> | undefined
        const options = (paramOptions && paramOptions.length > 0) ? paramOptions : DEFAULT_PROBLEM_OPTIONS
        return ok({
          __type__: 'choices',
          order_id: orderId ?? '',
          items:    options,
          message:  `Quel est le type de problème pour la commande ${label} ?`,
        })
      }

      case 'reserve_order': {
        if (!orderId) return err('reserve_order : order_id manquant')
        const { error: reserveErr } = await reserveOrder(orderId)
        if (reserveErr) return ok({ success: true, warning: reserveErr,
          message: `⚠️ Réservation non bloquante : ${reserveErr}` })
        return ok({ success: true, message: `✓ Commande ${label} réservée` })
      }

      case 'start_order': {
        if (!orderId) return err('start_order : order_id manquant')
        const { error } = await startSAVOrder(orderId)
        if (error) return ok({ success: true, warning: error,
          message: `⚠️ start_order non bloquant : ${error}` })
        return ok({ success: true, message: `✓ Commande ${label} démarrée` })
      }

      case 'stop_order': {
        if (!orderId) return err('stop_order : order_id manquant')
        await stopOrder(orderId)
        return ok({ success: true, message: `✓ Commande ${label} stoppée` })
      }

      case 'cancel_order': {
        if (!orderId) return err('cancel_order : order_id manquant')
        await cancelOrder(orderId)
        return ok({ success: true, message: `✓ Commande ${label} annulée` })
      }

      case 'update_return_date': {
        if (!orderId) return err('update_return_date : order_id manquant')
        await updateOrderReturnDate(orderId)
        return ok({ success: true, message: `✓ Date de retour mise à jour pour ${label}` })
      }

      case 'remove_product_line': {
        const lineId = String(params.line_id ?? '')
        if (!lineId) return err('remove_product_line : line_id manquant dans parameters')
        await removeProductLine(lineId)
        return ok({ success: true, message: `✓ Ligne ${lineId} supprimée` })
      }

      case 'add_sav_comment': {
        if (!orderId) return err('add_sav_comment : order_id manquant')
        const originNum = String(params.origin_order_number ?? vars['original.number'] ?? vars['parent.number'] ?? orderNum ?? '')

        // Construction automatique du commentaire depuis le tag problème + produits conservés
        let comment = String(params.comment ?? '')
        if (!comment) {
          const ctx = step.order_context ?? 'parent'
          const tag       = vars[`${ctx}.chosen_tag`]  ?? ''
          const products  = vars[`${ctx}.kept_product_names`] ?? ''
          const prefixMap: Record<string, string> = {
            r11_late:    'Manquant',
            r12_missing: 'Perdu',
            r13_theft:   'Volé',
            r14_damage:  'Cassé',
          }
          const prefix = prefixMap[tag]
          if (prefix && products) comment = `${prefix}\n${products}`
          else if (prefix)        comment = prefix
        }

        if (!comment) return err('add_sav_comment : tag ou produits manquants (choose_problem_tag + remove_other_lines requis avant)')
        await addSAVComment(orderId, originNum, comment)
        return ok({ success: true, message: `✓ Commentaire SAV : "${comment}"` })
      }

      case 'create_new_return_order': {
        const ctx        = step.input_context ?? step.order_context ?? 'parent'
        const customerId = vars[`${ctx}.customer_id`]
        if (!customerId) return err('create_new_return_order : customer_id manquant dans les variables')
        const newOrder = await createSAVOrder({ customerId })
        if (!newOrder) return err('create_new_return_order : échec de création de la commande')
        return ok({
          success: true,
          id:      newOrder.id,
          number:  String(newOrder.number),
          message: `✓ Nouvelle commande de retour créée : #${newOrder.number}`,
        })
      }

      case 'zero_out_order_lines': {
        if (!orderId) return err('zero_out_order_lines : order_id manquant')
        await zeroOutOrderLines(orderId)
        return ok({ success: true, message: `✓ Lignes remises à 0 sur ${label}` })
      }

      case 'set_original_order': {
        // return.id = le step cible la commande de retour (order_context: 'return')
        // original.number = le numéro de la commande d'origine
        if (!orderId) return err('set_original_order : return order_id manquant')
        const originalNumber = vars['original.number']
        if (!originalNumber) return err('set_original_order : original.number manquant dans les variables')
        await setOriginalOrder(orderId, originalNumber)
        return ok({ success: true, message: `✓ Commande d'origine #${originalNumber} renseignée sur ${label}` })
      }

      case 'add_internal_note': {
        if (!orderId) return err('add_internal_note : order_id manquant')
        const note = String(params.note ?? '')
        if (!note) return err('add_internal_note : paramètre "note" manquant')
        await addInternalNote(orderId, note)
        return ok({ success: true, message: `✓ Note interne ajoutée sur ${label}` })
      }

      case 'draft_email': {
        const templateId  = String(params.template_id ?? '')
        const caseKeyArg  = params.case_key ? String(params.case_key) : null
        if (!templateId) return err('draft_email : paramètre template_id manquant')

        const sb = getSupabase()
        let query = sb
          .from('email_templates')
          .select('case_key, subject, body, conditions, sort_order')
          .eq('template_id', templateId)
          .order('sort_order')
        if (caseKeyArg) query = (query as typeof query).eq('case_key', caseKeyArg)

        const { data: rows } = await query
        if (!rows || rows.length === 0) return err(`draft_email : template "${templateId}" introuvable en DB`)

        // Sélection par score de conditions (insurance, caution, etc.)
        type EmailRow = { case_key?: string; subject: string; body: string; conditions: Record<string, boolean> | null; sort_order?: number }
        const typedRows = rows as EmailRow[]
        const conditions: Record<string, boolean> = {
          insurance:      Boolean(params.insurance),
          caution:        Boolean(params.caution),
          amountAbove500: Boolean(params.amount_above_500),
          latePayment:    Boolean(params.late_payment),
        }
        const score = (row: EmailRow) => {
          const c = row.conditions ?? {}
          return Object.entries(c).filter(([k, v]) => conditions[k] === v).length
               - Object.entries(c).filter(([k, v]) => conditions[k] !== v).length
        }
        const best = caseKeyArg ? typedRows[0] : typedRows.reduce((prev, cur) => score(cur) >= score(prev) ? cur : prev)

        // __type__: 'email_editor' → déclenche l'éditeur inline côté client
        return ok({ __type__: 'email_editor', subject: best.subject, body: best.body })
      }

      case 'send_email': {
        if (!orderId) return err('send_email : order_id manquant')
        const inputCtx = step.input_context ?? step.order_context ?? 'parent'
        const subject  = String(vars[`${inputCtx}.subject`] ?? params.subject ?? '')
        const body     = String(vars[`${inputCtx}.body`]    ?? params.body    ?? '')
        if (!subject || !body) return err('send_email : subject/body manquants — draft_email requis avant')
        await sendEmailViaBooqable(orderId, subject, body)
        return ok({ success: true, message: `✓ Email envoyé pour ${label}` })
      }

      case 'add_missing_lines': {
        // Lit les articles choisis (MANQUANTS) depuis original.chosen_tag + original.lines
        // Les ajoute à la return order (parent.id)
        // Stocke kept_product_names + chosen_tag="r11_late" → parent context (pour add_sav_comment)
        const ctx = step.order_context ?? 'original'
        const chosenStr    = vars[`${ctx}.chosen_tag`] ?? ''
        const linesRaw     = vars[`${ctx}.lines`]
        const returnOrderId = vars['parent.id']

        if (!returnOrderId) return err('add_missing_lines : parent.id manquant (create_new_return_order requis avant)')
        if (!linesRaw)      return err('add_missing_lines : lignes manquantes (fetch_order requis avant)')
        if (!chosenStr)     return err('add_missing_lines : aucun article sélectionné (choose_article requis avant)')

        const chosenIds = chosenStr.split(',').map(s => s.trim()).filter(Boolean)
        const allLines  = JSON.parse(linesRaw) as Array<{
          id: string
          product_name?: string
          product_group_id?: string
          stock_item_id?: string
        }>

        // Supporte les IDs synthétiques (format: realId__siId)
        const chosenLines = allLines.filter(l => {
          const realId = l.id.includes('__') ? l.id.split('__')[0] : l.id
          return chosenIds.includes(l.id) || chosenIds.includes(realId)
        })

        let addedCount = 0
        for (const line of chosenLines) {
          if (line.product_group_id) {
            await addSAVLine({
              type: 'product',
              orderId: returnOrderId,
              productGroupId: line.product_group_id,
              quantity: 1,
              stockItemId: line.stock_item_id ?? undefined,
            })
          } else {
            await addSAVLine({
              type: 'custom',
              orderId: returnOrderId,
              title: line.product_name || 'Article',
              quantity: 1,
            })
          }
          addedCount++
        }

        const formatted = chosenLines.map(l => `1 x ${l.product_name || 'Article'}`).join('\n')

        return ok({
          success:            true,
          kept_product_names: formatted,   // → parent.kept_product_names (pour add_sav_comment)
          chosen_tag:         'r11_late',  // → parent.chosen_tag (pour le préfixe "Manquant")
          message: `✓ ${addedCount} article(s) manquant(s) ajouté(s) à la commande de retour`,
        })
      }

      case 'add_new_product': {
        // Lit les articles choisis depuis ctx.chosen_tag (IDs) + ctx.lines (données complètes)
        // Si product_group_id → ligne produit ; sinon → ligne custom
        const ctx        = step.order_context ?? 'original'
        const chosenStr  = vars[`${ctx}.chosen_tag`] ?? ''
        const linesRaw   = vars[`${ctx}.lines`]
        const returnId   = vars['parent.id'] ?? vars[`${step.output_context ?? 'parent'}.id`]

        if (!returnId)  return err('add_new_product : return order id manquant (parent.id)')
        if (!linesRaw)  return err('add_new_product : lignes manquantes (fetch_order requis avant)')
        if (!chosenStr) return err('add_new_product : aucun article sélectionné (choose_article requis avant)')

        const chosenIds = chosenStr.split(',').map(s => s.trim()).filter(Boolean)
        const allLines  = JSON.parse(linesRaw) as Array<{
          id: string; product_name?: string; quantity?: number
          product_group_id?: string; stock_item_id?: string
        }>

        const chosenLines = allLines.filter(l => {
          const realId = l.id.includes('__') ? l.id.split('__')[0] : l.id
          return chosenIds.includes(l.id) || chosenIds.includes(realId)
        })

        let addedCount = 0
        for (const line of chosenLines) {
          if (line.product_group_id) {
            await addSAVLine({ type: 'product', orderId: returnId, productGroupId: line.product_group_id, quantity: line.quantity ?? 1, stockItemId: line.stock_item_id ?? undefined })
          } else {
            await addSAVLine({ type: 'custom', orderId: returnId, title: line.product_name || 'Article', quantity: line.quantity ?? 1 })
          }
          addedCount++
        }

        const formatted = chosenLines.map(l => `${l.quantity ?? 1} x ${l.product_name || 'Article'}`).join('\n')
        return ok({ success: true, kept_product_names: formatted, message: `✓ ${addedCount} article(s) ajouté(s) à la commande de retour` })
      }

      case 'add_new_product_line': {
        // Lit {input_context}.chosen_lines (JSON structuré construit par choose_article AI)
        // OU fallback : reconstruit depuis chosen_tag (IDs) + lines (si choose_article code/boutons)
        const srcCtx         = step.input_context ?? 'original'
        const chosenLinesRaw = vars[`${srcCtx}.chosen_lines`]
        const chosenTagRaw   = vars[`${srcCtx}.chosen_tag`]
        const linesRaw       = vars[`${srcCtx}.lines`]
        // La return order est toujours dans return.id (écrit par create_new_return_order)
        // On accepte aussi order_context si return.id absent (robustesse)
        const returnId = vars['return.id'] ?? vars[`${step.order_context ?? 'return'}.id`] ?? orderId

        if (!returnId) return err('add_new_product_line : return order id manquant dans les variables')

        type ChosenLine = {
          id: string; product_name?: string; quantity?: number
          product_group_id?: string | null; stock_item_id?: string | null
        }

        let chosenLines: ChosenLine[] = []

        if (chosenLinesRaw) {
          // Mode AI : chosen_lines contient les objets complets
          chosenLines = JSON.parse(chosenLinesRaw) as ChosenLine[]
        } else if (chosenTagRaw && linesRaw) {
          // Mode code/boutons : chosen_tag contient les IDs, on reconstruit depuis lines
          const chosenIds = chosenTagRaw.split(',').map(s => s.trim()).filter(Boolean)
          const allLines  = JSON.parse(linesRaw) as ChosenLine[]
          chosenLines = allLines.filter(l => {
            const realId = l.id.includes('__') ? l.id.split('__')[0] : l.id
            return chosenIds.includes(l.id) || chosenIds.includes(realId)
          })
        }

        if (!chosenLines.length) return err('add_new_product_line : aucun article sélectionné (choose_article requis avant)')

        const added: string[] = []
        for (const line of chosenLines) {
          if (line.product_group_id) {
            await addSAVLine({
              type:           'product',
              orderId:        returnId,
              productGroupId: line.product_group_id,
              quantity:       line.quantity ?? 1,
              stockItemId:    line.stock_item_id ?? undefined,
            })
          } else {
            await addSAVLine({
              type:     'custom',
              orderId:  returnId,
              title:    line.product_name || 'Article',
              quantity: line.quantity ?? 1,
            })
          }
          added.push(`${line.quantity ?? 1} x ${line.product_name || 'Article'}`)
        }

        return ok({
          success:            true,
          kept_product_names: added.join('\n'),
          chosen_tag:         'r11_late',
          message:            `✓ ${added.length} article(s) ajouté(s) à la commande de retour`,
        })
      }

      case 'send_email': {
        if (!orderId) return err('send_email : order_id manquant')
        const subject = String(params.subject ?? '')
        const body    = String(params.body ?? '')
        if (!subject || !body) return err('send_email : paramètres "subject" et "body" requis')
        await sendEmailViaBooqable(orderId, subject, body)
        return ok({ success: true, message: `✓ Email envoyé pour ${label}` })
      }

      default:
        return err(`Action "${step.booqable_action}" non supportée en mode code`)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[workflow-executor] ${step.booqable_action} FAILED:`, message)
    return { success: false, resultText: JSON.stringify({ error: message }), newVars: {} }
  }
}

/** Liste les outils disponibles dans le registre (pour info/debug). */
export function listRegisteredTools(): string[] {
  return Object.keys(TOOL_REGISTRY)
}
