'use client'

import { useEffect, useRef, useState } from 'react'

const BOOQABLE_TOOLS = [
  { value: 'fetch_order',       label: 'fetch_order — récupérer l\'order' },
  { value: 'search_products',   label: 'search_products — identifier les articles (bulk/trackable/custom)' },
  { value: 'add_internal_note', label: 'add_internal_note — note interne' },
  { value: 'create_sav_order',  label: 'create_sav_order — créer la SAV order' },
  { value: 'add_sav_line',      label: 'add_sav_line — ajouter un article à la SAV order' },
  { value: 'add_tag',           label: 'add_tag — ajouter un tag' },
  { value: 'add_sav_comment',   label: 'add_sav_comment — commentaire SAV' },
  { value: 'log_case',          label: 'log_case — logger le cas FilmeAI' },
]

// ── Types ──────────────────────────────────────────────────────────────────────

type WorkflowStep = {
  id: string
  type: 'action' | 'question' | 'instruction'
  title: string
  description: string
  booqable_action?: string
  variable?: string
}

type Workflow = {
  id: string
  slug: string
  name: string
  description: string
  prompt: string
  steps: WorkflowStep[]
  is_active: boolean
}

// ── Composant Step ─────────────────────────────────────────────────────────────

function StepBadge({ type }: { type: string }) {
  if (type === 'action')      return <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 font-medium">Action</span>
  if (type === 'question')    return <span className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 font-medium">Question</span>
  if (type === 'instruction') return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 font-medium">Instruction</span>
  return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{type}</span>
}

// ── Composant StepList avec drag-and-drop ─────────────────────────────────────

function StepList({
  steps,
  onChange,
  onRemove,
}: {
  steps: WorkflowStep[]
  onChange: (steps: WorkflowStep[]) => void
  onRemove: (idx: number) => void
}) {
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  function onDragStart(idx: number) {
    dragIdx.current = idx
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOver(idx)
  }

  function onDrop(targetIdx: number) {
    const from = dragIdx.current
    if (from === null || from === targetIdx) { setDragOver(null); return }
    const next = [...steps]
    const [moved] = next.splice(from, 1)
    next.splice(targetIdx, 0, moved)
    onChange(next)
    dragIdx.current = null
    setDragOver(null)
  }

  function updateStep(idx: number, patch: Partial<WorkflowStep>) {
    const next = steps.map((s, i) => i === idx ? { ...s, ...patch } : s)
    onChange(next)
  }

  if (steps.length === 0) {
    return <div className="text-center text-xs text-gray-400 py-6">Aucune étape — cliquez sur Ajouter</div>
  }

  return (
    <div className="space-y-2">
      {steps.map((step, idx) => (
        <div
          key={step.id}
          draggable
          onDragStart={() => onDragStart(idx)}
          onDragOver={e => onDragOver(e, idx)}
          onDrop={() => onDrop(idx)}
          onDragEnd={() => setDragOver(null)}
          className={`border rounded-lg p-3 space-y-2 transition-colors ${
            dragOver === idx
              ? 'border-blue-300 bg-blue-50/50'
              : 'border-gray-100 bg-gray-50/50'
          }`}
        >
          <div className="flex items-center gap-2">
            {/* Drag handle */}
            <span className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0" title="Déplacer">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 2a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zM13 2a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2z" />
              </svg>
            </span>

            <span className="text-xs text-gray-300 font-mono w-4 shrink-0">{idx + 1}</span>

            <select
              value={step.type}
              onChange={e => updateStep(idx, { type: e.target.value as WorkflowStep['type'] })}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
            >
              <option value="action">Action</option>
              <option value="question">Question</option>
              <option value="instruction">Instruction</option>
            </select>

            <StepBadge type={step.type} />

            <div className="flex-1" />

            <button
              onClick={() => onRemove(idx)}
              className="text-gray-300 hover:text-red-500 p-0.5 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Titre + description */}
          <div className="grid grid-cols-2 gap-2 pl-7">
            <input
              value={step.title}
              onChange={e => updateStep(idx, { title: e.target.value })}
              placeholder="Titre de l'étape"
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
            />
            <input
              value={step.description}
              onChange={e => updateStep(idx, { description: e.target.value })}
              placeholder="Description"
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
            />
          </div>

          {/* Outil Booqable — affiché pour les actions */}
          {step.type === 'action' && (
            <div className="pl-7">
              <label className="block text-xs text-gray-400 mb-1">Appel API Booqable</label>
              <select
                value={step.booqable_action || ''}
                onChange={e => updateStep(idx, { booqable_action: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
              >
                <option value="">— aucun —</option>
                {BOOQABLE_TOOLS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Workflow | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Champs en cours d'édition
  const [editSlug, setEditSlug] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editSteps, setEditSteps] = useState<WorkflowStep[]>([])
  const [editActive, setEditActive] = useState(true)
  const [exportModal, setExportModal] = useState(false)
  const [exportCopied, setExportCopied] = useState(false)

  function exportJson() {
    return JSON.stringify({
      name:        editName,
      slug:        editSlug,
      description: editDescription,
      is_active:   editActive,
      prompt_ia:   editPrompt,
      steps:       editSteps,
    }, null, 2)
  }

  function copyExport() {
    navigator.clipboard.writeText(exportJson()).then(() => {
      setExportCopied(true)
      setTimeout(() => setExportCopied(false), 2000)
    })
  }

  useEffect(() => {
    fetch('/api/returns/workflows')
      .then(r => r.json())
      .then(d => {
        const wfs = d.workflows || []
        setWorkflows(wfs)
        if (wfs.length > 0) select(wfs[0])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function select(wf: Workflow) {
    setSelected(wf)
    setEditing(false)
    setEditSlug(wf.slug)
    setEditName(wf.name)
    setEditDescription(wf.description)
    setEditPrompt(wf.prompt)
    setEditSteps(wf.steps || [])
    setEditActive(wf.is_active)
    setSaved(false)
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/returns/workflows', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          slug: editSlug,
          name: editName,
          description: editDescription,
          prompt: editPrompt,
          steps: editSteps,
          is_active: editActive,
        }),
      })
      if (!res.ok) throw new Error('Erreur serveur')

      const updated = { ...selected, slug: editSlug, name: editName, description: editDescription, prompt: editPrompt, steps: editSteps, is_active: editActive }
      setWorkflows(prev => prev.map(w => w.id === selected.id ? updated : w))
      setSelected(updated)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function deleteWorkflow(wf: Workflow) {
    if (!confirm(`Supprimer le workflow "${wf.name}" ?`)) return
    await fetch('/api/returns/workflows', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: wf.id }),
    })
    const remaining = workflows.filter(w => w.id !== wf.id)
    setWorkflows(remaining)
    if (selected?.id === wf.id) {
      if (remaining.length > 0) select(remaining[0])
      else setSelected(null)
    }
  }

  async function seed() {
    setSeeding(true)
    setSeedMsg(null)
    try {
      const res = await fetch('/api/returns/workflows/seed')
      const d = await res.json() as { message?: string; created?: number; error?: string }
      setSeedMsg(d.error ? `Erreur : ${d.error}` : (d.message ?? 'OK'))
      if (!d.error) {
        // Recharger la liste
        const r2 = await fetch('/api/returns/workflows')
        const d2 = await r2.json() as { workflows: Workflow[] }
        const wfs = d2.workflows || []
        setWorkflows(wfs)
        if (wfs.length > 0 && !selected) select(wfs[0])
      }
    } finally {
      setSeeding(false)
      setTimeout(() => setSeedMsg(null), 4000)
    }
  }

  async function createNew() {
    setCreating(true)
    try {
      const res = await fetch('/api/returns/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: `workflow-${Date.now()}`, name: 'Nouveau workflow', description: '', prompt: '', steps: [], is_active: false }),
      })
      const d = await res.json() as { workflow?: Workflow; error?: string }
      if (d.workflow) {
        setWorkflows(prev => [...prev, d.workflow!])
        select(d.workflow!)
        setEditing(true)
      }
    } finally {
      setCreating(false)
    }
  }

  function addStep() {
    const newStep: WorkflowStep = {
      id: String(Date.now()),
      type: 'instruction',
      title: 'Nouvelle étape',
      description: '',
    }
    setEditSteps(prev => [...prev, newStep])
  }

  function removeStep(idx: number) {
    setEditSteps(prev => prev.filter((_, i) => i !== idx))
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-400">Chargement…</div>
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Workflows retours</h1>
          <p className="text-sm text-gray-500 mt-0.5">Éditez les procédures utilisées par l&apos;assistant</p>
        </div>
        <div className="flex items-center gap-3">
          {seedMsg && (
            <span className={`text-xs font-medium ${seedMsg.startsWith('Erreur') ? 'text-red-600' : 'text-green-600'}`}>
              {seedMsg}
            </span>
          )}
          {saved && (
            <span className="text-sm text-green-600 font-medium flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Sauvegardé
            </span>
          )}
          <button
            onClick={seed}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {seeding ? (
              <span className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
            Créer les 5 workflows
          </button>
          <button
            onClick={createNew}
            disabled={creating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nouveau workflow
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Liste des workflows */}
        <div className="w-52 shrink-0 space-y-1">
          {workflows.map(wf => (
            <div key={wf.id} className="group relative">
              <button
                onClick={() => select(wf)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm ${
                  selected?.id === wf.id
                    ? 'bg-black text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <div className="font-medium pr-5">{wf.name}</div>
                <div className={`text-xs mt-0.5 font-mono ${selected?.id === wf.id ? 'text-white/50' : 'text-gray-400'}`}>
                  {wf.slug} · {wf.steps?.length || 0} étapes
                </div>
              </button>
              <button
                onClick={() => deleteWorkflow(wf)}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 transition-all"
                title="Supprimer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Éditeur */}
        {selected && (
          <div className="flex-1 space-y-4">
            {/* Infos générales */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Informations</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExportModal(true)}
                    className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Exporter
                  </button>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={e => { setEditActive(e.target.checked); setEditing(true) }}
                      className="rounded"
                    />
                    Actif
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
                  <input
                    value={editName}
                    onChange={e => { setEditName(e.target.value); setEditing(true) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description courte</label>
                  <input
                    value={editDescription}
                    onChange={e => { setEditDescription(e.target.value); setEditing(true) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Slug <span className="text-gray-400 font-normal">(doit correspondre au scénario chat : late · late_returned · late_partial · missing · damage)</span>
                </label>
                <input
                  value={editSlug}
                  onChange={e => { setEditSlug(e.target.value); setEditing(true) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-300"
                  placeholder="ex: late"
                />
              </div>
            </div>

            {/* Prompt IA */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Prompt IA</h2>
                <p className="text-xs text-gray-400 mt-0.5">Instructions libres chargées dans le système de l&apos;assistant</p>
              </div>
              <textarea
                value={editPrompt}
                onChange={e => { setEditPrompt(e.target.value); setEditing(true) }}
                rows={12}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-300 resize-y"
                placeholder="Instructions pour l'IA…"
              />
            </div>

            {/* Étapes structurées */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Étapes structurées</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Référence visuelle de la procédure (affichée en admin)</p>
                </div>
                <button
                  onClick={() => { addStep(); setEditing(true) }}
                  className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Ajouter
                </button>
              </div>

              <StepList
                steps={editSteps}
                onChange={steps => { setEditSteps(steps); setEditing(true) }}
                onRemove={idx => { removeStep(idx); setEditing(true) }}
              />
            </div>

            {/* Actions */}
            {editing && (
              <div className="flex justify-end gap-3 pb-6">
                <button
                  onClick={() => select(selected)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-5 py-2 bg-black text-white text-sm rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal export JSON ── */}
      {exportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setExportModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Export workflow</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{editName} <span className="font-mono font-normal text-gray-400">· {editSlug}</span></p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyExport}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${exportCopied ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-black text-white hover:bg-gray-800'}`}
                >
                  {exportCopied ? (
                    <>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      Copié !
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                      Copier
                    </>
                  )}
                </button>
                <button onClick={() => setExportModal(false)} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="px-6 py-4 max-h-[65vh] overflow-y-auto">
              <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-words leading-relaxed">{exportJson()}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
