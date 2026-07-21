/**
 * Moteur d'état pour les workflows FilmeAI.
 *
 * Convention de nommage des variables : "<context>.<champ_booqable>"
 *   parent.id, parent.number, parent.lines
 *   child.id,  child.number,  child.lines
 *   original.id, original.number
 *   return.id,   return.number, return.lines
 *
 * order_context  = quelle commande ce step lit (input)
 * output_context = quelle commande ce step écrit (output) — défaut: même que order_context
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
  type:            'action' | 'question' | 'check'
  title:           string
  description?:    string
  booqable_action?: string
  parameters?:     Record<string, unknown>
  order_context?:  OrderContext   // commande lue en input
  output_context?: OrderContext   // commande écrite en output (défaut: order_context)
  execution?:      'code' | 'ai'
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
    writes: ['chosen_tag'],   // stocke le tag sélectionné par l'utilisateur
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
  remove_product_line: {
    label:  'Supprimer une ligne produit',
    reads:  [],   // prend line_id depuis parameters, pas order_id
    writes: [],
  },
  add_sav_comment: {
    label:  'Ajouter un commentaire SAV',
    reads:  ['id', 'number'],
    writes: [],
  },
  create_new_return_order: {
    label:       'Créer une return order',
    reads:       ['customer_id'],  // lit customer_id depuis le contexte parent/original
    writes:      ['id', 'number'],
    resultAlias: {},
  },
  zero_out_order_lines: {
    label:  'Remettre les lignes à 0',
    reads:  ['id'],
    writes: [],
  },
  set_original_order: {
    label:  'Renseigner la commande d\'origine',
    reads:  ['id', 'number'],  // lit return.id + original.number
    writes: [],
  },
  add_internal_note: {
    label:  'Ajouter une note interne',
    reads:  ['id'],
    writes: [],
  },
  send_email: {
    label:  'Envoyer un email (template fixe)',
    reads:  ['id'],
    writes: [],
  },
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
    if (orderId) args.order_id = orderId
  }

  // 3. add_sav_comment : numéro de commande en clair
  if (step.booqable_action === 'add_sav_comment') {
    args.origin_order_number = getOrderNumberForStep(step, vars) ?? ''
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
        updates[`${writeCtx}.${field}`] = String(value)
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
    const toolArgs   = buildToolArgs(step, vars)
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
    // Extraire les lignes du contexte actif pour les afficher dans la question
    const ctx = step.order_context ?? 'parent'
    const linesRaw = vars[`${ctx}.lines`]
    let linesSection = ''
    if (linesRaw) {
      try {
        const lines = JSON.parse(linesRaw) as Array<{ id?: string; product_name?: string; quantity?: number; stock_item_identifier?: string }>
        if (Array.isArray(lines) && lines.length > 0) {
          const formatted = lines.map((l, i) =>
            `  ${i + 1}. ${l.product_name ?? '?'} (x${l.quantity ?? 1})${l.stock_item_identifier ? ' — ' + l.stock_item_identifier : ''} [line_id: ${l.id ?? '?'}]`
          ).join('\n')
          linesSection = `\n\nARTICLES SUR LA COMMANDE (${ctx}) :\n${formatted}`
        }
      } catch { /* pas JSON */ }
    }

    return `══════════════════════════════════════════
ÉTAPE ${stepIndex + 1}/${totalSteps} — QUESTION : ${step.title}
${orderRef}
══════════════════════════════════════════
${step.description ?? step.title}${linesSection}

RÈGLES STRICTES :
- Affiche le contexte utile (articles listés ci-dessus si présents), puis pose la question.
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
