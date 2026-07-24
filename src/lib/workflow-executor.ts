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
  renderBooqableEmailTemplate,
  searchProducts,
  addSAVComment,
  addSAVLine,
  setLineReplacementPrice,
  removeOrderDiscount,
  finalizeInvoice,
  renderBooqableEmailTemplateWithInvoice,
  sendEmailWithInvoiceViaBooqable,
  captureStripeDeposit,
  fetchOrderAmount,
  createManualPaymentCharge,
  createPaymentLink,
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
          id:             order.id,
          number:         order.number,
          status:         order.status,
          customer_id:    order.customer_id,
          customer_email: order.customer?.email ?? '',
          tags:           order.tags,
          lines:          order.lines,
        })
      }

      case 'fetch_original_from_field': {
        // Lit un custom field sur la commande order_context,
        // résout l'ID de la commande référencée et l'écrit dans output_context.id.
        // Param optionnel : field_name (défaut: 'order_sav')
        if (!orderId) return err('fetch_original_from_field : order_id manquant — exécuter fetch_order avant')
        const fieldName   = String(params.field_name ?? 'order_sav')
        const sourceOrder = await fetchOrderById(orderId)
        if (!sourceOrder) return err('fetch_original_from_field : commande introuvable')
        const fieldValue  = String(sourceOrder.properties_attributes?.[fieldName] ?? '').trim()
        if (!fieldValue) return err(`fetch_original_from_field : champ "${fieldName}" vide ou absent sur la commande`)
        const targetOrder = await fetchOrderByNumber(fieldValue)
        if (!targetOrder) return err(`fetch_original_from_field : commande #${fieldValue} introuvable`)
        return ok({
          id:      targetOrder.id,
          message: `✅ ${label} → commande #${fieldValue} (${targetOrder.id}) via champ "${fieldName}"`,
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
        // Ajouter automatiquement le sav_tag choisi via choose_problem_tag si présent
        const chosenTag  = vars[`${ctx}.sav_tag`]
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
        const keepTagStr = vars[`${ctx}.selected_ids`]
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

      case 'remove_discount': {
        if (!orderId) return err('remove_discount : order_id manquant')
        await removeOrderDiscount(orderId)
        return ok({ success: true, message: `✓ Remise supprimée sur ${label}` })
      }

      case 'finalize_invoice': {
        if (!orderId) return err('finalize_invoice : order_id manquant')
        const { document_id, number } = await finalizeInvoice(orderId)
        return ok({
          success:     true,
          document_id,
          invoice_number: number,
          message: `✓ Facture${number ? ` #${number}` : ''} finalisée`,
        })
      }

      case 'set_replacement_price': {
        // Met à jour le prix et le libellé d'une ligne Booqable
        // params.line_id    : UUID de la ligne à modifier
        // params.price_euros : prix en euros (converti en centimes)
        // params.charge_label : libellé optionnel (défaut : "Prix de remplacement")
        const lineId       = String(params.line_id ?? '')
        const priceEuros   = Number(params.price_euros ?? 0)
        const chargeLabel  = String(params.charge_label ?? 'Prix de remplacement')
        if (!lineId)       return err('set_replacement_price : line_id manquant dans parameters')
        if (!priceEuros)   return err('set_replacement_price : price_euros manquant ou nul dans parameters')
        await setLineReplacementPrice(lineId, priceEuros, chargeLabel)
        return ok({ success: true, message: `✓ Prix de remplacement fixé à ${priceEuros}€ sur la ligne ${lineId}` })
      }

      case 'add_sav_comment': {
        if (!orderId) return err('add_sav_comment : order_id manquant')
        const originNum = String(params.origin_order_number ?? vars['original.number'] ?? vars['parent.number'] ?? orderNum ?? '')

        // Construction du commentaire
        let comment = String(params.comment ?? '')
        if (comment) {
          // Préfixe fourni en paramètre → appende kept_product_names si disponible
          const productCtx = step.input_context ?? step.order_context ?? 'parent'
          const products   = vars[`${productCtx}.kept_product_names`] ?? ''
          if (products) comment = comment + products
        } else {
          // Auto-build depuis le tag problème + produits conservés
          const ctx = step.order_context ?? 'parent'
          const tag       = vars[`${ctx}.sav_tag`]  ?? ''
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
        // order_context = la return order (cible du champ Commande Origine)
        // input_context = la commande source dont on lit le numéro (défaut: 'original')
        if (!orderId) return err('set_original_order : return order_id manquant')
        const srcCtx = step.input_context ?? 'original'
        const originalNumber = vars[`${srcCtx}.number`]
        if (!originalNumber) return err(`set_original_order : ${srcCtx}.number manquant dans les variables`)
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
        // Priorité : params fixes → fallback vars dynamiques (ex: check_insurance)
        type EmailRow = { case_key?: string; subject: string; body: string; conditions: Record<string, boolean> | null; sort_order?: number }
        const typedRows = rows as EmailRow[]
        const emailCtx  = step.input_context ?? step.order_context ?? 'original'
        const conditions: Record<string, boolean> = {
          insurance:      Boolean(params.insurance)       || vars[`${emailCtx}.insurance`]         === 'true',
          caution:        Boolean(params.caution)         || vars[`${emailCtx}.security_deposit`]   === 'true'
                                                          || vars[`${emailCtx}.caution`]            === 'true',
          caution_card:   Boolean(params.caution_card)   || vars[`${emailCtx}.authorisation_card`] === 'true',
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

      case 'draft_email_booqable': {
        // Booqable résout les {{variables}} via /rendered_emails — aucune substitution manuelle
        const emailTemplateId = String(params.document_id ?? '')
        if (!emailTemplateId) return err('draft_email_booqable : document_id (email_template_id) manquant')
        if (!orderId)         return err('draft_email_booqable : order_id manquant')
        const rendered = await renderBooqableEmailTemplate(emailTemplateId, orderId)
        if (!rendered) return err(`draft_email_booqable : rendu template ${emailTemplateId} échoué`)
        return ok({
          __type__:           'email_preview',
          document_id:        emailTemplateId,
          active_document_id: emailTemplateId,   // permet à send_email_booqable de le pick up via vars
          name:               emailTemplateId,
          subject:            rendered.subject,
          body:               rendered.body,
        })
      }

      case 'send_email': {
        if (!orderId) return err('send_email : order_id manquant')
        const inputCtx = step.input_context ?? step.order_context ?? 'parent'
        const subject  = String(vars[`${inputCtx}.subject`] ?? params.subject ?? '')
        const body     = String(vars[`${inputCtx}.body`]    ?? params.body    ?? '')
        if (!subject || !body) return err('send_email : subject/body manquants — draft_email requis avant')
        // Récupère customer_email depuis vars, sinon fallback fetch order
        let recipientEmail = String(vars[`${inputCtx}.customer_email`] ?? params.recipient_email ?? '')
        if (!recipientEmail) {
          const fetchedOrder = await fetchOrderById(orderId)
          recipientEmail = fetchedOrder?.customer?.email ?? ''
        }
        if (!recipientEmail) return err('send_email : email client introuvable sur la commande')
        await sendEmailViaBooqable(orderId, subject, body, recipientEmail)
        return ok({ success: true, message: `✓ Email envoyé pour ${label}` })
      }

      case 'send_email_booqable': {
        // 1. Rend le template via /rendered_emails (Booqable résout les {{variables}})
        // 2. Envoie le contenu rendu via /emails
        if (!orderId) return err('send_email_booqable : order_id manquant')
        const inputCtx      = step.input_context ?? step.order_context ?? 'parent'
        // Priorité : active_document_id stocké par draft_email_booqable dans vars > params.document_id
        const emailTemplateId = String(
          vars[`${inputCtx}.active_document_id`] ?? params.document_id ?? ''
        )
        if (!emailTemplateId) return err('send_email_booqable : document_id (email_template_id) manquant — spécifiez-le en paramètre ou exécutez draft_email_booqable avant')

        // Récupère l'email du client
        let customerId     = String(vars[`${inputCtx}.customer_id`]    ?? '')
        let recipientEmail = String(vars[`${inputCtx}.customer_email`] ?? '')
        if (!customerId || !recipientEmail) {
          const fetchedOrder = await fetchOrderById(orderId)
          if (!customerId)     customerId    = fetchedOrder?.customer_id ?? ''
          if (!recipientEmail) recipientEmail = fetchedOrder?.customer?.email ?? ''
        }
        if (!customerId)     return err('send_email_booqable : customer_id introuvable')
        if (!recipientEmail) return err('send_email_booqable : email client introuvable')

        // Rend le template
        const rendered = await renderBooqableEmailTemplate(emailTemplateId, orderId)
        if (!rendered) return err(`send_email_booqable : rendu template ${emailTemplateId} échoué`)

        // Envoie avec customer_id + document_ids pour l'historique Booqable
        await sendEmailViaBooqable(orderId, rendered.subject, rendered.body, recipientEmail, customerId, emailTemplateId)
        return ok({ success: true, message: `✓ Email template envoyé pour ${label}` })
      }

      case 'draft_email_with_invoice_booqable': {
        // Comme draft_email_booqable mais inclut document_id (facture) dans le rendu
        const emailTemplateId = String(params.document_id ?? '')
        if (!emailTemplateId) return err('draft_email_with_invoice_booqable : document_id (email_template_id) manquant')
        if (!orderId)         return err('draft_email_with_invoice_booqable : order_id manquant')
        const inputCtx   = step.input_context ?? step.order_context ?? 'return'
        const invoiceDocId = String(vars[`${inputCtx}.document_id`] ?? params.invoice_document_id ?? '')
        if (!invoiceDocId) return err('draft_email_with_invoice_booqable : document_id facture introuvable dans vars — exécutez finalize_invoice avant')
        const rendered = await renderBooqableEmailTemplateWithInvoice(emailTemplateId, orderId, invoiceDocId)
        if (!rendered) return err(`draft_email_with_invoice_booqable : rendu template ${emailTemplateId} échoué`)
        return ok({
          __type__:           'email_preview',
          document_id:        emailTemplateId,
          active_document_id: emailTemplateId,
          name:               emailTemplateId,
          subject:            rendered.subject,
          body:               rendered.body,
        })
      }

      case 'send_email_with_invoice_booqable': {
        // Comme send_email_booqable mais joint la facture (document_ids)
        if (!orderId) return err('send_email_with_invoice_booqable : order_id manquant')
        const inputCtx      = step.input_context ?? step.order_context ?? 'return'
        const emailTemplateId = String(vars[`${inputCtx}.active_document_id`] ?? params.document_id ?? '')
        if (!emailTemplateId) return err('send_email_with_invoice_booqable : template manquant — exécutez draft_email_with_invoice_booqable avant')
        const invoiceDocId = String(vars[`${inputCtx}.document_id`] ?? params.invoice_document_id ?? '')
        if (!invoiceDocId) return err('send_email_with_invoice_booqable : document_id facture introuvable — exécutez finalize_invoice avant')

        let customerId     = String(vars[`${inputCtx}.customer_id`]    ?? '')
        let recipientEmail = String(vars[`${inputCtx}.customer_email`] ?? '')
        if (!customerId || !recipientEmail) {
          const fetchedOrder = await fetchOrderById(orderId)
          if (!customerId)     customerId    = fetchedOrder?.customer_id ?? ''
          if (!recipientEmail) recipientEmail = fetchedOrder?.customer?.email ?? ''
        }
        if (!customerId)     return err('send_email_with_invoice_booqable : customer_id introuvable')
        if (!recipientEmail) return err('send_email_with_invoice_booqable : email client introuvable')

        const rendered = await renderBooqableEmailTemplateWithInvoice(emailTemplateId, orderId, invoiceDocId)
        if (!rendered) return err(`send_email_with_invoice_booqable : rendu template ${emailTemplateId} échoué`)

        await sendEmailWithInvoiceViaBooqable(orderId, rendered.subject, rendered.body, recipientEmail, customerId, emailTemplateId, invoiceDocId)
        return ok({ success: true, message: `✓ Email avec facture envoyé pour ${label}` })
      }

      case 'add_missing_lines': {
        // Lit les articles choisis (MANQUANTS) depuis original.chosen_tag + original.lines
        // Les ajoute à la return order (parent.id)
        // Stocke kept_product_names + chosen_tag="r11_late" → parent context (pour add_sav_comment)
        const ctx = step.order_context ?? 'original'
        const chosenStr    = vars[`${ctx}.selected_ids`] ?? ''
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
          kept_product_names: formatted,   // → output_context.kept_product_names (pour add_sav_comment)
          message: `✓ ${addedCount} article(s) ajouté(s) à la commande de retour`,
        })
      }

      case 'add_new_product': {
        // Lit les articles choisis depuis ctx.chosen_tag (IDs) + ctx.lines (données complètes)
        // Si product_group_id → ligne produit ; sinon → ligne custom
        const ctx        = step.order_context ?? 'original'
        const chosenStr  = vars[`${ctx}.selected_ids`] ?? ''
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
        const chosenTagRaw   = vars[`${srcCtx}.selected_ids`]
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
          let productGroupId = line.product_group_id ?? null

          // Pas de product_group_id (custom_ line du matching texte) → chercher dans Booqable par nom
          if (!productGroupId && line.product_name) {
            try {
              const results = await searchProducts(line.product_name)
              if (results.length > 0) {
                // Prend le meilleur match (nom le plus proche)
                const nameLow = line.product_name.toLowerCase()
                const exact = results.find(r => r.name.toLowerCase() === nameLow)
                const best  = exact ?? results.find(r =>
                  r.name.toLowerCase().includes(nameLow) || nameLow.includes(r.name.toLowerCase())
                )
                if (best) productGroupId = best.id
              }
            } catch { /* ignore — fallback custom */ }
          }

          if (productGroupId) {
            await addSAVLine({
              type:           'product',
              orderId:        returnId,
              productGroupId,
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
          message:            `✓ ${added.length} article(s) ajouté(s) à la commande de retour`,
        })
      }

      case 'send_email': {  // dead code — handled above
        if (!orderId) return err('send_email : order_id manquant')
        const subject2   = String(params.subject ?? '')
        const body2      = String(params.body ?? '')
        const recipient2 = String(params.recipient_email ?? '')
        if (!subject2 || !body2) return err('send_email : paramètres "subject" et "body" requis')
        await sendEmailViaBooqable(orderId, subject2, body2, recipient2)
        return ok({ success: true, message: `✓ Email envoyé pour ${label}` })
      }

      case 'check_deposit': {
        // Vérifie la caution sur la commande :
        //   1. Dépôt physique  → GET /api/4/orders/{id}  (deposit_in_cents > 0)
        //   2. Autorisation carte → GET /api/boomerang/orders/{id}?include=payments,payments.payment_method
        //      → cherche payment_authorizations avec status=succeeded, capturable=true, non expiré
        if (!orderId) return err('check_deposit : order_id manquant')

        const BASE4_URL      = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/4`
        const BASE_BOOMERANG = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/boomerang`
        const hdrs = {
          Authorization: `Bearer ${process.env.BOOQABLE_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }

        // ── Appels en parallèle ────────────────────────────────────────────
        const [depositRes, authRes] = await Promise.all([
          fetch(`${BASE4_URL}/orders/${orderId}?fields[orders]=deposit_in_cents,deposit_paid_in_cents,deposit_type,deposit_value`, {
            headers: hdrs, signal: AbortSignal.timeout(10000),
          }),
          fetch(`${BASE_BOOMERANG}/orders/${orderId}?include=payments%2Cpayments.payment_method`, {
            headers: hdrs, signal: AbortSignal.timeout(10000),
          }),
        ])

        // ── 1. Dépôt physique ─────────────────────────────────────────────
        let securityDeposit  = false
        let depositInCents   = 0
        let depositPaidInCents = 0
        let depositType      = ''
        if (depositRes.ok) {
          const depositData = await depositRes.json() as { data?: { attributes?: Record<string, unknown> } }
          const attrs = depositData.data?.attributes ?? {}
          depositInCents     = Number(attrs.deposit_in_cents     ?? 0)
          depositPaidInCents = Number(attrs.deposit_paid_in_cents ?? 0)
          depositType        = String(attrs.deposit_type         ?? '')
          securityDeposit    = depositInCents > 0
        } else {
          console.warn(`[check_deposit] deposit fetch failed: ${depositRes.status}`)
        }

        // ── 2. Autorisation carte ─────────────────────────────────────────
        let cardActive               = false
        let cardAmountCents          = 0
        let cardCaptureBefore        = ''
        let paymentAuthorizationId   = ''   // ID Booqable de l'autorisation
        let providerId               = ''   // ID Stripe (payment_intent ou charge)
        if (authRes.ok) {
          const authData = await authRes.json() as {
            included?: Array<{ type: string; id: string; attributes: Record<string, unknown> }>
          }
          const now = new Date()
          for (const item of authData.included ?? []) {
            if (item.type !== 'payment_authorizations') continue
            const a = item.attributes
            const captureBeforeDate = a.capture_before ? new Date(String(a.capture_before)) : null
            const isActive =
              a.provider_method === 'card' &&
              a.status          === 'succeeded' &&
              a.capturable      === true &&
              Number(a.deposit_capturable_in_cents ?? 0) > 0 &&
              a.canceled_at     === null &&
              a.expired_at      === null &&
              captureBeforeDate !== null &&
              captureBeforeDate > now
            if (isActive) {
              cardActive             = true
              cardAmountCents        = Number(a.deposit_capturable_in_cents ?? 0)
              cardCaptureBefore      = String(a.capture_before ?? '')
              paymentAuthorizationId = item.id
              providerId             = String(a.provider_id ?? '')
              break
            }
          }
        } else {
          console.warn(`[check_deposit] auth fetch failed: ${authRes.status}`)
        }

        // ── Message de statut ─────────────────────────────────────────────
        const depositEmoji  = securityDeposit ? '✅' : '❌'
        const depositLabel  = securityDeposit
          ? `OUI — ${(depositInCents / 100).toFixed(2)} € (type: ${depositType || '?'}, payé: ${(depositPaidInCents / 100).toFixed(2)} €)`
          : 'NON'
        const cardEmoji     = cardActive ? '✅' : '❌'
        const cardLabel     = cardActive
          ? `OUI — ${(cardAmountCents / 100).toFixed(2)} € (capture avant ${cardCaptureBefore.slice(0, 10)})`
          : 'NON'

        const message = [
          `💳 Dépôt physique : ${depositEmoji} ${depositLabel}`,
          `💳 Autorisation carte : ${cardEmoji} ${cardLabel}`,
        ].join('\n')

        return ok({
          security_deposit:          securityDeposit ? 'true' : 'false',
          authorisation_card:        cardActive       ? 'true' : 'false',
          payment_authorization_id:  paymentAuthorizationId,
          provider_id:               providerId,
          message,
        })
      }

      case 'check_insurance': {
        // Vérifie si l'assurance est présente dans les lignes de la commande.
        // product_group_id de l'assurance : 7ade5f07-d1d4-46de-8044-77698d6173be
        // Param optionnel : insurance_product_group_id (pour surcharger le product_group par défaut)
        const INSURANCE_PG = String(params.insurance_product_group_id ?? '7ade5f07-d1d4-46de-8044-77698d6173be')
        const ctx      = step.order_context ?? 'original'
        const linesRaw = vars[`${ctx}.lines`]

        type OrderLine = { product_group_id?: string | null }
        let lines: OrderLine[] = []

        if (linesRaw) {
          try { lines = JSON.parse(linesRaw) as OrderLine[] } catch { /* ignore */ }
        } else if (orderId) {
          const order = await fetchOrderById(orderId)
          lines = (order?.lines ?? []) as OrderLine[]
        } else {
          return err('check_insurance : order_id manquant et lignes absentes des variables (fetch_order requis avant)')
        }

        const hasInsurance = lines.some(l => l.product_group_id === INSURANCE_PG)
        const insuranceStr = hasInsurance ? 'true' : 'false'
        const statusEmoji  = hasInsurance ? '✅' : '❌'
        const statusLabel  = hasInsurance ? 'OUI' : 'NON'

        return ok({
          insurance: insuranceStr,
          message:   `${statusEmoji} Assurance : ${statusLabel} (commande ${label})`,
        })
      }


      case 'fetch_order_amount': {
        // Récupère le total TTC d'une commande (grand_total_in_cents via Boomerang).
        // Utilise order_context pour cibler la commande.
        if (!orderId) return err('fetch_order_amount : order_id manquant — exécuter fetch_order avant')
        const { grandTotalCents, priceCents, depositCents } = await fetchOrderAmount(orderId)
        const grandTotalEuros = grandTotalCents / 100
        const priceEuros      = priceCents      / 100
        const depositEuros    = depositCents    / 100
        return ok({
          grand_total_euros: grandTotalEuros.toFixed(2),
          price_euros:       priceEuros.toFixed(2),
          deposit_euros:     depositEuros.toFixed(2),
          message: `💰 Total commande ${label} : ${grandTotalEuros.toFixed(2)} € TTC (HT: ${priceEuros.toFixed(2)} €, caution: ${depositEuros.toFixed(2)} €)`,
        })
      }

      case 'capture_stripe_deposit': {
        // Capture une autorisation bancaire Stripe (PaymentIntent en requires_capture).
        // Lit provider_id depuis les vars (écrit par check_deposit).
        // Params :
        //   amount_euros    (requis) – montant à capturer
        //   description     (optionnel) – libellé Stripe (ex: "SAV #9412 – caution #9396")
        //   sav_order_number (optionnel) – ajouté en metadata
        //   reason           (optionnel) – ex: "damage", "theft", "late" – ajouté en metadata

        // provider_id + grand_total_euros : tous deux lus depuis input_context (default: 'return')
        // → read_stripe_deposit (order_context: original, output_context: return) écrit return.provider_id
        // → fetch_order_amount  (order_context: return,   output_context: return) écrit return.grand_total_euros
        const inputCtx   = step.input_context ?? 'return'
        const providerId = vars[`${inputCtx}.provider_id`] ?? ''
        if (!providerId) return err('capture_stripe_deposit : provider_id manquant — exécuter read_stripe_deposit (output_context: return) avant')

        // Montant : vars[input_context.grand_total_euros] > params.amount_euros
        const amountFromVars = parseFloat(String(vars[`${inputCtx}.grand_total_euros`] ?? '0'))
        const amountEuros    = amountFromVars > 0
          ? amountFromVars
          : parseFloat(String(params.amount_euros ?? '0'))
        if (!amountEuros || amountEuros <= 0) return err('capture_stripe_deposit : montant introuvable — exécuter fetch_order_amount (return) avant ou passer amount_euros en paramètre')
        const amountCents = Math.round(amountEuros * 100)

        // Numéro de commande depuis order_context (commande de retour / SAV)
        const orderCtx        = step.order_context ?? 'return'
        const orderNumberAuto = vars[`${orderCtx}.number`] ?? ''

        // Description : paramètre explicite > auto depuis order_context ("Order #xxxx")
        const descriptionParam = params.description
          ? String(params.description)
          : orderNumberAuto
            ? `Order #${orderNumberAuto}`
            : undefined

        // sav_order_number : paramètre explicite > order_context
        const savOrderNumber = params.sav_order_number
          ? String(params.sav_order_number)
          : orderNumberAuto || undefined

        const reason = params.reason ? String(params.reason) : undefined

        const metadata: Record<string, string> = {}
        if (savOrderNumber) metadata['sav_order'] = savOrderNumber
        if (reason)         metadata['reason']     = reason

        const { chargeId, amountCaptured } = await captureStripeDeposit({
          providerId,
          amountCents,
          description: descriptionParam,
          metadata:    Object.keys(metadata).length > 0 ? metadata : undefined,
        })

        // Enregistrement du paiement manuel dans Booqable (order_context)
        if (!orderId) return err('capture_stripe_deposit : order_id manquant pour le paiement manuel Booqable')
        const { paymentChargeId } = await createManualPaymentCharge({
          orderId,
          amountCents: amountCaptured,
        })

        const amountFormatted = (amountCaptured / 100).toFixed(2)
        return ok({
          stripe_charge_id:   chargeId,
          payment_charge_id:  paymentChargeId,
          captured_amount:    String(amountCaptured),
          message: `✅ Caution capturée : ${amountFormatted} € — Stripe : ${chargeId} — Booqable : ${paymentChargeId}`,
        })
      }

      case 'create_payment_link': {
        // Crée un lien de paiement Booqable (mode: "request") et le stocke
        // dans le champ custom "lien_paiement" de la commande order_context.
        // Params :
        //   amount_euros      (requis) – montant du lien ; si absent lit input_context.grand_total_euros
        //   field_name        (optionnel) – identifiant du champ custom (défaut: 'lien_paiement')
        //   field_label       (optionnel) – label affiché (défaut: 'Lien paiement')
        if (!orderId) return err('create_payment_link : order_id manquant — exécuter fetch_order avant')

        const inputCtx       = step.input_context ?? 'return'
        const amountFromVars = parseFloat(String(vars[`${inputCtx}.grand_total_euros`] ?? '0'))
        const amountEuros    = amountFromVars > 0
          ? amountFromVars
          : parseFloat(String(params.amount_euros ?? '0'))
        if (!amountEuros || amountEuros <= 0) return err('create_payment_link : montant introuvable — utiliser fetch_order_amount avant ou passer amount_euros en paramètre')
        const amountCents = Math.round(amountEuros * 100)

        const { paymentChargeId, checkoutUrl } = await createPaymentLink({
          orderId,
          amountCents,
          customFieldName:  params.field_name  ? String(params.field_name)  : undefined,
          customFieldLabel: params.field_label ? String(params.field_label) : undefined,
        })

        return ok({
          payment_charge_id: paymentChargeId,
          checkout_url:      checkoutUrl,
          message: `✅ Lien de paiement créé : ${checkoutUrl}`,
        })
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
