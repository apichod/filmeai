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
}

type TemplateGroup = {
  template_id: string
  label: string
  cases: TemplateCase[]
}

// ── Placeholders helper ────────────────────────────────────────────────────────

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
  const [editing, setEditing]       = useState<Record<string, { subject: string; body: string }>>({})
  const [saving, setSaving]         = useState<string | null>(null)
  const [saved, setSaved]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetch('/api/email-templates')
      .then(r => r.json())
      .then((data: TemplateGroup[]) => {
        setGroups(data)
        if (data.length > 0) setSelectedId(data[0].template_id)
        // Init editing state from DB values
        const init: Record<string, { subject: string; body: string }> = {}
        for (const g of data) {
          for (const c of g.cases) {
            init[`${c.template_id}__${c.case_key}`] = { subject: c.subject, body: c.body }
          }
        }
        setEditing(init)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const selectedGroup = groups.find(g => g.template_id === selectedId)

  const handleChange = useCallback((templateId: string, caseKey: string, field: 'subject' | 'body', value: string) => {
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
        body: JSON.stringify({ template_id: templateId, case_key: caseKey, subject: vals.subject, body: vals.body }),
      })
      setSaved(k)
      setTimeout(() => setSaved(null), 2000)
    } finally {
      setSaving(null)
    }
  }, [editing])

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">Chargement des templates…</div>
  }

  return (
    <div className="flex gap-6 min-h-[600px]">

      {/* ── Colonne gauche : liste des templates ── */}
      <div className="w-56 flex-shrink-0 space-y-1">
        {groups.map(g => (
          <button
            key={g.template_id}
            onClick={() => setSelectedId(g.template_id)}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
              selectedId === g.template_id
                ? 'bg-black text-white font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span className="block leading-snug">{g.label}</span>
            <span className={`text-xs mt-0.5 block ${selectedId === g.template_id ? 'text-gray-300' : 'text-gray-400'}`}>
              {g.cases.length} variante{g.cases.length > 1 ? 's' : ''}
            </span>
          </button>
        ))}

        {/* Légende placeholders */}
        <div className="pt-4 border-t border-gray-100 mt-4">
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
            <div>
              <h2 className="text-base font-semibold text-gray-900">{selectedGroup.label}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedGroup.cases.length > 1
                  ? `${selectedGroup.cases.length} variantes selon assurance / caution / montant`
                  : 'Template unique'}
              </p>
            </div>

            {selectedGroup.cases.map((c) => {
              const k = `${c.template_id}__${c.case_key}`
              const vals = editing[k] ?? { subject: c.subject, body: c.body }
              const isSaving = saving === k
              const isSaved  = saved === k

              return (
                <div key={c.case_key} className="border border-gray-200 rounded-xl p-5 space-y-4">
                  {c.case_label && (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {c.case_label}
                      </span>
                      {Object.entries(c.conditions).map(([k, v]) => (
                        <span key={k} className={`px-2 py-0.5 rounded-full text-xs font-medium ${v ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {k === 'insurance' ? (v ? '✓ assurance' : '✗ assurance') :
                           k === 'caution' ? (v ? '✓ caution' : '✗ caution') :
                           k === 'amountAbove500' ? (v ? '> 500 €' : '< 500 €') :
                           k === 'latePayment' ? '⚠ retard' : `${k}: ${v}`}
                        </span>
                      ))}
                    </div>
                  )}

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
                    {isSaved && (
                      <span className="text-xs text-green-600 font-medium">✓ Sauvegardé</span>
                    )}
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
          </>
        )}
      </div>
    </div>
  )
}
