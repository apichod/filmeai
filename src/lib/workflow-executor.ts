/**
 * Workflow Executor — exécution directe des steps "code" sans LLM.
 *
 * Pour chaque step avec execution: 'code', le serveur appelle directement
 * la fonction Booqable correspondante, sans passer par OpenAI.
 *
 * Avantages :
 *  - 100% fiable (pas d'hallucination possible)
 *  - Instantané (pas de latence LLM)
 *  - Moins coûteux (pas de tokens)
 *
 * Règle : un step peut être 'code' si tous ses arguments sont disponibles
 * dans wfState.vars + step.parameters au moment de l'exécution.
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
} from './booqable-orders'

import {
  getOrderIdForStep,
  getOrderNumberForStep,
  extractVarsFromResult,
  type WorkflowStep,
  type WorkflowVars,
} from './workflow-state'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CodeStepResult = {
  success:    boolean
  resultText: string                   // JSON stringifié envoyé au client comme tool_result
  newVars:    Partial<WorkflowVars>    // variables à merger dans wfState.vars
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
    const newVars = extractVarsFromResult(step.booqable_action ?? '', resultText, step)
    return { success: true, resultText, newVars }
  }
  function err(message: string): CodeStepResult {
    return { success: false, resultText: JSON.stringify({ error: message }), newVars: {} }
  }

  try {
    switch (step.booqable_action) {

      // ── fetch_order ─────────────────────────────────────────────────────────
      // Requiert : UUID dans vars (context déjà résolu) OU number dans parameters
      case 'fetch_order': {
        let order = null
        if (orderId) {
          order = await fetchOrderById(orderId)
        } else if (params.order_number) {
          order = await fetchOrderByNumber(String(params.order_number))
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

      // ── duplicate_order ─────────────────────────────────────────────────────
      case 'duplicate_order': {
        if (!orderId) return err('duplicate_order : order_id manquant dans les variables')
        const { newOrderId, newOrderNumber } = await duplicateOrder(orderId)
        return ok({ success: true, new_order_id: newOrderId, new_order_number: newOrderNumber,
          message: `✓ Commande ${label} dupliquée → nouvelle commande #${newOrderNumber}` })
      }

      // ── revert_to_concept ───────────────────────────────────────────────────
      case 'revert_to_concept': {
        if (!orderId) return err('revert_to_concept : order_id manquant')
        await revertToConcept(orderId)
        return ok({ success: true, message: `✓ Commande ${label} repassée en draft` })
      }

      // ── clear_tags ──────────────────────────────────────────────────────────
      case 'clear_tags': {
        if (!orderId) return err('clear_tags : order_id manquant')
        await clearTags(orderId)
        return ok({ success: true, message: `✓ Tags supprimés sur la commande ${label}` })
      }

      // ── add_tag ─────────────────────────────────────────────────────────────
      case 'add_tag': {
        if (!orderId) return err('add_tag : order_id manquant')
        const tagsAdd    = (params.tags_add    as string[] | undefined) ?? []
        const tagsRemove = (params.tags_remove as string[] | undefined) ?? []
        await addTagToOrder(orderId, tagsAdd, tagsRemove.length > 0 ? tagsRemove : undefined)
        return ok({ success: true, tags_added: tagsAdd,
          message: `✓ Tags ajoutés sur ${label} : ${tagsAdd.join(', ')}` })
      }

      // ── reserve_order ───────────────────────────────────────────────────────
      case 'reserve_order': {
        if (!orderId) return err('reserve_order : order_id manquant')
        await reserveOrder(orderId)
        return ok({ success: true, message: `✓ Commande ${label} réservée (concept → reserved)` })
      }

      // ── start_order ─────────────────────────────────────────────────────────
      case 'start_order': {
        if (!orderId) return err('start_order : order_id manquant')
        const { error } = await startSAVOrder(orderId)
        if (error) return ok({ success: true, warning: error,
          message: `⚠️ start_order non bloquant : ${error}` })
        return ok({ success: true, message: `✓ Commande ${label} démarrée (started)` })
      }

      // ── stop_order ──────────────────────────────────────────────────────────
      case 'stop_order': {
        if (!orderId) return err('stop_order : order_id manquant')
        await stopOrder(orderId)
        return ok({ success: true, message: `✓ Commande ${label} stoppée (matériel retourné)` })
      }

      // ── cancel_order ────────────────────────────────────────────────────────
      case 'cancel_order': {
        if (!orderId) return err('cancel_order : order_id manquant')
        await cancelOrder(orderId)
        return ok({ success: true, message: `✓ Commande ${label} annulée` })
      }

      // ── update_return_date ──────────────────────────────────────────────────
      case 'update_return_date': {
        if (!orderId) return err('update_return_date : order_id manquant')
        await updateOrderReturnDate(orderId)
        return ok({ success: true, message: `✓ Date de retour mise à jour à aujourd'hui pour ${label}` })
      }

      // ── remove_product_line ─────────────────────────────────────────────────
      // Requiert : line_id dans parameters (défini à l'avance ou extrait des vars)
      case 'remove_product_line': {
        const lineId = String(params.line_id ?? '')
        if (!lineId) return err('remove_product_line : line_id manquant dans parameters')
        await removeProductLine(lineId)
        return ok({ success: true, message: `✓ Ligne ${lineId} supprimée` })
      }

      // ── Non supporté en mode code ────────────────────────────────────────────
      default:
        return err(`Action "${step.booqable_action}" non supportée en mode code — utiliser execution: 'ai'`)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[workflow-executor] ${step.booqable_action} FAILED:`, message)
    return { success: false, resultText: JSON.stringify({ error: message }), newVars: {} }
  }
}
