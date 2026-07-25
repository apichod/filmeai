'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type StepItem = {
  id: string
  type: 'step' | 'info' | 'cases'
  text?: string
  badge?: { label: string; color: 'green' | 'blue' | 'amber' }
  lines?: string[]
  pills?: { label: string; color: 'blue' | 'amber' }[]
  title?: string
}

type Process = {
  id: string
  slug: string
  title: string
  subtitle: string
  steps: StepItem[]
  sort_order: number
  workflow_slug?: string | null
}

type WorkflowStep = {
  id: string
  type: 'question' | 'action' | 'instruction'
  title: string
  description?: string
  booqable_action?: string
}

type ReturnWorkflow = {
  id: string
  slug: string
  name: string
  chat_label: string | null
  description: string
  steps: WorkflowStep[]
  is_active: boolean
}

// ── Catégories de workflows retour ────────────────────────────────────────────

const WF_GROUPS: { prefix: string; label: string; color: string }[] = [
  { prefix: 'r11_', label: 'Retard',    color: 'text-blue-600' },
  { prefix: 'r12_', label: 'Perte',     color: 'text-amber-600' },
  { prefix: 'r13_', label: 'Vol',       color: 'text-red-600' },
  { prefix: 'r14_', label: 'Dommage',   color: 'text-orange-600' },
  { prefix: 'r00_', label: 'Retour OK', color: 'text-green-600' },
  { prefix: 'u0',   label: 'Utilitaires', color: 'text-violet-600' },
]

function getGroup(slug: string) {
  return WF_GROUPS.find(g => slug.startsWith(g.prefix)) ?? { prefix: '', label: 'Autres', color: 'text-gray-500' }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderText(text: string) {
  const BLUE_FIELDS = ['Notes internes', 'Order origine SAV', 'Commentaire problème']
  let result = text
  BLUE_FIELDS.forEach(f => {
    result = result.replace(`**${f}**`, `<span class="text-[#1a73e8] font-medium">${f}</span>`)
  })
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  return <span dangerouslySetInnerHTML={{ __html: result }} />
}

const BADGE_CLASSES: Record<string, string> = {
  green: 'bg-[#34a853] text-white',
  blue:  'bg-[#1a73e8] text-white',
  amber: 'bg-[#fbbc04] text-[#3c2a00]',
}

const PILL_ICONS: Record<string, string> = { blue: '🔒', amber: '↑' }

// ── Conversion workflow → process steps ───────────────────────────────────────

const HIDDEN_ACTIONS = new Set(['fetch_order', 'search_products'])

function workflowToProcessSteps(wfSteps: WorkflowStep[]): StepItem[] {
  const result: StepItem[] = []
  let stepNum = 0
  let i = 0

  while (i < wfSteps.length) {
    const s = wfSteps[i]

    if (s.type === 'action' && HIDDEN_ACTIONS.has(s.booqable_action || '')) { i++; continue }

    if (s.type === 'question') {
      const titles: string[] = []
      while (i < wfSteps.length && wfSteps[i].type === 'question') {
        titles.push(wfSteps[i].title); i++
      }
      stepNum++
      result.push({
        id: String(stepNum), type: 'step',
        text: titles.length === 1
          ? `Identifier la **${titles[0]}**`
          : `Identifier ${titles.map(t => `**${t}**`).join(' et ')}`,
      })
      continue
    }

    if (s.type === 'instruction') {
      stepNum++
      result.push({ id: String(stepNum), type: 'step', text: s.title, badge: { color: 'green', label: 'Return' } })
      i++; continue
    }

    if (s.booqable_action === 'create_new_return_order') {
      stepNum++
      result.push({ id: String(stepNum), type: 'step', text: `Créer la **commande de retour** (return_order)`, badge: { color: 'blue', label: 'Add order' } })
      const infoLines = ['Même client que la commande d\'origine', 'Remise 100%, caution = aucune', 'Date de fin = 31/12 à 23h45']
      i++
      if (wfSteps[i]?.booqable_action === 'add_new_product_line') {
        infoLines.push('Ajouter les articles manquants avec leurs IDs'); i++
      }
      result.push({ id: `${stepNum}b`, type: 'info', lines: infoLines, pills: [{ color: 'blue', label: 'Reserve' }, { color: 'amber', label: 'Pickup' }] })
      continue
    }

    if (s.booqable_action === 'add_new_product_line') {
      stepNum++
      result.push({ id: String(stepNum), type: 'step', text: `Ajouter les **articles** à la commande de retour` })
      i++; continue
    }

    if (s.booqable_action === 'add_internal_note') {
      stepNum++
      result.push({ id: String(stepNum), type: 'step', text: `Ajouter une **note interne** à la commande d'origine` })
      if (s.description) result.push({ id: `${stepNum}b`, type: 'info', lines: [s.description] })
      i++; continue
    }

    if (s.booqable_action === 'set_original_order') {
      stepNum++
      result.push({ id: String(stepNum), type: 'step', text: `Renseigner la **commande d'origine** (original_order)` })
      result.push({ id: `${stepNum}b`, type: 'info', lines: ['= numéro de la commande d\'origine'] })
      i++; continue
    }

    if (s.booqable_action === 'add_sav_comment') {
      stepNum++
      result.push({ id: String(stepNum), type: 'step', text: `Renseigner le **commentaire SAV**` })
      if (s.description) result.push({ id: `${stepNum}b`, type: 'info', lines: [s.description] })
      i++; continue
    }

    if (s.booqable_action === 'add_tag') {
      stepNum++
      const tagMatch = (s.title + ' ' + (s.description || '')).match(/r\d+_\w+/)
      result.push({ id: String(stepNum), type: 'step', text: `Ajouter le tag **${tagMatch?.[0] ?? s.title}**` })
      i++; continue
    }

    if (s.booqable_action === 'draft_email') {
      stepNum++
      result.push({ id: String(stepNum), type: 'step', text: `Envoyer l'email client`, badge: { color: 'blue', label: 'Send email' } })
      i++
      if (wfSteps[i]?.booqable_action === 'send_email') i++
      if (s.description) result.push({ id: `${stepNum}b`, type: 'info', lines: [s.description] })
      continue
    }

    if (s.booqable_action === 'send_email') { i++; continue }

    if (s.booqable_action === 'log_case') {
      stepNum++
      result.push({ id: String(stepNum), type: 'step', text: `Logger le cas dans le tableau de suivi` })
      i++; continue
    }

    stepNum++
    result.push({ id: String(stepNum), type: 'step', text: s.title })
    i++
  }

  return result
}

// ── Composant infographie ─────────────────────────────────────────────────────

function ProcessFlow({ process: p, onEdit, readOnly = false }: { process: Process; onEdit: (step: StepItem, field: string, value: string) => void; readOnly?: boolean }) {
  return (
    <div className="max-w-[480px] mx-auto">
      <div className="text-center mb-6">
        {p.subtitle && <div className="text-xs text-gray-400 mb-2">{p.subtitle}</div>}
        <div className="inline-block border-2 border-gray-900 rounded-xl px-6 py-3 text-sm font-bold text-gray-900 leading-snug text-center">
          {p.title}
        </div>
      </div>
      <div className="flex flex-col">
        {p.steps.map((step, idx) => (
          <div key={step.id}>
            {idx > 0 && <div className="w-0.5 h-4 bg-gray-300 mx-auto" />}
            {step.type === 'step' && <StepBox step={step} onEdit={onEdit} readOnly={readOnly} />}
            {step.type === 'info' && <InfoBox step={step} onEdit={onEdit} readOnly={readOnly} />}
            {step.type === 'cases' && <CasesBox step={step} onEdit={onEdit} readOnly={readOnly} />}
          </div>
        ))}
        {p.steps.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-400">
            Aucune étape définie dans ce workflow.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Step box ──────────────────────────────────────────────────────────────────

function StepBox({ step, onEdit, readOnly }: { step: StepItem; onEdit: (s: StepItem, f: string, v: string) => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(step.text || '')

  useEffect(() => { setVal(step.text || '') }, [step.text])

  function commit() {
    setEditing(false)
    if (val !== step.text) onEdit(step, 'text', val)
  }

  return (
    <div className="bg-[#e8f0fe] border border-[#c5d3f5] rounded-xl px-4 py-3 flex items-start gap-3 group">
      <div className="min-w-[26px] h-[26px] rounded-full bg-[#4a86e8] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {step.id}
      </div>
      <div className="flex-1 flex items-center gap-3">
        {editing && !readOnly ? (
          <textarea
            value={val}
            autoFocus
            rows={2}
            onChange={e => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() } if (e.key === 'Escape') { setVal(step.text || ''); setEditing(false) } }}
            className="flex-1 text-sm bg-white border border-[#4a86e8] rounded-lg px-2 py-1 resize-none focus:outline-none focus:ring-2 focus:ring-[#4a86e8]/30"
          />
        ) : (
          <div
            className={`flex-1 text-sm text-gray-900 leading-snug rounded-lg px-1 py-0.5 transition-colors ${!readOnly ? 'cursor-pointer hover:bg-[#d2e3fc]' : ''}`}
            title={readOnly ? undefined : 'Cliquer pour modifier'}
            onClick={() => !readOnly && setEditing(true)}
          >
            {renderText(val)}
          </div>
        )}
        {step.badge && !editing && (
          <span className={`flex-shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-md ${BADGE_CLASSES[step.badge.color]}`}>
            {step.badge.color === 'blue' && step.badge.label.toLowerCase().includes('email') ? '✉ ' : ''}{step.badge.label}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Info box ──────────────────────────────────────────────────────────────────

function InfoBox({ step, onEdit, readOnly }: { step: StepItem; onEdit: (s: StepItem, f: string, v: string) => void; readOnly?: boolean }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [vals, setVals] = useState<string[]>(step.lines || [])

  useEffect(() => { setVals(step.lines || []) }, [step.lines])

  function commit(idx: number, newVal: string) {
    setEditingIdx(null)
    const next = [...vals]; next[idx] = newVal; setVals(next)
    onEdit(step, 'lines', JSON.stringify(next))
  }

  return (
    <div className="bg-white border border-[#dadce0] rounded-xl px-4 py-3 text-sm text-gray-800 leading-relaxed">
      {vals.map((line, i) => (
        <div key={i} className="flex items-center gap-1 py-0.5">
          <span className="text-gray-400 mr-1">–</span>
          {editingIdx === i && !readOnly ? (
            <input
              autoFocus
              value={line}
              onChange={e => { const n = [...vals]; n[i] = e.target.value; setVals(n) }}
              onBlur={() => commit(i, vals[i])}
              onKeyDown={e => { if (e.key === 'Enter') commit(i, vals[i]); if (e.key === 'Escape') { setVals(step.lines || []); setEditingIdx(null) } }}
              className="flex-1 text-sm border border-[#4a86e8] rounded px-1 py-0.5 focus:outline-none"
            />
          ) : (
            <span
              className={`rounded px-1 py-0.5 transition-colors ${!readOnly ? 'cursor-pointer hover:bg-gray-100' : ''}`}
              onClick={() => !readOnly && setEditingIdx(i)}
            >
              {line}
            </span>
          )}
        </div>
      ))}
      {step.pills && step.pills.length > 0 && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-gray-400">–</span>
          {step.pills.map((pill, i) => (
            <span key={i} className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2.5 py-1 rounded ${BADGE_CLASSES[pill.color]}`}>
              {PILL_ICONS[pill.color]} {pill.label}
            </span>
          ))}
          <span className="text-sm text-gray-700">des produits</span>
        </div>
      )}
    </div>
  )
}

// ── Cases box ─────────────────────────────────────────────────────────────────

function CasesBox({ step, onEdit, readOnly }: { step: StepItem; onEdit: (s: StepItem, f: string, v: string) => void; readOnly?: boolean }) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(step.title || '')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [vals, setVals] = useState<string[]>(step.lines || [])

  useEffect(() => { setTitle(step.title || ''); setVals(step.lines || []) }, [step.title, step.lines])

  function commitTitle(v: string) { setEditingTitle(false); onEdit(step, 'title', v) }
  function commitLine() { setEditingIdx(null); onEdit(step, 'lines', JSON.stringify(vals)) }

  return (
    <div className="bg-white border border-[#dadce0] rounded-xl px-4 py-3 text-sm text-gray-800 leading-relaxed">
      {editingTitle && !readOnly ? (
        <input
          autoFocus value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => commitTitle(title)}
          onKeyDown={e => { if (e.key === 'Enter') commitTitle(title) }}
          className="w-full font-medium text-sm border border-[#4a86e8] rounded px-1 py-0.5 focus:outline-none mb-1"
        />
      ) : (
        <div
          className={`font-medium mb-1 rounded px-1 py-0.5 transition-colors ${!readOnly ? 'cursor-pointer hover:bg-gray-100' : ''}`}
          onClick={() => !readOnly && setEditingTitle(true)}
        >
          {title}
        </div>
      )}
      {vals.map((line, i) => (
        <div key={i} className="flex items-center gap-1 py-0.5">
          {editingIdx === i && !readOnly ? (
            <input
              autoFocus value={line}
              onChange={e => { const n = [...vals]; n[i] = e.target.value; setVals(n) }}
              onBlur={() => commitLine()}
              onKeyDown={e => { if (e.key === 'Enter') commitLine(); if (e.key === 'Escape') { setVals(step.lines || []); setEditingIdx(null) } }}
              className="flex-1 text-sm border border-[#4a86e8] rounded px-1 py-0.5 focus:outline-none"
            />
          ) : (
            <span
              className={`rounded px-1 py-0.5 transition-colors ${!readOnly ? 'cursor-pointer hover:bg-gray-100' : ''}`}
              onClick={() => !readOnly && setEditingIdx(i)}
            >
              {line}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

type ActiveItem =
  | { kind: 'process'; id: string }
  | { kind: 'workflow'; id: string }

export default function ProcessPage() {
  const [processes, setProcesses]   = useState<Process[]>([])
  const [workflows, setWorkflows]   = useState<ReturnWorkflow[]>([])
  const [active, setActive]         = useState<ActiveItem | null>(null)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [syncing, setSyncing]       = useState(false)
  const [syncError, setSyncError]   = useState<string | null>(null)
  const [editingTitle, setEditingTitle]       = useState(false)
  const [editingSubtitle, setEditingSubtitle] = useState(false)
  const pendingRef = useRef<Record<string, unknown>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/processes').then(r => r.json()) as Promise<{ processes?: Process[] }>,
      fetch('/api/returns/workflows').then(r => r.json()) as Promise<{ workflows?: ReturnWorkflow[] }>,
    ]).then(([pd, wd]) => {
      const procs = pd.processes || []
      const wfs   = wd.workflows || []
      setProcesses(procs)
      setWorkflows(wfs.filter(w => w.is_active))
      // Sélection par défaut
      if (procs.length > 0) setActive({ kind: 'process', id: procs[0].id })
      else if (wfs.length > 0) setActive({ kind: 'workflow', id: wfs[0].id })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const selectedProcess  = active?.kind === 'process'  ? processes.find(p => p.id === active.id) : undefined
  const selectedWorkflow = active?.kind === 'workflow' ? workflows.find(w => w.id === active.id) : undefined

  // Process virtuel construit depuis le workflow retour
  const workflowAsProcess: Process | undefined = selectedWorkflow ? {
    id:       selectedWorkflow.id,
    slug:     selectedWorkflow.slug,
    title:    selectedWorkflow.name,
    subtitle: selectedWorkflow.chat_label ?? selectedWorkflow.slug,
    steps:    workflowToProcessSteps(selectedWorkflow.steps || []),
    sort_order: 0,
  } : undefined

  const updateLocal = useCallback((id: string, patch: Partial<Process>) => {
    setProcesses(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }, [])

  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  const scheduleSave = useCallback((id: string, patch: Record<string, unknown>) => {
    pendingRef.current = { ...pendingRef.current, ...patch }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await fetch('/api/processes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...pendingRef.current }),
      })
      pendingRef.current = {}
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 800)
  }, [])

  const handleStepEdit = useCallback((step: StepItem, field: string, value: string) => {
    if (!selectedProcess) return
    const newSteps = selectedProcess.steps.map(s => {
      if (s.id !== step.id) return s
      if (field === 'text')  return { ...s, text: value }
      if (field === 'lines') return { ...s, lines: JSON.parse(value) as string[] }
      if (field === 'title') return { ...s, title: value }
      return s
    })
    updateLocal(selectedProcess.id, { steps: newSteps })
    scheduleSave(selectedProcess.id, { steps: newSteps })
  }, [selectedProcess, updateLocal, scheduleSave])

  const handleTitleSave = useCallback((val: string) => {
    if (!selectedProcess) return
    setEditingTitle(false)
    updateLocal(selectedProcess.id, { title: val })
    scheduleSave(selectedProcess.id, { title: val })
  }, [selectedProcess, updateLocal, scheduleSave])

  const handleSubtitleSave = useCallback((val: string) => {
    if (!selectedProcess) return
    setEditingSubtitle(false)
    updateLocal(selectedProcess.id, { subtitle: val })
    scheduleSave(selectedProcess.id, { subtitle: val })
  }, [selectedProcess, updateLocal, scheduleSave])

  const syncFromWorkflow = useCallback(async () => {
    if (!selectedProcess?.workflow_slug) return
    setSyncing(true); setSyncError(null)
    try {
      const res  = await fetch('/api/returns/workflows')
      const data = await res.json() as { workflows?: Array<{ slug: string; name: string; steps: WorkflowStep[] }> }
      const wf   = (data.workflows || []).find(w => w.slug === selectedProcess.workflow_slug)
      if (!wf) throw new Error(`Workflow "${selectedProcess.workflow_slug}" introuvable`)
      const newSteps = workflowToProcessSteps(wf.steps || [])
      updateLocal(selectedProcess.id, { steps: newSteps })
      scheduleSave(selectedProcess.id, { steps: newSteps })
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Erreur de sync')
    } finally { setSyncing(false) }
  }, [selectedProcess, updateLocal, scheduleSave])

  // Grouper les workflows par catégorie
  const wfByGroup: Record<string, ReturnWorkflow[]> = {}
  for (const wf of workflows) {
    const g = getGroup(wf.slug).label
    if (!wfByGroup[g]) wfByGroup[g] = []
    wfByGroup[g].push(wf)
  }
  const groupOrder = [...WF_GROUPS.map(g => g.label), 'Autres']
  const sortedGroups = groupOrder.filter(g => wfByGroup[g]?.length > 0)

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Chargement…</div>

  return (
    <div className="flex gap-6 min-h-[600px]">

      {/* ── Sidebar ── */}
      <div className="w-56 flex-shrink-0 space-y-4 overflow-y-auto max-h-[calc(100vh-120px)]">

        {/* Process éditables */}
        {processes.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Process</p>
            <div className="space-y-0.5">
              {processes.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActive({ kind: 'process', id: p.id })}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    active?.kind === 'process' && active.id === p.id
                      ? 'bg-black text-white font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="block leading-snug text-[13px]">{p.title}</span>
                  <span className={`text-[11px] mt-0.5 block ${active?.kind === 'process' && active.id === p.id ? 'text-gray-300' : 'text-gray-400'}`}>
                    {p.steps.filter(s => s.type === 'step').length} étapes
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Workflows retours — groupés par catégorie */}
        {sortedGroups.map(groupLabel => {
          const group = WF_GROUPS.find(g => g.label === groupLabel) ?? { color: 'text-gray-500', label: groupLabel, prefix: '' }
          const wfs   = wfByGroup[groupLabel] || []
          return (
            <div key={groupLabel}>
              <p className={`text-[10px] font-semibold uppercase tracking-wider px-2 mb-1.5 ${group.color}`}>
                {groupLabel}
              </p>
              <div className="space-y-0.5">
                {wfs.map(wf => {
                  const isActive = active?.kind === 'workflow' && active.id === wf.id
                  return (
                    <button
                      key={wf.id}
                      onClick={() => setActive({ kind: 'workflow', id: wf.id })}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-gray-900 text-white font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="block leading-snug text-[13px]">{wf.chat_label || wf.name}</span>
                      <span className={`text-[11px] mt-0.5 block font-mono ${isActive ? 'text-gray-400' : 'text-gray-400'}`}>
                        {wf.slug}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Zone principale ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">

        {/* === Vue workflow retour (lecture seule) === */}
        {workflowAsProcess && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-xs text-gray-400 font-mono">{selectedWorkflow!.slug}</div>
                <h2 className="text-base font-semibold text-gray-900 mt-0.5">{selectedWorkflow!.name}</h2>
                {selectedWorkflow!.description && (
                  <p className="text-xs text-gray-500 mt-0.5 max-w-lg">{selectedWorkflow!.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-mono">
                  {(selectedWorkflow!.steps || []).length} steps bruts → {workflowAsProcess.steps.filter(s => s.type === 'step').length} étapes visuelles
                </span>
              </div>
            </div>
            <ProcessFlow process={workflowAsProcess} onEdit={() => {}} readOnly />
          </>
        )}

        {/* === Vue process éditable === */}
        {selectedProcess && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                {editingSubtitle ? (
                  <input
                    autoFocus defaultValue={selectedProcess.subtitle}
                    onBlur={e => handleSubtitleSave(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSubtitleSave((e.target as HTMLInputElement).value) }}
                    className="text-xs text-gray-400 border-b border-gray-300 focus:outline-none bg-transparent w-64"
                  />
                ) : (
                  <div className="text-xs text-gray-400 cursor-pointer hover:text-gray-600" onClick={() => setEditingSubtitle(true)}>
                    {selectedProcess.subtitle || '(sous-titre)'}
                  </div>
                )}
                {editingTitle ? (
                  <input
                    autoFocus defaultValue={selectedProcess.title}
                    onBlur={e => handleTitleSave(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleTitleSave((e.target as HTMLInputElement).value) }}
                    className="text-base font-semibold text-gray-900 border-b border-gray-400 focus:outline-none bg-transparent w-96 mt-0.5"
                  />
                ) : (
                  <h2 className="text-base font-semibold text-gray-900 cursor-pointer hover:text-gray-600 mt-0.5" onClick={() => setEditingTitle(true)}>
                    {selectedProcess.title}
                  </h2>
                )}
              </div>
              <div className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
                {selectedProcess.workflow_slug && (
                  <>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 text-[11px] font-medium">
                      ⇄ {selectedProcess.workflow_slug}
                    </span>
                    <button
                      onClick={syncFromWorkflow}
                      disabled={syncing}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-900 text-white text-[11px] font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {syncing ? '↻ Sync…' : '↻ Synchroniser'}
                    </button>
                    {syncError && <span className="text-red-500 text-[11px]">{syncError}</span>}
                  </>
                )}
                {saving && <span className="text-gray-400">Sauvegarde…</span>}
                {saved  && <span className="text-green-600 font-medium">✓ Sauvegardé</span>}
                <span className="text-gray-300 italic">Cliquez sur un champ pour modifier</span>
              </div>
            </div>
            <ProcessFlow process={selectedProcess} onEdit={handleStepEdit} />
          </>
        )}

        {!selectedProcess && !workflowAsProcess && (
          <p className="text-sm text-gray-400">Sélectionnez un process ou un workflow.</p>
        )}
      </div>
    </div>
  )
}
