/**
 * Workflow Executor — exécution directe des steps "code" sans LLM.
 *
 * Utilise TOOL_REGISTRY pour extraire les variables résultantes
 * (plus de switch/case hardcodé).
 */

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
  fetchOrderByNumber,
  createSAVOrder,
  zeroOutOrderLines,
  setOriginalOrder,
  addInternalNote,
  sendEmailViaBooqable,
  addSAVComment,
} from './booqable-orders'

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
    switch (step.booqable_action) {

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
        // Supprime toutes les lignes SAUF celle dont l'id est dans vars[ctx.chosen_tag]
        const ctx        = step.order_context ?? 'parent'
        const keepLineId = vars[`${ctx}.chosen_tag`]
        const linesRaw   = vars[`${ctx}.lines`]
        if (!linesRaw)   return err('remove_other_lines : lignes manquantes (fetch_order requis avant)')
        if (!keepLineId) return err('remove_other_lines : chosen_tag manquant (choose_article requis avant)')
        const keepIds = keepLineId.split(',').map(s => s.trim()).filter(Boolean)
        const lines = JSON.parse(linesRaw) as Array<{ id: string }>
        const toRemove = lines.filter(l => !keepIds.includes(l.id))
        for (const line of toRemove) {
          await removeProductLine(line.id)
        }
        // Réinitialiser chosen_tag pour qu'il soit libre pour choose_problem_tag
        return ok({ success: true, removed: toRemove.length,
          message: `✓ ${toRemove.length} ligne(s) supprimée(s) — ${keepIds.length} conservée(s)`,
          chosen_tag: null,  // reset
        })
      }

      case 'choose_problem_tag': {
        // Envoie les options au frontend via l'événement SSE 'choices'
        // Le résultat __type__: 'choices' est intercepté dans route.ts
        const options = (params.options as Array<{ label: string; tag: string }> | undefined) ?? []
        return ok({
          __type__: 'choices',
          order_id: orderId ?? '',
          items:    options,
          message:  `Quel est le type de problème pour la commande ${label} ?`,
        })
      }

      case 'reserve_order': {
        if (!orderId) return err('reserve_order : order_id manquant')
        await reserveOrder(orderId)
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
        const originNum = orderNum ?? ''
        const comment   = String(params.comment ?? '')
        if (!comment) return err('add_sav_comment : paramètre "comment" manquant')
        await addSAVComment(orderId, originNum, comment)
        return ok({ success: true, message: `✓ Commentaire SAV ajouté sur ${label}` })
      }

      case 'create_new_return_order': {
        const ctx        = step.order_context ?? 'parent'
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
