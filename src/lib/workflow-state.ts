/**
 * Moteur d'état pour les workflows FilmeAI.
 *
 * Principe : au lieu de laisser l'IA décider quelle étape exécuter,
 * le serveur suit l'étape courante et injecte une instruction exacte.
 *
 * Variables supportées par contexte :
 *  - parent_order_id / parent_order_number / parent_lines   → commande parent (U01)
 *  - child_order_id  / child_order_number  / child_lines    → commande child  (U01)
 *  - original_order_id / original_order_number              → commande d'origine (workflows standard)
 *  - return_order_id   / return_order_number / return_lines → commande de retour  (workflows standard)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrderContext = 'parent' | 'child' | 'original' | 'return'

export type WorkflowVars = {
  // U01 – split order
  parent_order_id?:     string
  parent_order_number?: string
  parent_lines?:        string   // JSON encoded BooqableOrderLine[]
  child_order_id?:      string
  child_order_number?:  string
  child_lines?:         string   // JSON encoded BooqableOrderLine[]
  // Workflows standard (CASSE / MANQUANT)
  original_order_id?:     string
  original_order_number?: string
  return_order_id?:       string
  return_order_number?:   string
  return_lines?:          string   // JSON encoded BooqableOrderLine[]
  // Misc
  [key: string]: string | undefined
}

export type WorkflowState = {
  step_index: number          // index dans steps[] de l'étape courante
  vars:       WorkflowVars
  status:     'running' | 'waiting_for_input' | 'completed'
}

export type WorkflowStep = {
  id:              string
  type:            'action' | 'question' | 'check'
  title:           string
  description?:    string
  booqable_action?: string
  parameters?:     Record<string, unknown>   // params fixes (ex: tags_add: ["r21_open"])
  order_context?:  OrderContext               // quel order_id injecter
  execution?:      'code' | 'ai'             // 'code' = exécution directe sans LLM (défaut: 'ai')
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

/** Retourne l'UUID de la commande active pour ce step. */
export function getOrderIdForStep(step: WorkflowStep, vars: WorkflowVars): string | undefined {
  switch (step.order_context) {
    case 'parent':   return vars.parent_order_id
    case 'child':    return vars.child_order_id
    case 'original': return vars.original_order_id
    case 'return':   return vars.return_order_id
    default:
      // fallback : premier order_id disponible
      return vars.parent_order_id
        ?? vars.original_order_id
        ?? vars.return_order_id
        ?? vars.child_order_id
  }
}

/** Retourne le numéro (human-readable) de la commande active pour ce step. */
export function getOrderNumberForStep(step: WorkflowStep, vars: WorkflowVars): string | undefined {
  switch (step.order_context) {
    case 'parent':   return vars.parent_order_number
    case 'child':    return vars.child_order_number
    case 'original': return vars.original_order_number
    case 'return':   return vars.return_order_number
    default:
      return vars.parent_order_number
        ?? vars.original_order_number
        ?? vars.return_order_number
        ?? vars.child_order_number
  }
}

/** Construit les paramètres exacts à passer à l'outil pour ce step. */
export function buildToolArgs(step: WorkflowStep, vars: WorkflowVars): Record<string, unknown> {
  const args: Record<string, unknown> = {}

  // 1. Params fixes définis dans le step (ex: tags_add, template_id)
  if (step.parameters) Object.assign(args, step.parameters)

  // 2. order_id résolu — tous les outils sauf remove_product_line (qui prend line_id)
  if (step.booqable_action && step.booqable_action !== 'remove_product_line') {
    const orderId = getOrderIdForStep(step, vars)
    if (orderId) args.order_id = orderId
  }

  // 3. Params spéciaux selon l'outil
  if (step.booqable_action === 'add_sav_comment') {
    // origin_order_number = numéro de la commande active
    args.origin_order_number = getOrderNumberForStep(step, vars) ?? ''
    // comment sera fourni par l'utilisateur (étape question précédente)
    // → on le laisse vide, l'IA le complètera depuis la réponse user
  }

  return args
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

  const context = `\nCONTEXTE VARIABLES :\n` +
    Object.entries(vars)
      .filter(([, v]) => v !== undefined && !v.startsWith('['))  // skip long JSON
      .map(([k, v]) => `  ${k} = ${v}`)
      .join('\n')

  if (step.type === 'action') {
    const toolArgs = buildToolArgs(step, vars)
    // Pour les outils qui ont besoin d'un "comment" (add_sav_comment), on note que
    // le champ "comment" vient de la réponse précédente de l'utilisateur
    const commentNote = step.booqable_action === 'add_sav_comment'
      ? '\nNOTE : le champ "comment" doit être construit à partir du dernier message de l\'opérateur.'
      : ''

    return `══════════════════════════════════════════
ÉTAPE ${stepIndex + 1}/${totalSteps} — ACTION : ${step.title}
${orderRef}
══════════════════════════════════════════
Appelle UNIQUEMENT l'outil "${step.booqable_action}" avec ces paramètres :
${JSON.stringify(toolArgs, null, 2)}${commentNote}

INTERDIT ABSOLU : appeler d'autres outils que "${step.booqable_action}", poser des questions, répéter cette étape.
Le système orchestre automatiquement toutes les autres étapes — tu n'exécutes QUE celle-ci.${context}`
  }

  if (step.type === 'question') {
    return `══════════════════════════════════════════
ÉTAPE ${stepIndex + 1}/${totalSteps} — QUESTION : ${step.title}
${orderRef}
══════════════════════════════════════════
${step.description ?? step.title}

INTERDIT : appeler des outils à cette étape. Pose la question et attends la réponse.${context}`
  }

  // check
  return `══════════════════════════════════════════
ÉTAPE ${stepIndex + 1}/${totalSteps} — VÉRIFICATION : ${step.title}
══════════════════════════════════════════
${step.description ?? step.title}${context}`
}

// ── Extraction des variables depuis les résultats ─────────────────────────────

/**
 * Analyse le résultat JSON d'un tool call et retourne les nouvelles variables
 * à stocker dans l'état du workflow.
 */
export function extractVarsFromResult(
  toolName:  string,
  result:    string,
  step:      WorkflowStep,
): Partial<WorkflowVars> {
  try {
    const data = JSON.parse(result) as Record<string, unknown>
    const ctx = step.order_context ?? 'parent'

    switch (toolName) {
      case 'fetch_order': {
        const updates: Partial<WorkflowVars> = {}
        if (typeof data.id     === 'string') updates[`${ctx}_order_id`]     = data.id
        if (data.number !== undefined)        updates[`${ctx}_order_number`] = String(data.number)
        if (Array.isArray(data.lines))        updates[`${ctx}_lines`]        = JSON.stringify(data.lines)
        return updates
      }

      case 'duplicate_order': {
        // result = JSON.stringify({ success, new_order_id, new_order_number, message })
        return {
          child_order_id:     typeof data.new_order_id     === 'string' ? data.new_order_id     : undefined,
          child_order_number: data.new_order_number !== undefined       ? String(data.new_order_number) : undefined,
        }
      }

      case 'create_new_return_order': {
        return {
          return_order_id:     typeof data.id     === 'string' ? data.id     : undefined,
          return_order_number: data.number !== undefined       ? String(data.number) : undefined,
        }
      }

      default:
        return {}
    }
  } catch {
    return {}
  }
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
