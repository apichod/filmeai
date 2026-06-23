'use client'

import { useState } from 'react'
import { type MatchDebug, sourceLabel, rootCauseSummary, formatDiagnosticForCopy } from '@/lib/diagnostic-format'

type Product = { id: string; name: string }

interface Props {
  debug: MatchDebug
  operatorProduct?: Product | null
  /** Si true, affiche le bouton "Supprimer" sur les signaux (défaut false) */
  allowDeleteSignal?: boolean
}

export function MatchDiagnosticPanel({ debug, operatorProduct, allowDeleteSignal = false }: Props) {
  const [copied, setCopied] = useState(false)
  const [deletingSignalId, setDeletingSignalId] = useState<string | null>(null)
  const [deletedSignalIds, setDeletedSignalIds] = useState<Set<string>>(new Set())

  async function deleteSignal(id: string) {
    setDeletingSignalId(id)
    try {
      const res = await fetch(`/api/catalog-signals/${id}`, { method: 'DELETE' })
      if (res.ok) setDeletedSignalIds(prev => { const s = new Set(prev); s.add(id); return s })
    } finally {
      setDeletingSignalId(null)
    }
  }

  async function copyDiagnostic() {
    const text = formatDiagnosticForCopy(debug, operatorProduct?.name ?? undefined)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const operatorChanged = operatorProduct && operatorProduct.name !== debug.finalChoice?.name
  const rootCause = rootCauseSummary(debug)
  const success = Boolean(debug.finalChoice)

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900">Diagnostic IA</p>
          <p className={`mt-0.5 text-[11px] font-medium ${success ? 'text-emerald-700' : 'text-red-600'}`}>{rootCause}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={copyDiagnostic}
            className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-700">
            {copied ? 'Copié !' : 'Copier'}
          </button>
          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
            {sourceLabel(debug.selectedBy)}
          </span>
        </div>
      </div>

      {/* ── Sélection opérateur ── */}
      {operatorProduct && (
        <div className={`mt-2 rounded-lg p-2 ring-1 ${operatorChanged ? 'bg-amber-50 ring-amber-200' : 'bg-emerald-50 ring-emerald-200'}`}>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Sélection opérateur</p>
          <p className="mt-0.5 font-semibold text-slate-900">{operatorProduct.name}</p>
          {operatorChanged && debug.finalChoice && (
            <p className="mt-0.5 text-[11px] text-amber-700">Remplace le choix IA : {debug.finalChoice.name}</p>
          )}
        </div>
      )}

      <div className="mt-3 space-y-2">

        {/* ── Étape 1 — Extraction ── */}
        <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Étape 1 — Extraction</p>
          <div className="mt-1 space-y-0.5">
            <p className="text-slate-500">Demandé : <span className="font-medium text-slate-800">{debug.requestedName}</span></p>
            {debug.matchingRaw && debug.matchingRaw !== debug.requestedName && (
              <p className="text-slate-500">Raw : <span className="font-medium text-slate-800">{debug.matchingRaw}</span></p>
            )}
            <p className="text-slate-500">Query : <span className="font-medium text-slate-800">{debug.searchQuery}</span>
              {debug.query?.changed && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">modifiée</span>}
            </p>
          </div>
          {debug.query && debug.query.influences.length > 0 && (
            <div className="mt-2 space-y-1">
              {debug.query.influences.map((inf, i) => (
                <p key={i} className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-700">{inf.label}</span> — {inf.detail}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* ── Étape 2 — Recherche ── */}
        {debug.search && (
          <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Étape 2 — Recherche catalogue</p>
            <div className="mt-1 grid grid-cols-4 gap-x-3 gap-y-1 text-[11px]">
              <div><p className="text-slate-400">Signaux</p><p className="font-semibold text-slate-800">{debug.search.signalResults}</p></div>
              <div><p className="text-slate-400">Direct</p><p className="font-semibold text-slate-800">{debug.search.directResults}</p></div>
              <div><p className="text-slate-400">Vectoriel query</p><p className="font-semibold text-slate-800">{debug.search.semanticExpandedResults}</p></div>
              <div><p className="text-slate-400">Vectoriel brut</p><p className="font-semibold text-slate-800">{debug.search.semanticRawResults}</p></div>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">Total dédupliqué : <span className="font-semibold text-slate-800">{debug.search.candidatesBeforeFilter}</span></p>
          </div>
        )}

        {/* ── Étape 3 — Filtrage ── */}
        {debug.search && (
          <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Étape 3 — Filtrage garde-fous</p>
            <div className="mt-1 grid grid-cols-3 gap-x-3 text-[11px]">
              <div><p className="text-slate-400">Incompatibles</p><p className={`font-semibold ${debug.search.removedUnsafe > 0 ? 'text-red-600' : 'text-slate-800'}`}>{debug.search.removedUnsafe}</p></div>
              <div><p className="text-slate-400">Score faible</p><p className={`font-semibold ${debug.search.removedWeak > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{debug.search.removedWeak}</p></div>
              <div><p className="text-slate-400">Retenus</p><p className={`font-semibold ${debug.search.candidatesAfterFilter === 0 ? 'text-red-600' : 'text-emerald-700'}`}>{debug.search.candidatesAfterFilter}</p></div>
            </div>
          </div>
        )}

        {/* ── Étape 4 — Reranking ── */}
        <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Étape 4 — Reranking IA</p>
          <div className="mt-1 text-[11px]">
            {debug.rerank?.productId ? (
              <>
                <p className="text-slate-500">Produit : <span className="font-medium text-slate-800">{debug.decisionCandidates?.rerank?.name || debug.rerank.productId}</span></p>
                <p className="text-slate-500">Confiance : <span className={`font-semibold ${debug.rerank.confidence < 0.5 ? 'text-red-600' : 'text-emerald-700'}`}>{Math.round(debug.rerank.confidence * 100)}%</span>
                  {debug.rerank.confidence < 0.5 && <span className="ml-1 text-red-500">(sous le seuil 50% → ignoré)</span>}
                </p>
                {debug.rerank.reason && <p className="text-slate-500">Raison : <span className="font-medium text-slate-700">{debug.rerank.reason}</span></p>}
              </>
            ) : (
              <p className="text-slate-400">Aucun produit sélectionné</p>
            )}
          </div>
        </div>

        {/* ── Étape 5 — Décision finale ── */}
        <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Étape 5 — Décision finale</p>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] md:grid-cols-4">
            {(['signal', 'packRule', 'rerank', 'deterministic'] as const).map(key => {
              const labels: Record<string, string> = { signal: 'Signal', packRule: 'Pack/kit', rerank: 'Reranking', deterministic: 'Déterministe' }
              const val = debug.decisionCandidates?.[key]
              return (
                <div key={key}>
                  <p className="text-slate-400">{labels[key]}</p>
                  <p className={`font-medium ${val ? 'text-slate-800' : 'text-slate-300'}`}>{val?.name || '—'}</p>
                </div>
              )
            })}
          </div>
          <div className={`mt-2 rounded px-2 py-1 text-[11px] font-semibold ${success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
            → {debug.finalChoice?.name || 'Aucun produit sélectionné'}
          </div>
        </div>

        {/* ── Signaux utilisés ── */}
        <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Signaux utilisés</p>
          {debug.signals.length === 0 ? (
            <p className="mt-1 text-slate-400">Aucun</p>
          ) : (
            <div className="mt-1 space-y-1">
              {debug.signals.slice(0, 6).map((signal, i) => {
                const deleted = signal.id ? deletedSignalIds.has(signal.id) : false
                return (
                  <div key={i} className={`flex items-start justify-between gap-2 rounded px-2 py-1 ${deleted ? 'opacity-40 bg-red-50' : 'bg-slate-50'}`}>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{signal.term} → {signal.productName}</p>
                      <p className="text-[11px] text-slate-400">{signal.instructionOnly ? 'Instruction' : 'Association'} · {signal.source || '?'} · {signal.occurrences ?? 0} occurrence{(signal.occurrences ?? 0) > 1 ? 's' : ''}</p>
                    </div>
                    {allowDeleteSignal && signal.id && !deleted ? (
                      <button type="button" onClick={() => void deleteSignal(signal.id!)} disabled={deletingSignalId === signal.id}
                        className="shrink-0 rounded border border-red-200 px-2 py-0.5 text-[11px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-50">
                        {deletingSignalId === signal.id ? '…' : 'Supprimer'}
                      </button>
                    ) : deleted ? (
                      <span className="shrink-0 text-[11px] text-red-400">Supprimé</span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Candidats testés ── */}
        <div className="rounded-lg bg-white ring-1 ring-slate-200">
          <p className="px-2 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Candidats testés</p>
          <div className="mt-1 max-h-52 overflow-auto divide-y divide-slate-50">
            {debug.candidates.map(c => (
              <div key={c.id} className={`px-2 py-1.5 ${c.selected ? 'bg-emerald-50' : c.unsafe ? 'bg-red-50/40' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <div className="flex shrink-0 gap-1">
                    {c.selected && <span className="rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700">✓</span>}
                    {c.rerankChoice && <span className="rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-700">rerank</span>}
                    {c.signalMatch && <span className="rounded bg-purple-100 px-1 text-[10px] font-semibold text-purple-700">signal</span>}
                    <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-600">{c.deterministicScore}</span>
                    {c.similarity != null && <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">{Math.round(c.similarity * 100)}%</span>}
                  </div>
                </div>
                {c.unsafeReasons.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-red-500">{c.unsafeReasons.join(' · ')}</p>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
