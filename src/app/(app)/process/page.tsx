'use client'

import { useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderContext = 'parent' | 'original' | 'return' | 'child'

type WorkflowStep = {
  id:              string
  type:            'action' | 'question' | 'check' | 'instruction'
  title:           string
  description?:    string
  booqable_action?: string
  parameters?:     Record<string, unknown>
  order_context?:  OrderContext | null
  input_context?:  OrderContext | null
  output_context?: OrderContext | null
  execution?:      'code' | 'ai'
  condition?:      string
  process_note?:   string
  process_skip?:   boolean
}

type ReturnWorkflow = {
  id:               string
  slug:             string
  name:             string
  chat_label:       string | null
  description:      string
  steps:            WorkflowStep[]
  is_active:        boolean
  category?:        string
  parent_category?: string | null
}

type OldProcess = {
  id:            string
  title:         string
  workflow_slug?: string | null
}

// ── Contexte commande ─────────────────────────────────────────────────────────

const CTX_LABELS: Record<string, string> = {
  parent:   'Commande principale',
  original: 'Commande originale',
  return:   'Commande retour',
  child:    'Commande enfant',
}

const CTX_ICONS: Record<string, string> = {
  parent:   'ti-building-store',
  original: 'ti-file-invoice',
  return:   'ti-refresh',
  child:    'ti-git-branch',
}

// Actions spéciales : leur contexte n'est pas une commande Booqable
const ACTION_CTX_OVERRIDE: Record<string, { label: string; icon: string }> = {
  draft_email:          { label: 'Client',     icon: 'ti-mail' },
  create_payment_link:  { label: 'Client',     icon: 'ti-credit-card' },
  read_customer_notes:  { label: 'Client',     icon: 'ti-user' },
  redirect_url:         { label: 'Navigation', icon: 'ti-external-link' },
}

// Steps à masquer entièrement
const SKIP_ACTIONS = new Set(['send_email', 'search_products'])

// ── Contexte d'un step ────────────────────────────────────────────────────────

function getCtx(step: WorkflowStep): { label: string; icon: string } {
  if (step.booqable_action && ACTION_CTX_OVERRIDE[step.booqable_action]) {
    return ACTION_CTX_OVERRIDE[step.booqable_action]
  }
  // Cascade : order_context → output_context → input_context → 'parent'
  const key = step.order_context || step.output_context || step.input_context || 'parent'
  return {
    label: CTX_LABELS[key] ?? 'Commande principale',
    icon:  CTX_ICONS[key]  ?? 'ti-building-store',
  }
}

// ── Formatage de la condition ─────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  grand_total_euros:  'montant total',
  insurance:          'assurance',
  authorisation_card: 'autorisation carte',
  status:             'statut',
  security_deposit:   'caution',
  notes_sav:          'commentaire SAV',
  order_sav:          'commande d\'origine',
}

const CTX_COND: Record<string, string> = {
  parent:   'commande principale',
  return:   'commande retour',
  original: 'commande originale',
  child:    'commande enfant',
}

function formatCondition(raw: string): string {
  return raw
    .replace(/(parent|return|original|child)\.(\w+)/g, (_m, ctx: string, field: string) =>
      `${FIELD_LABELS[field] ?? field.replace(/_/g, ' ')} (${CTX_COND[ctx] ?? ctx})`)
    .replace(/\s*AND\s*/g,      ' et ')
    .replace(/\s*OR\s*/g,       ' ou ')
    .replace(/==\s*'true'/g,    '= oui')
    .replace(/==\s*'false'/g,   '= non')
    .replace(/==\s*'([^']+)'/g, '= $1')
    .replace(/!=\s*'([^']+)'/g, '≠ $1')
    .replace(/<=/g,             '≤')
    .replace(/>=/g,             '≥')
    .replace(/'([^']+)'/g,      '$1')
    .trim()
}

// ── Composant ProcessFlow ─────────────────────────────────────────────────────

function ProcessFlow({ workflow }: { workflow: ReturnWorkflow }) {
  const displayable = (workflow.steps || []).filter(s => {
    if (s.process_skip) return false
    if (s.type === 'instruction') return false
    if (SKIP_ACTIONS.has(s.booqable_action ?? '')) return false
    return true
  })

  if (displayable.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-16">
        Aucune étape à afficher pour ce workflow.
      </div>
    )
  }

  return (
    <div className="flex flex-col max-w-[500px] mx-auto">
      {displayable.map((step, idx) => {
        const { label: ctxLabel, icon: ctxIcon } = getCtx(step)
        const note = step.process_note?.trim() ?? ''
        const cond = step.condition ? formatCondition(step.condition) : null
        const hasWhiteBox = note || cond

        return (
          <div key={step.id}>
            {idx > 0 && <div className="w-px h-3 bg-gray-200 mx-auto" />}

            {/* Étape bleue */}
            <div className="bg-[#e8f0fe] border border-[#c5d3f5] rounded-xl px-4 py-3 flex items-start gap-3">
              <div className="min-w-[26px] h-[26px] rounded-full bg-[#4a86e8] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium text-gray-900 leading-snug mb-1.5">
                  {step.title}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#1a4fa8]">
                  <i className={`ti ${ctxIcon}`} aria-hidden="true" style={{ fontSize: 13 }} />
                  <span>Contexte : {ctxLabel}</span>
                </div>
              </div>
            </div>

            {/* Carré blanc — uniquement si process_note ou condition */}
            {hasWhiteBox && (
              <>
                <div className="w-px h-0.5 bg-gray-200 mx-auto" />
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  {note && (
                    <p className="text-[13px] text-gray-900 leading-relaxed">
                      {note}
                    </p>
                  )}
                  {cond && (
                    <div className={`flex items-start gap-1.5 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-snug ${note ? 'mt-2.5' : ''}`}>
                      <i className="ti ti-filter flex-shrink-0" aria-hidden="true" style={{ fontSize: 12, marginTop: 1 }} />
                      <span><strong>Seulement si</strong> : {cond}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  retours:         'Retours',
  planning:        'Planning',
  'sous-location': 'Sous-location',
}

const CATEGORY_ORDER = ['retours', 'planning', 'sous-location']

// ── Page principale ───────────────────────────────────────────────────────────

export default function ProcessPage() {
  const [workflows, setWorkflows]   = useState<ReturnWorkflow[]>([])
  const [oldProcs, setOldProcs]     = useState<OldProcess[]>([])
  const [selectedSlug, setSelected] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [deleting, setDeleting]     = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/returns/workflows').then(r => r.json()) as Promise<{ workflows?: ReturnWorkflow[] }>,
      fetch('/api/processes').then(r => r.json())         as Promise<{ processes?: OldProcess[] }>,
    ]).then(([wd, pd]) => {
      const wfs  = (wd.workflows || []).filter(w => w.is_active)
      setWorkflows(wfs)
      setOldProcs(pd.processes || [])
      if (wfs.length > 0) setSelected(wfs[0].slug)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const selectedWorkflow = workflows.find(w => w.slug === selectedSlug)

  // Grouper par catégorie → parent_category
  const grouped: Record<string, Record<string, ReturnWorkflow[]>> = {}
  for (const wf of workflows) {
    const cat    = wf.category ?? 'retours'
    const parent = wf.parent_category ?? ''
    if (!grouped[cat])         grouped[cat]         = {}
    if (!grouped[cat][parent]) grouped[cat][parent] = []
    grouped[cat][parent].push(wf)
  }

  const deleteOldProc = async (id: string) => {
    setDeleting(id)
    await fetch('/api/processes', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    })
    setOldProcs(prev => prev.filter(p => p.id !== id))
    setDeleting(null)
  }

  if (loading) {
    return <div className="text-sm text-gray-400 py-12 text-center">Chargement…</div>
  }

  return (
    <div className="flex gap-0 min-h-[600px] border border-gray-200 rounded-xl overflow-hidden">

      {/* ── Sidebar ── */}
      <div className="w-52 flex-shrink-0 border-r border-gray-100 overflow-y-auto max-h-[calc(100vh-120px)] bg-gray-50 py-2">

        {CATEGORY_ORDER.filter(cat => grouped[cat]).map(cat => (
          <div key={cat} className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-3 pt-3 pb-1">
              {CATEGORY_LABELS[cat] ?? cat}
            </p>
            {Object.entries(grouped[cat]).map(([parent, wfs]) => (
              <div key={parent}>
                {parent && (
                  <div className="flex items-center gap-1 px-3 py-1">
                    <i className="ti ti-chevron-right text-gray-400" aria-hidden="true" style={{ fontSize: 10 }} />
                    <span className="text-[11px] font-medium text-gray-500">{parent}</span>
                  </div>
                )}
                {wfs.map(wf => (
                  <button
                    key={wf.slug}
                    onClick={() => setSelected(wf.slug)}
                    className={`w-full text-left py-1.5 text-[12.5px] leading-snug transition-colors ${
                      parent ? 'pl-7' : 'pl-3'
                    } pr-3 ${
                      selectedSlug === wf.slug
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-white hover:text-gray-900'
                    }`}
                  >
                    {wf.chat_label || wf.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* Process archivés */}
        {oldProcs.length > 0 && (
          <div className="border-t border-gray-200 mt-2 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-3 pb-1">
              Archivés
            </p>
            {oldProcs.map(p => (
              <div key={p.id} className="flex items-center justify-between px-3 py-1.5 group">
                <span className="text-[11.5px] text-gray-400 line-through leading-tight truncate flex-1 mr-2">
                  {p.title}
                </span>
                <button
                  onClick={() => deleteOldProc(p.id)}
                  disabled={deleting === p.id}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity disabled:opacity-30 flex-shrink-0"
                  title="Supprimer définitivement"
                >
                  <i className="ti ti-trash" aria-hidden="true" style={{ fontSize: 14 }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Zone principale ── */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-white p-6">
        {selectedWorkflow ? (
          <>
            <div className="mb-7">
              <div className="flex items-baseline gap-2 text-[11px] text-gray-400 mb-1.5">
                <span>
                  {CATEGORY_LABELS[selectedWorkflow.category ?? 'retours'] ?? selectedWorkflow.category}
                  {selectedWorkflow.parent_category && <> › {selectedWorkflow.parent_category}</>}
                </span>
                <span className="text-gray-300">·</span>
                <span className="font-mono text-[10px]">{selectedWorkflow.slug}</span>
              </div>
              <h2 className="text-[17px] font-semibold text-gray-900 leading-tight">
                {selectedWorkflow.chat_label || selectedWorkflow.name}
              </h2>
              {selectedWorkflow.description && (
                <p className="text-[12.5px] text-gray-500 mt-1.5 max-w-lg leading-relaxed">
                  {selectedWorkflow.description}
                </p>
              )}
            </div>

            <ProcessFlow workflow={selectedWorkflow} />
          </>
        ) : (
          <p className="text-sm text-gray-400 py-12 text-center">
            Sélectionne un workflow dans la liste.
          </p>
        )}
      </div>
    </div>
  )
}
