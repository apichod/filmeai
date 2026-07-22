'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type TemplateCase = {
  template_id: string
  case_key: string
  label: string
  case_label: string
  subject: string
  body: string
  conditions: Record<string, boolean>
  sort_order: number
  updated_at: string
  slug?: string
}

type TemplateGroup = {
  template_id: string
  label: string
  cases: TemplateCase[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseGroupNum(label: string): number {
  const m = (label || '').match(/^[R#]?(\d+)/)
  return m ? parseInt(m[1], 10) : 999
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    || `template_${Date.now()}`
}

// ── Placeholders ────────────────────────────────────────────────────────────────

const PLACEHOLDERS = [
  { token: '{{customerName}}',      desc: 'Nom du client' },
  { token: '{{originOrderNumber}}', desc: 'N° commande origine' },
  { token: '{{orderNumber}}',       desc: 'N° commande (retour OK)' },
  { token: '{{orderStartsAt}}',     desc: 'Date début location' },
  { token: '{{orderStopsAt}}',      desc: 'Date fin location' },
  { token: '{{notesSav}}',          desc: 'Détail du problème' },
  { token: '{{paymentLink}}',       desc: 'Lien paiement CB' },
  { token: '{{documentNumber}}',    desc: 'N° facture' },
]

// ── Composant principal ────────────────────────────────────────────────────────

export default function EmailTemplatesPage() {
  const [groups, setGroups]         = useState<TemplateGroup[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing]       = useState<Record<string, { subject: string; body: string; slug: string }>>({})
  const [saving, setSaving]         = useState<string | null>(null)
  const [saved, setSaved]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)

  // Label editing
  const [labelDraft, setLabelDraft]   = useState('')
  const [savingLabel, setSavingLabel] = useState(false)
  const [savedLabel, setSavedLabel]   = useState(false)

  // Template ID editing
  const [templateIdDraft, setTemplateIdDraft]     = useState('')
  const [savingTemplateId, setSavingTemplateId]   = useState(false)
  const [savedTemplateId, setSavedTemplateId]     = useState(false)

  // Case key editing (per variant)
  const [caseKeyDrafts, setCaseKeyDrafts]         = useState<Record<string, string>>({})
  const [savingCaseKey, setSavingCaseKey]         = useState<string | null>(null)
  const [savedCaseKey, setSavedCaseKey]           = useState<string | null>(null)

  // Nouveau template
  const [showNewTemplate, setShowNewTemplate] = useState(false)
  const [newTemplateLabel, setNewTemplateLabel] = useState('')
  const [creatingTemplate, setCreatingTemplate] = useState(false)

  // Nouvelle variante
  const [showNewVariant, setShowNewVariant] = useState(false)
  const [newVariantLabel, setNewVariantLabel] = useState('')
  const [creatingVariant, setCreatingVariant] = useState(false)

  useEffect(() => {
    fetch('/api/email-templates')
      .then(r => r.json())
      .then((data: TemplateGroup[]) => {
        const sorted = [...data].sort((a, b) => parseGroupNum(a.label) - parseGroupNum(b.label))
        setGroups(sorted)
        if (sorted.length > 0) {
          setSelectedId(sorted[0].template_id)
          setLabelDraft(sorted[0].label)
        }
        const init: Record<string, { subject: string; body: string; slug: string }> = {}
        for (const g of sorted) {
          for (const c of g.cases) {
            init[`${c.template_id}__${c.case_key}`] = { subject: c.subject, body: c.body, slug: c.slug || '' }
          }
        }
        setEditing(init)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const selectedGroup = groups.find(g => g.template_id === selectedId)

  // Sync labelDraft + templateIdDraft when selection changes
  useEffect(() => {
    if (selectedGroup) {
      setLabelDraft(selectedGroup.label)
      setTemplateIdDraft(selectedGroup.template_id)
    }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers existants ──────────────────────────────────────────────────────

  const handleChange = useCallback((templateId: string, caseKey: string, field: 'subject' | 'body' | 'slug', value: string) => {
    const k = `${templateId}__${caseKey}`
    setEditing(prev => ({ ...prev, [k]: { ...prev[k], [field]: value } }))
  }, [])

  const handleSave = useCallback(async (templateId: string, caseKey: string) => {
    const k = `${templateId}__${caseKey}`
    const vals = editing[k]
    if (!vals) return
    setSaving(k)
    try {
      await fetch('/api/email-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, case_key: caseKey, subject: vals.subject, body: vals.body, slug: vals.slug }),
      })
      setGroups(prev => prev.map(g =>
        g.template_id !== templateId ? g : {
          ...g,
          cases: g.cases.map(c => c.case_key !== caseKey ? c : { ...c, slug: vals.slug })
        }
      ))
      setSaved(k)
      setTimeout(() => setSaved(null), 2000)
    } finally {
      setSaving(null)
    }
  }, [editing])

  const handleDeleteTemplate = useCallback(async () => {
    if (!selectedGroup) return
    if (!confirm(`Supprimer "${selectedGroup.label}" et toutes ses variantes ?`)) return
    await fetch('/api/email-templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: selectedGroup.template_id }),
    })
    const remaining = groups.filter(g => g.template_id !== selectedGroup.template_id)
    setGroups(remaining)
    setSelectedId(remaining.length > 0 ? remaining[0].template_id : null)
  }, [selectedGroup, groups])

  const handleSaveCaseKey = useCallback(async (templateId: string, oldCaseKey: string) => {
    const k = `${templateId}__${oldCaseKey}`
    const newCaseKey = (caseKeyDrafts[k] ?? oldCaseKey).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    if (!newCaseKey || newCaseKey === oldCaseKey) return
    setSavingCaseKey(k)
    try {
      await fetch('/api/email-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, case_key: oldCaseKey, new_case_key: newCaseKey }),
      })
      setGroups(prev => prev.map(g =>
        g.template_id !== templateId ? g : {
          ...g,
          cases: g.cases.map(c => c.case_key !== oldCaseKey ? c : { ...c, case_key: newCaseKey }),
        }
      ))
      setCaseKeyDrafts(prev => { const n = { ...prev }; delete n[k]; n[`${templateId}__${newCaseKey}`] = newCaseKey; return n })
      setSavedCaseKey(`${templateId}__${newCaseKey}`)
      setTimeout(() => setSavedCaseKey(null), 2000)
    } finally {
      setSavingCaseKey(null)
    }
  }, [caseKeyDrafts])

  const handleSaveTemplateId = useCallback(async () => {
    if (!selectedGroup) return
    const newId = templateIdDraft.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    if (!newId || newId === selectedGroup.template_id) return
    setSavingTemplateId(true)
    try {
      await fetch('/api/email-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: selectedGroup.template_id, new_template_id: newId }),
      })
      setGroups(prev => prev.map(g =>
        g.template_id !== selectedGroup.template_id ? g : { ...g, template_id: newId }
      ))
      setSelectedId(newId)
      setTemplateIdDraft(newId)
      setSavedTemplateId(true)
      setTimeout(() => setSavedTemplateId(false), 2000)
    } finally {
      setSavingTemplateId(false)
    }
  }, [selectedGroup, templateIdDraft])

  const handleSaveLabel = useCallback(async () => {
    if (!selectedGroup) return
    const newLabel = labelDraft.trim()
    if (!newLabel || newLabel === selectedGroup.label) return
    setSavingLabel(true)
    try {
      await fetch('/api/email-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: selectedGroup.template_id, label: newLabel }),
      })
      setGroups(prev =>
        prev
          .map(g => g.template_id === selectedGroup.template_id ? { ...g, label: newLabel } : g)
          .sort((a, b) => parseGroupNum(a.label) - parseGroupNum(b.label))
      )
      setSavedLabel(true)
      setTimeout(() => setSavedLabel(false), 2000)
    } finally {
      setSavingLabel(false)
    }
  }, [selectedGroup, labelDraft])

  // ── Créer un nouveau template ───────────────────────────────────────────────

  const handleCreateTemplate = useCallback(async () => {
    const label = newTemplateLabel.trim()
    if (!label) return
    const template_id = slugify(label)
    setCreatingTemplate(true)
    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id, case_key: 'default', label, subject: '', body: '', sort_order: 0 }),
      })
      const data = await res.json() as { ok?: boolean; row?: TemplateCase; error?: string }
      if (!data.ok || !data.row) { alert(data.error || 'Erreur'); return }

      const newCase: TemplateCase = { ...data.row, slug: data.row.slug || template_id }
      const newGroup: TemplateGroup = { template_id, label, cases: [newCase] }

      setGroups(prev =>
        [...prev, newGroup].sort((a, b) => parseGroupNum(a.label) - parseGroupNum(b.label))
      )
      setEditing(prev => ({
        ...prev,
        [`${template_id}__default`]: { subject: '', body: '', slug: template_id },
      }))
      setSelectedId(template_id)
      setLabelDraft(label)
      setNewTemplateLabel('')
      setShowNewTemplate(false)
    } finally {
      setCreatingTemplate(false)
    }
  }, [newTemplateLabel])

  // ── Créer une nouvelle variante ─────────────────────────────────────────────

  const handleCreateVariant = useCallback(async () => {
    if (!selectedGroup) return
    const case_label = newVariantLabel.trim()
    const case_key = case_label ? slugify(case_label) : `variante_${selectedGroup.cases.length + 1}`
    const sort_order = Math.max(0, ...selectedGroup.cases.map(c => c.sort_order)) + 1
    setCreatingVariant(true)
    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedGroup.template_id,
          case_key,
          label: selectedGroup.label,
          case_label,
          subject: '',
          body: '',
          sort_order,
        }),
      })
      const data = await res.json() as { ok?: boolean; row?: TemplateCase; error?: string }
      if (!data.ok || !data.row) { alert(data.error || 'Erreur'); return }

      const newCase: TemplateCase = { ...data.row, slug: data.row.slug || `${selectedGroup.template_id}_cas_${sort_order + 1}` }
      setGroups(prev => prev.map(g =>
        g.template_id !== selectedGroup.template_id ? g : { ...g, cases: [...g.cases, newCase] }
      ))
      setEditing(prev => ({
        ...prev,
        [`${selectedGroup.template_id}__${case_key}`]: { subject: '', body: '', slug: newCase.slug || '' },
      }))
      setNewVariantLabel('')
      setShowNewVariant(false)
    } finally {
      setCreatingVariant(false)
    }
  }, [selectedGroup, newVariantLabel])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">Chargement des templates…</div>
  }

  return (
    <div className="flex gap-6 min-h-[600px]">

      {/* ── Colonne gauche : navigation ── */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-1">
        <div className="flex-1 space-y-1">
          {groups.map(g => (
            <button
              key={g.template_id}
              onClick={() => { setSelectedId(g.template_id); setShowNewVariant(false) }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                selectedId === g.template_id
                  ? 'bg-black text-white font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="block leading-snug truncate">{g.label}</span>
              <span className={`text-xs mt-0.5 block ${selectedId === g.template_id ? 'text-gray-300' : 'text-gray-400'}`}>
                {g.cases.length} variante{g.cases.length > 1 ? 's' : ''}
              </span>
            </button>
          ))}
        </div>

        {/* Nouveau template */}
        {showNewTemplate ? (
          <div className="mt-2 space-y-1.5">
            <input
              autoFocus
              type="text"
              value={newTemplateLabel}
              onChange={e => setNewTemplateLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateTemplate(); if (e.key === 'Escape') setShowNewTemplate(false) }}
              placeholder="ex: 15 – Mon template"
              className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-black/10"
            />
            <div className="flex gap-1">
              <button
                onClick={handleCreateTemplate}
                disabled={creatingTemplate || !newTemplateLabel.trim()}
                className="flex-1 px-2 py-1 bg-black text-white text-xs rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                {creatingTemplate ? '…' : 'Créer'}
              </button>
              <button
                onClick={() => { setShowNewTemplate(false); setNewTemplateLabel('') }}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNewTemplate(true)}
            className="mt-2 w-full flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nouveau template
          </button>
        )}

        {/* Légende placeholders */}
        <div className="pt-4 border-t border-gray-100 mt-2 space-y-0.5">
          <p className="text-xs font-medium text-gray-500 mb-2 px-1">Variables disponibles</p>
          {PLACEHOLDERS.map(p => (
            <div key={p.token} className="px-1 py-0.5">
              <code className="text-[10px] bg-gray-100 text-gray-600 px-1 rounded">{p.token}</code>
              <span className="text-[10px] text-gray-400 ml-1">{p.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Colonne droite : éditeur ── */}
      <div className="flex-1 min-w-0 space-y-6">
        {!selectedGroup ? (
          <p className="text-sm text-gray-400">Sélectionnez un template.</p>
        ) : (
          <>
            {/* Titre éditable */}
            <div className="flex items-end gap-3">
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-gray-400 mb-1">Titre du template</label>
                <input
                  type="text"
                  value={labelDraft}
                  onChange={e => setLabelDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveLabel() }}
                  className="w-full text-base font-semibold text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="ex: 10 – Contrôle retour OK"
                />
              </div>
              <div className="flex items-center gap-2 pb-0.5">
                {savedLabel && <span className="text-xs text-green-600 font-medium">✓ Sauvegardé</span>}
                <button
                  onClick={handleSaveLabel}
                  disabled={savingLabel || labelDraft.trim() === selectedGroup.label}
                  className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors"
                >
                  {savingLabel ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
                <button
                  onClick={handleDeleteTemplate}
                  title="Supprimer ce template"
                  className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Identifiant workflow (template_id) */}
            <div className="flex items-center gap-2 -mt-3">
              <label className="text-xs text-gray-400 shrink-0">Identifiant workflow :</label>
              <input
                type="text"
                value={templateIdDraft}
                onChange={e => setTemplateIdDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveTemplateId() }}
                className="font-mono text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white text-gray-600 w-64"
              />
              {savedTemplateId && <span className="text-xs text-green-600">✓</span>}
              <button
                onClick={handleSaveTemplateId}
                disabled={savingTemplateId || templateIdDraft.trim() === selectedGroup.template_id}
                className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-30 transition-colors"
              >
                {savingTemplateId ? '…' : 'Renommer'}
              </button>
            </div>

            <p className="text-xs text-gray-400 -mt-4">
              {selectedGroup.cases.length > 1
                ? `${selectedGroup.cases.length} variantes selon assurance / caution / montant`
                : 'Template unique'}
            </p>

            {/* Cartes des variantes */}
            {selectedGroup.cases.map((c) => {
              const k = `${c.template_id}__${c.case_key}`
              const vals = editing[k] ?? { subject: c.subject, body: c.body, slug: c.slug || '' }
              const isSaving = saving === k
              const isSaved  = saved === k

              return (
                <div key={c.case_key} className="border border-gray-200 rounded-xl p-5 space-y-4">
                  {/* Badges conditions */}
                  {(c.case_label || Object.keys(c.conditions || {}).length > 0) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {c.case_label && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {c.case_label}
                        </span>
                      )}
                      {c.conditions && (['insurance', 'caution', 'amountAbove500', 'latePayment'] as const)
                        .filter(k => k in c.conditions)
                        .map(k => [k, c.conditions[k]] as [string, boolean])
                        .map(([k, v]) => (
                          <span key={k} className={`px-2 py-0.5 rounded-full text-xs font-medium ${v ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                            {k === 'insurance' ? (v ? '✓ assurance' : '✗ assurance') :
                             k === 'caution' ? (v ? '✓ caution' : '✗ caution') :
                             k === 'amountAbove500' ? (v ? '> 500 €' : '< 500 €') :
                             k === 'latePayment' ? '⚠ retard' : `${k}: ${v}`}
                          </span>
                        ))}
                    </div>
                  )}

                  {/* Identifiant variante (case_key) */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 shrink-0">Identifiant variante :</label>
                    <input
                      type="text"
                      value={caseKeyDrafts[k] ?? c.case_key}
                      onChange={e => setCaseKeyDrafts(prev => ({ ...prev, [k]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveCaseKey(c.template_id, c.case_key) }}
                      className="font-mono text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white text-gray-600 w-56"
                    />
                    {savedCaseKey === `${c.template_id}__${caseKeyDrafts[k] ?? c.case_key}` && (
                      <span className="text-xs text-green-600">✓</span>
                    )}
                    <button
                      onClick={() => handleSaveCaseKey(c.template_id, c.case_key)}
                      disabled={savingCaseKey === k || (caseKeyDrafts[k] ?? c.case_key) === c.case_key}
                      className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-30 transition-colors"
                    >
                      {savingCaseKey === k ? '…' : 'Renommer'}
                    </button>
                  </div>

                  {/* Objet */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Objet</label>
                    <input
                      type="text"
                      value={vals.subject}
                      onChange={e => handleChange(c.template_id, c.case_key, 'subject', e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/10"
                    />
                  </div>

                  {/* Corps */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Corps de l&apos;email</label>
                    <textarea
                      value={vals.body}
                      onChange={e => handleChange(c.template_id, c.case_key, 'body', e.target.value)}
                      rows={Math.min(32, (vals.body.match(/\n/g) || []).length + 4)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-black/10"
                    />
                  </div>

                  {/* Bouton sauvegarder */}
                  <div className="flex items-center justify-end gap-3">
                    {isSaved && <span className="text-xs text-green-600 font-medium">✓ Sauvegardé</span>}
                    <button
                      onClick={() => handleSave(c.template_id, c.case_key)}
                      disabled={isSaving}
                      className="px-4 py-1.5 bg-black text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                    >
                      {isSaving ? 'Sauvegarde…' : 'Sauvegarder'}
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Ajouter une variante */}
            {showNewVariant ? (
              <div className="border border-dashed border-gray-300 rounded-xl p-4 space-y-3">
                <p className="text-xs font-medium text-gray-500">Nouvelle variante</p>
                <input
                  autoFocus
                  type="text"
                  value={newVariantLabel}
                  onChange={e => setNewVariantLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateVariant(); if (e.key === 'Escape') setShowNewVariant(false) }}
                  placeholder="ex: Avec assurance, sans caution (optionnel)"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/10"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setShowNewVariant(false); setNewVariantLabel('') }}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCreateVariant}
                    disabled={creatingVariant}
                    className="px-4 py-1.5 bg-black text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {creatingVariant ? 'Création…' : 'Créer la variante'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewVariant(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Ajouter une variante
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
