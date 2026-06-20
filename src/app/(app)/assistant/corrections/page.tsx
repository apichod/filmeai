'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

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
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
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
  const lines = [
    'CORRECTION CATALOGUE FILMEAI',
    '',
    `Date : ${formatDate(row.created_at)}`,
    `Source : ${labelFor(SOURCE_LABELS, row.source)}`,
    `Type : ${labelFor(TYPE_LABELS, row.correction_type)}`,
    '',
    row.request_context ? 'CONTEXTE GLOBAL REÇU' : null,
    row.request_context || null,
    row.request_context ? '' : null,
    `Demandé : ${row.requested_text || '—'}`,
    row.matching_raw ? `Terme matching : ${row.matching_raw}` : null,
    row.search_query ? `Query : ${row.search_query}` : null,
    row.section ? `Section : ${row.section}` : null,
    `Quantité : ${row.quantity || 1}`,
    '',
    `Choix IA : ${row.ai_selected_product_name || 'aucun'}`,
    row.ai_selected_by ? `Moteur : ${row.ai_selected_by}` : null,
    confidencePercent(row.ai_confidence) != null ? `Confiance : ${confidencePercent(row.ai_confidence)}%` : null,
    row.ai_reason ? `Raison : ${row.ai_reason}` : null,
    '',
    `Correction : ${row.corrected_product_name || 'aucune / intervention Filme'}`,
    '',
    'DIAGNOSTIC JSON',
    stringifyJson(row.diagnostic),
  ].filter((line): line is string => line !== null)

  return lines.join('\n')
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
  const [rows, setRows] = useState<CatalogCorrection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState('')
  const [correctionType, setCorrectionType] = useState('')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [source, correctionType, query])

  useEffect(() => { void load() }, [load])

  const sources = useMemo(() => Array.from(new Set(rows.map(row => row.source))).sort(), [rows])
  const correctionTypes = useMemo(() => Array.from(new Set(rows.map(row => row.correction_type))).sort(), [rows])

  async function copy(row: CatalogCorrection) {
    await navigator.clipboard.writeText(buildCopyText(row))
    setCopiedId(row.id)
    window.setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Corrections IA</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Journal des corrections faites dans le back office ou dans le chat. Chaque entrée conserve le diagnostic IA, le choix proposé et la correction retenue.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-300"
        >
          Rafraîchir
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-[1fr_180px_220px]">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher : FX3, 16-35, produit corrigé…"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
        />
        <select
          value={source}
          onChange={e => setSource(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900"
        >
          <option value="">Toutes les sources</option>
          {sources.map(value => <option key={value} value={value}>{labelFor(SOURCE_LABELS, value)}</option>)}
          {sources.length === 0 && (
            <>
              <option value="backoffice_quote">Back office</option>
              <option value="chat_widget">Chat widget</option>
            </>
          )}
        </select>
        <select
          value={correctionType}
          onChange={e => setCorrectionType(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900"
        >
          <option value="">Tous les types</option>
          {correctionTypes.map(value => <option key={value} value={value}>{labelFor(TYPE_LABELS, value)}</option>)}
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
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
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Chargement…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Aucune correction enregistrée pour l’instant.</td></tr>
            ) : rows.map(row => {
              const percent = confidencePercent(row.ai_confidence)
              const expanded = expandedId === row.id
              return (
                <tr key={row.id} className="align-top hover:bg-gray-50/60">
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
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : row.id)}
                        className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-gray-300"
                      >
                        {expanded ? 'Masquer' : 'Détail'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copy(row)}
                        className="rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700"
                      >
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
