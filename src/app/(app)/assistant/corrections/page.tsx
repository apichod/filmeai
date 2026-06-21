'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { type MatchDebug, formatDiagnosticForCopy } from '@/lib/diagnostic-format'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

type CatalogCorrection = {
  id: string
  source: string
  correction_type: string
  requested_text: string | null
  request_context: string | null
  matching_raw: string | null
  search_query: string | null
  section: string | null
  quantity: number | null
  ai_selected_product_id: string | null
  ai_selected_product_name: string | null
  ai_confidence: number | null
  ai_selected_by: string | null
  ai_reason: string | null
  corrected_product_id: string | null
  corrected_product_name: string | null
  diagnostic: JsonValue | null
  candidates: JsonValue | null
  metadata: JsonValue | null
  created_by: string | null
  created_at: string
}

type TestItem = {
  requestedName: string
  matched: { id: string; name: string } | null
  confidence: number
  reason: string | null
  debug?: MatchDebug
}

type ApiResponse = {
  corrections?: CatalogCorrection[]
  error?: string
}

const SOURCE_LABELS: Record<string, string> = {
  backoffice_quote: 'Back office',
  chat_widget: 'Chat widget',
}

const TYPE_LABELS: Record<string, string> = {
  replace_product: 'Produit remplacé',
  choose_product: 'Choix client',
  validate_product: 'Proposition validée',
  confirm_product: 'Confirmé dans liste',
  leave_to_filme: 'Intervention Filme',
  confirm_leave_to_filme: 'Confirmé intervention Filme',
  delete_line: 'Ligne supprimée',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function labelFor(map: Record<string, string>, value: string | null) {
  if (!value) return '—'
  return map[value] || value.replace(/_/g, ' ')
}

function confidencePercent(value: number | null) {
  if (value == null) return null
  return Math.round(Math.max(0, Math.min(1, Number(value))) * 100)
}

function stringifyJson(value: JsonValue | null) {
  if (value == null) return ''
  return JSON.stringify(value, null, 2)
}

function buildCopyText(row: CatalogCorrection) {
  const header = [
    'CORRECTION CATALOGUE FILMEAI',
    '',
    `Date     : ${formatDate(row.created_at)}`,
    `Source   : ${labelFor(SOURCE_LABELS, row.source)}`,
    `Type     : ${labelFor(TYPE_LABELS, row.correction_type)}`,
    `Demandé  : ${row.requested_text || '—'}`,
    `Choix IA : ${row.ai_selected_product_name || 'aucun'}`,
    `Correction opérateur : ${row.corrected_product_name || 'aucune / intervention Filme'}`,
    '',
  ].filter((line): line is string => line !== null).join('\n')

  if (row.diagnostic && typeof row.diagnostic === 'object' && !Array.isArray(row.diagnostic)) {
    const debug = row.diagnostic as unknown as MatchDebug
    if (debug.requestedName && debug.candidates) {
      return header + formatDiagnosticForCopy(debug, row.corrected_product_name ?? undefined)
    }
  }

  return header + 'DIAGNOSTIC JSON\n' + stringifyJson(row.diagnostic)
}

function CorrectionBadge({ type }: { type: string }) {
  const color = type.includes('delete')
    ? 'bg-red-50 text-red-700 border-red-100'
    : type.includes('filme')
      ? 'bg-amber-50 text-amber-700 border-amber-100'
      : 'bg-emerald-50 text-emerald-700 border-emerald-100'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${color}`}>
      {labelFor(TYPE_LABELS, type)}
    </span>
  )
}

export default function AssistantCorrectionsPage() {
  // ── Corrections list ──────────────────────────────────────────────────────
  const [rows, setRows] = useState<CatalogCorrection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState('')
  const [correctionType, setCorrectionType] = useState('')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ── Selection + delete ────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  // ── Test panel ────────────────────────────────────────────────────────────
  const [testOpen, setTestOpen] = useState(false)
  const [testQuery, setTestQuery] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testResults, setTestResults] = useState<TestItem[] | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testCopiedIdx, setTestCopiedIdx] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ limit: '150' })
    if (source) params.set('source', source)
    if (correctionType) params.set('correctionType', correctionType)
    if (query.trim()) params.set('q', query.trim())
    try {
      const res = await fetch(`/api/catalog-corrections?${params.toString()}`)
      const data = await res.json() as ApiResponse
      if (!res.ok || data.error) throw new Error(data.error || `Erreur HTTP ${res.status}`)
      setRows(data.corrections || [])
      setSelectedIds(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [source, correctionType, query])

  useEffect(() => { void load() }, [load])

  const sources = useMemo(() => Array.from(new Set(rows.map(r => r.source))).sort(), [rows])
  const correctionTypes = useMemo(() => Array.from(new Set(rows.map(r => r.correction_type))).sort(), [rows])
  const allSelected = rows.length > 0 && selectedIds.size === rows.length

  async function copy(row: CatalogCorrection) {
    await navigator.clipboard.writeText(buildCopyText(row))
    setCopiedId(row.id)
    window.setTimeout(() => setCopiedId(null), 1500)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const s = new Set(prev)
      if (s.has(id)) { s.delete(id) } else { s.add(id) }
      return s
    })
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map(r => r.id)))
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return
    setDeleting(true)
    try {
      const res = await fetch('/api/catalog-corrections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (res.ok) {
        setRows(prev => prev.filter(r => !selectedIds.has(r.id)))
        setSelectedIds(new Set())
      } else {
        const d = await res.json() as { error?: string }
        setError(d.error || 'Erreur lors de la suppression')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setDeleting(false)
    }
  }

  async function runTest() {
    if (!testQuery.trim()) return
    setTestLoading(true)
    setTestResults(null)
    setTestError(null)
    try {
      const res = await fetch('/api/parse-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testQuery }),
      })
      const data = await res.json() as { items?: TestItem[]; error?: string }
      if (!res.ok || data.error) throw new Error(data.error || `Erreur HTTP ${res.status}`)
      setTestResults(data.items || [])
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setTestLoading(false)
    }
  }

  async function copyTestResult(item: TestItem, idx: number) {
    const text = item.debug
      ? formatDiagnosticForCopy(item.debug)
      : `Demandé : ${item.requestedName}\nMatch : ${item.matched?.name || 'aucun'}\nConfiance : ${Math.round(item.confidence * 100)}%`
    await navigator.clipboard.writeText(text)
    setTestCopiedIdx(idx)
    window.setTimeout(() => setTestCopiedIdx(null), 1500)
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Logs</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Journal des corrections faites dans le back office ou dans le chat. Chaque entrée conserve le diagnostic IA, le choix proposé et la correction retenue.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTestOpen(o => !o)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${testOpen ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}
          >
            Tester le matching
          </button>
          <button
            onClick={() => void load()}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-300"
          >
            Rafraîchir
          </button>
        </div>
      </div>

      {/* ── Test panel ── */}
      {testOpen && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-900">Test de matching — saisir une ligne de matériel</p>
          <div className="flex gap-2">
            <textarea
              value={testQuery}
              onChange={e => setTestQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void runTest() }}
              placeholder={"Ex : Sony FX6 pack essentiel\nObjectif 24-70 Canon\nSupport de fond photo"}
              rows={3}
              className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none"
            />
            <button
              onClick={() => void runTest()}
              disabled={testLoading || !testQuery.trim()}
              className="self-start rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {testLoading ? 'En cours…' : 'Lancer'}
            </button>
          </div>
          <p className="text-xs text-blue-600">Raccourci : ⌘+Entrée. Ce test n&apos;enregistre rien.</p>

          {testError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{testError}</div>
          )}

          {testResults && (
            <div className="space-y-3">
              {testResults.length === 0 ? (
                <p className="text-sm text-blue-700">Aucun produit extrait de cette demande.</p>
              ) : testResults.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-blue-100 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.requestedName}</p>
                      <p className={`mt-0.5 text-xs font-medium ${item.matched ? 'text-emerald-700' : 'text-red-600'}`}>
                        {item.matched ? `→ ${item.matched.name} (${Math.round(item.confidence * 100)}%)` : '→ Aucun match'}
                      </p>
                      {item.reason && <p className="mt-0.5 text-xs text-gray-500">{item.reason}</p>}
                    </div>
                    <button
                      onClick={() => void copyTestResult(item, idx)}
                      className="shrink-0 rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700"
                    >
                      {testCopiedIdx === idx ? 'Copié' : 'Copier log'}
                    </button>
                  </div>
                  {item.debug && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-950 p-2 text-[10px] leading-relaxed text-gray-200">
                      {formatDiagnosticForCopy(item.debug)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Filtres ── */}
      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-[1fr_180px_220px]">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher : FX3, 16-35, produit corrigé…"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
        />
        <select value={source} onChange={e => setSource(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900">
          <option value="">Toutes les sources</option>
          {sources.map(v => <option key={v} value={v}>{labelFor(SOURCE_LABELS, v)}</option>)}
          {sources.length === 0 && <>
            <option value="backoffice_quote">Back office</option>
            <option value="chat_widget">Chat widget</option>
          </>}
        </select>
        <select value={correctionType} onChange={e => setCorrectionType(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900">
          <option value="">Tous les types</option>
          {correctionTypes.map(v => <option key={v} value={v}>{labelFor(TYPE_LABELS, v)}</option>)}
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Barre de suppression ── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">{selectedIds.size} entrée{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}</p>
          <div className="flex gap-2">
            <button onClick={() => setSelectedIds(new Set())}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:border-red-300">
              Désélectionner
            </button>
            <button onClick={() => void deleteSelected()} disabled={deleting}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {deleting ? 'Suppression…' : `Supprimer (${selectedIds.size})`}
            </button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                  className="rounded border-gray-300 cursor-pointer" />
              </th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Demande</th>
              <th className="px-4 py-3">Choix IA</th>
              <th className="px-4 py-3">Correction</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Chargement…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Aucune correction enregistrée pour l&apos;instant.</td></tr>
            ) : rows.map(row => {
              const percent = confidencePercent(row.ai_confidence)
              const expanded = expandedId === row.id
              const selected = selectedIds.has(row.id)
              return (
                <tr key={row.id} className={`align-top ${selected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected} onChange={() => toggleSelect(row.id)}
                      className="rounded border-gray-300 cursor-pointer" />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{row.requested_text || '—'}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{[row.section, row.search_query].filter(Boolean).join(' · ')}</p>
                    {row.request_context && (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500">{row.request_context}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-700">{row.ai_selected_product_name || 'Aucun choix'}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {[labelFor({}, row.ai_selected_by), percent != null ? `${percent}%` : null].filter(Boolean).join(' · ')}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{row.corrected_product_name || 'Intervention Filme / suppression'}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{labelFor(SOURCE_LABELS, row.source)}</p>
                  </td>
                  <td className="px-4 py-3"><CorrectionBadge type={row.correction_type} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setExpandedId(expanded ? null : row.id)}
                        className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-gray-300">
                        {expanded ? 'Masquer' : 'Détail'}
                      </button>
                      <button type="button" onClick={() => void copy(row)}
                        className="rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700">
                        {copiedId === row.id ? 'Copié' : 'Copier'}
                      </button>
                    </div>
                    {expanded && (
                      <div className="mt-3 text-left">
                        <pre className="max-h-96 overflow-auto rounded-lg bg-gray-950 p-3 text-[11px] leading-relaxed text-gray-100">
                          {buildCopyText(row)}
                        </pre>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
