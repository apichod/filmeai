/**
 * Moteur d'état pour les workflows FilmeAI.
 *
 * Convention de nommage des variables : "<context>.<champ_booqable>"
 *   parent.id, parent.number, parent.lines
 *   child.id,  child.number,  child.lines
 *   original.id, original.number
 *   return.id,   return.number, return.lines
 *
 * input_context  = source    — préfixe des vars lues (données entrantes)
 * order_context  = target order — quelle commande Booqable l'action cible (injecte l'order_id)
 * output_context = destination — préfixe des vars écrites (résultats)
 *                  Exception : duplicate_order lit parent, écrit child
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrderContext = 'parent' | 'child' | 'original' | 'return'

/** Variables du workflow — clés dotted: "parent.id", "child.number", etc. */
export type WorkflowVars = Record<string, string | undefined>

export type WorkflowState = {
  step_index: number
  vars:       WorkflowVars
  status:     'running' | 'waiting_for_input' | 'completed'
}

export type WorkflowStep = {
  id:              string
  type:            'action' | 'question' | 'check' | 'instruction'
  title:           string
  description?:    string
  booqable_action?: string
  parameters?:     Record<string, unknown>
  input_context?:  OrderContext   // source    : préfixe des vars lues
  order_context?:  OrderContext   // target order : commande Booqable ciblée (injecte l'order_id)
  output_context?: OrderContext   // destination  : préfixe des vars écrites (défaut: order_context)
  execution?:      'code' | 'ai'
  condition?:      string         // ex: "original.insurance == 'true' AND original.security_deposit == 'true'"
}

// ── Registre des outils ───────────────────────────────────────────────────────

export type ToolDefinition = {
  label:  string
  /** Champs lus depuis vars[order_context.*] */
  reads:  string[]
  /** Champs écrits dans vars[output_context.*] après exécution */
  writes: string[]
  /**
   * Mapping entre le nom de champ dans le résultat JSON de l'API
   * et le nom standard Booqable stocké dans les vars.
   * Nécessaire quand l'API retourne "new_order_id" mais on veut stocker "id".
   */
  resultAlias?: Record<string, string>
}

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  fetch_order: {
    label:  'Récupérer une commande',
    reads:  ['id'],
    writes: ['id', 'number', 'status', 'customer_id', 'tags', 'lines'],
  },
  duplicate_order: {
    label:       'Dupliquer une commande',
    reads:       ['id'],
    writes:      ['id', 'number'],
    resultAlias: { id: 'new_order_id', number: 'new_order_number' },
  },
  revert_to_concept: {
    label:  'Repasser en draft',
    reads:  ['id'],
    writes: [],
  },
  clear_tags: {
    label:  'Supprimer les tags',
    reads:  ['id'],
    writes: [],
  },
  add_tag: {
    label:  'Ajouter un tag',
    reads:  ['id'],
    writes: [],
  },
  choose_problem_tag: {
    label:  'Choisir le tag problème (boutons)',
    reads:  ['id'],
    writes: ['sav_tag'],   // tag SAV sélectionné : r11_late, r12_missing, r13_theft, r14_damage
  },
  reserve_order: {
    label:  'Réserver',
    reads:  ['id'],
    writes: [],
  },
  start_order: {
    label:  'Démarrer (pick-up)',
    reads:  ['id'],
    writes: [],
  },
  stop_order: {
    label:  'Stopper (retour matériel)',
    reads:  ['id'],
    writes: [],
  },
  cancel_order: {
    label:  'Annuler',
    reads:  ['id'],
    writes: [],
  },
  update_return_date: {
    label:  'Mettre à jour la date de retour',
    reads:  ['id'],
    writes: [],
  },
  list_order: {
    label:  'Lister les articles de la commande',
    reads:  ['lines'],
    writes: [],
  },
  remove_product_line: {
    label:  'Supprimer une ligne produit',
    reads:  [],   // prend line_id depuis parameters, pas order_id
    writes: [],
  },
  add_sav_comment: {
    label:  'Ajouter un commentaire SAV',
    reads:  ['id', 'number', 'kept_product_names'],
    writes: [],
  },
  remove_discount: {
    label:  'Supprimer la remise de la commande',
    reads:  ['id'],
    writes: [],
  },
  finalize_invoice: {
    label:  'Finaliser la facture de la commande',
    reads:  ['id'],
    writes: ['document_id', 'invoice_number'],
  },
  draft_email_with_invoice_booqable: {
    label:  'Aperçu template Booqable avec facture jointe',
    reads:  ['id', 'document_id'],
    writes: ['active_document_id'],
  },
  send_email_with_invoice_booqable: {
    label:  'Envoyer email Booqable avec facture en pièce jointe',
    reads:  ['id', 'customer_id', 'customer_email', 'active_document_id', 'document_id'],
    writes: [],
  },
  set_replacement_price: {
    label:  'Fixer le prix de remplacement d\'une ligne',
    reads:  ['id', 'lines'],
    writes: ['kept_product_names'],   // accumulé article par article → flush après le step AI
    // Paramètres injectés par l'IA : line_id, product_name, price_euros, charge_label (optionnel)
  },
  create_new_return_order: {
    label:       'Créer une return order',
    reads:       ['customer_id'],  // lit customer_id depuis le contexte parent/original
    writes:      ['id', 'number'],
    resultAlias: {},
  },
  choose_article: {
    label:  'Choisir un article (boutons ou texte)',
    reads:  ['lines'],
    writes: ['selected_ids', 'chosen_lines'],
    // selected_ids = IDs de lignes séparés par virgule (mode code/boutons)
    // chosen_lines = JSON des lignes sélectionnées avec leurs UUIDs Booqable résolus
  },
  add_new_product_line: {
    label:  'Ajouter les articles sélectionnés à la commande de retour',
    reads:  ['selected_ids', 'chosen_lines'],
    writes: ['kept_product_names'],
    // order_id injecté depuis order_context (return.id)
  },
  add_new_product: {
    label:  'Ajouter les articles choisis à la commande (produit ou custom si sans ID)',
    reads:  ['selected_ids', 'lines'],
    writes: ['kept_product_names'],
  },
  remove_other_lines: {
    label:  'Supprimer toutes les lignes sauf l\'article choisi',
    reads:  ['lines', 'selected_ids'],
    writes: ['kept_product_names'],
  },
  zero_out_order_lines: {
    label:  'Remettre les lignes à 0',
    reads:  ['id'],
    writes: [],
  },
  set_original_order: {
    label:  'Renseigner la commande d\'origine',
    reads:  ['number'],   // lit input_context.number (la commande source)
    writes: [],           // modifie order_context (la return order)
  },
  add_internal_note: {
    label:  'Ajouter une note interne',
    reads:  ['id'],
    writes: [],
  },
  check_insurance: {
    label:  'Vérifier si l\'assurance est prise sur la commande',
    reads:  ['id', 'lines'],
    writes: ['insurance'],
    // insurance = 'true' | 'false'
  },
  check_deposit: {
    label:  'Vérifier la caution (dépôt physique + autorisation carte)',
    reads:  ['id'],
    writes: ['security_deposit', 'authorisation_card', 'payment_authorization_id', 'provider_id'],
    // security_deposit           = 'true' | 'false'
    // authorisation_card         = 'true' | 'false'
    // payment_authorization_id   = UUID Booqable de l'autorisation (pour capture Stripe)
    // provider_id                = ID Stripe (payment_intent) — pour débiter directement
  },
  draft_email: {
    label:  'Préparer l\'email client (template)',
    reads:  [],
    writes: ['subject', 'body'],
  },
  send_email: {
    label:  'Envoyer un email',
    reads:  ['id', 'subject', 'body'],
    writes: [],
  },
  draft_email_booqable: {
    label:  'Aperçu template Booqable (lecture seule)',
    reads:  ['id'],
    writes: ['active_document_id'],  // stocké pour que send_email_booqable le pick up automatiquement
    // Paramètre requis : document_id (UUID du template Booqable)
  },
  send_email_booqable: {
    label:  'Envoyer via template Booqable (document_id)',
    reads:  ['id', 'customer_id', 'customer_email', 'active_document_id'],
    writes: [],
    // Paramètre requis dans le step : document_id (UUID du template Booqable)
  },
  add_missing_lines: {
    label:  'Ajouter les articles manquants à la return order',
    reads:  ['selected_ids', 'lines'],
    writes: ['kept_product_names', 'sav_tag'],
  },
}

// ── Évaluateur de conditions ──────────────────────────────────────────────────
//
// Syntaxe supportée :
//   "original.insurance == 'true'"
//   "original.security_deposit != 'false'"
//   "original.insurance == 'true' AND original.security_deposit == 'true'"
//   "original.insurance == 'true' OR original.authorisation_card == 'true'"
//
// Si la condition est vide ou undefined → true (step exécuté normalement).

export function evaluateCondition(condition: string | undefined, vars: WorkflowVars): boolean {
  if (!condition || condition.trim() === '') return true

  // Découpe en clauses AND (priorité supérieure à OR)
  const orClauses = condition.split(/\bOR\b/i)
  return orClauses.some(orClause => {
    const andClauses = orClause.split(/\bAND\b/i)
    return andClauses.every(clause => evaluateSingleClause(clause.trim(), vars))
  })
}

function evaluateSingleClause(clause: string, vars: WorkflowVars): boolean {
  // Format: "{varname} {op} '{value}'" ou "{varname} {op} {value}"
  const m = clause.match(/^([\w.]+)\s*(==|!=)\s*'?([^']*)'?$/)
  if (!m) return true // clause non parseable → on ne bloque pas
  const [, varName, op, expected] = m
  const actual = vars[varName] ?? ''
  if (op === '==') return actual === expected
  if (op === '!=') return actual !== expected
  return true
}

// ── Supabase CRUD ─────────────────────────────────────────────────────────────

export async function loadWorkflowState(
  supabase: SupabaseClient,
  caseId: string,
): Promise<WorkflowState> {
  const { data } = await supabase
    .from('return_cases')
    .select('workflow_state')
    .eq('id', caseId)
    .single()

  const raw = data?.workflow_state as WorkflowState | null
  if (raw?.step_index !== undefined) return raw
  return { step_index: 0, vars: {}, status: 'running' }
}

export async function saveWorkflowState(
  supabase: SupabaseClient,
  caseId: string,
  state: WorkflowState,
): Promise<void> {
  await supabase
    .from('return_cases')
    .update({ workflow_state: state })
    .eq('id', caseId)
}

// ── Résolution des variables ──────────────────────────────────────────────────

/** Résout le contexte d'input : order_context ou fallback sur le premier disponible. */
function resolveContext(step: WorkflowStep, vars: WorkflowVars): OrderContext {
  if (step.order_context) return step.order_context
  // fallback : premier contexte qui a un id
  const contexts: OrderContext[] = ['parent', 'original', 'return', 'child']
  return contexts.find(c => vars[`${c}.id`]) ?? 'parent'
}

/** Retourne l'UUID de la commande active pour ce step. */
export function getOrderIdForStep(step: WorkflowStep, vars: WorkflowVars): string | undefined {
  const ctx = resolveContext(step, vars)
  return vars[`${ctx}.id`]
}

/** Retourne le numéro (human-readable) de la commande active pour ce step. */
export function getOrderNumberForStep(step: WorkflowStep, vars: WorkflowVars): string | undefined {
  const ctx = resolveContext(step, vars)
  return vars[`${ctx}.number`]
}

/** Retourne les lignes encodées en JSON pour le contexte actif. */
export function getOrderLinesForStep(step: WorkflowStep, vars: WorkflowVars): string | undefined {
  const ctx = resolveContext(step, vars)
  return vars[`${ctx}.lines`]
}

/** Construit les paramètres exacts à passer à l'outil pour ce step. */
export function buildToolArgs(step: WorkflowStep, vars: WorkflowVars): Record<string, unknown> {
  const args: Record<string, unknown> = {}

  // 1. Params fixes définis dans le step
  if (step.parameters) Object.assign(args, step.parameters)

  // 2. order_id résolu depuis vars — tous les outils sauf remove_product_line
  if (step.booqable_action && step.booqable_action !== 'remove_product_line') {
    const orderId = getOrderIdForStep(step, vars)
    if (orderId) {
      args.order_id = orderId
    } else if (step.booqable_action === 'fetch_order') {
      // Pas encore d'UUID : on injecte order_number (seedé depuis les messages user)
      const orderNum = getOrderNumberForStep(step, vars)
      if (orderNum) args.order_number = orderNum
    }
  }

  // 3. add_sav_comment : référencer le numéro de la commande d'ORIGINE (original), pas de la return order (parent)
  if (step.booqable_action === 'add_sav_comment') {
    args.origin_order_number = vars['original.number'] ?? vars['parent.number'] ?? getOrderNumberForStep(step, vars) ?? ''
  }

  return args
}

// ── Extraction générique des variables depuis les résultats ───────────────────

/**
 * Lit le résultat JSON d'un tool call et retourne les nouvelles variables
 * à merger dans wfState.vars, en se basant sur TOOL_REGISTRY.
 *
 * Le contexte d'écriture est step.output_context ?? step.order_context ?? 'parent'.
 */
export function extractVarsFromResult(
  toolName: string,
  result:   string,
  step:     WorkflowStep,
): Partial<WorkflowVars> {
  const tool = TOOL_REGISTRY[toolName]
  if (!tool || tool.writes.length === 0) return {}

  try {
    const data    = JSON.parse(result) as Record<string, unknown>
    const writeCtx = step.output_context ?? step.order_context ?? 'parent'
    const updates: Partial<WorkflowVars> = {}

    for (const field of tool.writes) {
      // Si l'API retourne un nom différent (ex: new_order_id → id), on utilise l'alias
      const sourceKey = tool.resultAlias?.[field] ?? field
      const value     = data[sourceKey]
      if (value !== undefined && value !== null) {
        updates[`${writeCtx}.${field}`] = typeof value === 'object'
          ? JSON.stringify(value)
          : String(value)
      }
    }

    return updates
  } catch {
    return {}
  }
}

// ── Instruction IA par étape ──────────────────────────────────────────────────

/** Construit l'instruction système exacte pour l'étape courante. */
export function buildStepInstruction(
  step:       WorkflowStep,
  vars:       WorkflowVars,
  stepIndex:  number,
  totalSteps: number,
): string {
  const orderId  = getOrderIdForStep(step, vars)
  const orderNum = getOrderNumberForStep(step, vars)
  const orderRef = orderId
    ? `commande #${orderNum ?? '?'} (UUID: ${orderId})`
    : 'commande non encore résolue'

  // Affiche uniquement les vars non-longues (pas les lignes JSON)
  const contextLines = Object.entries(vars)
    .filter(([, v]) => v !== undefined && v.length < 200)
    .map(([k, v]) => `  ${k} = ${v}`)
    .join('\n')
  const context = contextLines ? `\nCONTEXTE VARIABLES :\n${contextLines}` : ''

  if (step.type === 'action') {
    // ── Cas spécial : add_new_product_line en mode AI → injecter les UUIDs réels ──
    // original.lines est filtré du CONTEXTE VARIABLES (trop long), on l'injecte explicitement
    if (step.booqable_action === 'add_new_product_line') {
      const srcCtx = 'original'  // les articles viennent toujours de la commande d'origine
      const dstCtx = step.order_context ?? 'return'
      const linesRaw = vars[`${srcCtx}.lines`]
      const chosenTag = vars[`${srcCtx}.selected_ids`]
      const returnOrderId = vars[`${dstCtx}.id`]

      let linesSection = ''
      if (linesRaw) {
        try {
          const lines = JSON.parse(linesRaw) as Array<{
            product_name?: string; quantity?: number
            product_group_id?: string | null; stock_item_id?: string | null; stock_item_label?: string | null
          }>
          linesSection = '\nLIGNES DE LA COMMANDE D\'ORIGINE (UUIDs réels à utiliser) :\n' +
            lines.map(l => {
              const pgId = l.product_group_id ?? 'null'
              const siId = l.stock_item_id ?? 'null'
              const label = l.stock_item_label ? ` ${l.stock_item_label}` : ''
              return `  ${l.quantity ?? 1}x ${l.product_name ?? '?'}${label} → product_group_id: ${pgId} | stock_item_id: ${siId}`
            }).join('\n')
        } catch { /* pas JSON */ }
      }

      const chosenSection = chosenTag
        ? `\nARTICLES SÉLECTIONNÉS PAR L'OPÉRATEUR : "${chosenTag}"`
        : ''

      const toolArgs = buildToolArgs(step, vars)

      return `══════════════════════════════════════════
ÉTAPE ${stepIndex + 1}/${totalSteps} — ACTION : ${step.title}
order_id return order = ${returnOrderId ?? '?'}
══════════════════════════════════════════
Appelle add_new_product_line UNE FOIS par article sélectionné.
Utilise les product_group_id et stock_item_id EXACTS de la liste ci-dessous.
⚠ INTERDIT : utiliser "ID-X" comme product_group_id — c'est un label d'affichage, jamais un UUID.
${linesSection}${chosenSection}

Paramètres injectés par le système :
${JSON.stringify(toolArgs, null, 2)}${context}`
    }

    // ── Cas spécial : choose_article en mode AI = question (liste + saisie texte) ──
    if (step.booqable_action === 'choose_article' && step.execution === 'ai') {
      const ctx = step.order_context ?? 'original'
      const linesRaw = vars[`${ctx}.lines`]
      let linesDisplay = '(récupère les articles depuis le résultat fetch_order ci-dessus)'
      if (linesRaw) {
        try {
          const lines = JSON.parse(linesRaw) as Array<{ product_name?: string; quantity?: number; stock_item_identifier?: string; product_group_id?: string }>
          if (Array.isArray(lines) && lines.length > 0) {
            linesDisplay = lines.map(l => {
              const shortId = l.stock_item_identifier?.match(/(\d+)$/)?.[1]
              return shortId
                ? `${l.quantity ?? 1}x ${l.product_name ?? '?'} ID-${shortId}`
                : `${l.quantity ?? 1}x ${l.product_name ?? '?'}`
            }).join('\n')
          }
        } catch { /* pas JSON */ }
      }
      return `══════════════════════════════════════════
ÉTAPE ${stepIndex + 1}/${totalSteps} — SÉLECTION ARTICLES : ${step.title}
${orderRef}
══════════════════════════════════════════
${step.description ?? 'Quels articles n\'ont pas été retournés ?'}

ARTICLES DE LA COMMANDE :
${linesDisplay}

CONSIGNE : Affiche la liste ci-dessus (format : "Qty x Produit ID-X"), puis demande à l'opérateur quels articles n'ont pas été retournés.
N'appelle AUCUN outil. Attends la réponse tapée par l'opérateur.${context}`
    }

    const toolArgs   = buildToolArgs(step, vars)
    const ctx = step.order_context ?? 'parent'
    const chosenTag = vars[`${ctx}.sav_tag`]
    const tagLabel: Record<string, string> = {
      r11_late: 'Retard de retour', r12_missing: 'Perte du matériel',
      r13_theft: 'Vol du matériel',  r14_damage: 'Dommage constaté sur le matériel',
    }
    const commentNote = step.booqable_action === 'add_sav_comment'
      ? `\nNOTE : le champ "comment" doit être un court résumé en français du problème.${chosenTag ? ` Le tag choisi est "${chosenTag}" (${tagLabel[chosenTag] ?? chosenTag}) — utilise-le pour rédiger le commentaire.` : ''}`
      : ''

    return `══════════════════════════════════════════
ÉTAPE ${stepIndex + 1}/${totalSteps} — ACTION : ${step.title}
${orderRef}
══════════════════════════════════════════
Appelle UNIQUEMENT l'outil "${step.booqable_action}" avec ces paramètres :
${JSON.stringify(toolArgs, null, 2)}${commentNote}

INTERDIT ABSOLU :
- N'émets AUCUN texte (ni avant ni après l'appel outil).
- N'appelle pas d'autres outils que "${step.booqable_action}".
- Ne pose pas de questions, ne résume pas, ne fais pas de commentaires.
Le système orchestre automatiquement toutes les autres étapes — tu n'exécutes QUE celle-ci.${context}`
  }

  if (step.type === 'question') {
    // Extraire les lignes du contexte actif pour les afficher dans la question
    const ctx = step.order_context ?? 'parent'
    const linesRaw = vars[`${ctx}.lines`]
    let linesSection = ''
    if (linesRaw) {
      try {
        const lines = JSON.parse(linesRaw) as Array<{ id?: string; product_name?: string; quantity?: number; stock_item_identifier?: string }>
        if (Array.isArray(lines) && lines.length > 0) {
          const formatted = lines.map(l => {
            const shortId   = l.stock_item_identifier?.match(/(\d+)$/)?.[1] ?? ''
            const idPart    = shortId ? ` ID ${shortId}` : ''
            const identPart = l.stock_item_identifier ? ` (${l.stock_item_identifier})` : ''
            return `${l.quantity ?? 1} x ${l.product_name ?? '?'}${idPart}${identPart}`
          }).join('\n')
          linesSection = `\n\nARTICLES SUR LA COMMANDE (${ctx}) :\n${formatted}\n(Pour les suppressions, utilise les line_id du résultat fetch_order précédent.)`
        }
      } catch { /* pas JSON */ }
    }

    return `══════════════════════════════════════════
ÉTAPE ${stepIndex + 1}/${totalSteps} — QUESTION : ${step.title}
${orderRef}
══════════════════════════════════════════
${step.description ?? step.title}${linesSection}

RÈGLES STRICTES :
- Si des articles sont listés ci-dessus, affiche-les tels quels avant de poser la question.
- Ne mentionne PAS les étapes suivantes.
- N'appelle aucun outil.
- Attends la réponse avant de continuer.${context}`
  }

  // check
  return `══════════════════════════════════════════
ÉTAPE ${stepIndex + 1}/${totalSteps} — VÉRIFICATION : ${step.title}
══════════════════════════════════════════
${step.description ?? step.title}${context}`
}

// ── Avancement de l'étape ─────────────────────────────────────────────────────

/** Avance au prochain step et retourne le nouvel état. */
export function advanceStep(state: WorkflowState, totalSteps: number): WorkflowState {
  const nextIndex = state.step_index + 1
  return {
    ...state,
    step_index: nextIndex,
    status:     nextIndex >= totalSteps ? 'completed' : 'running',
  }
}
