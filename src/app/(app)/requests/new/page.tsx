'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type CustomerType = 'person' | 'company'

type BooqableCustomer = {
  id: string
  name: string
  email: string | null
  phone: string | null
  customerType?: CustomerType
  addressLine1?: string | null
  addressLine2?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
}

type Product = {
  id: string
  name: string
  price_per_day: number | null
  deposit?: number | null
  description?: string | null
}

type MatchDebug = {
  requestContext?: string | null
  requestedName: string
  searchQuery: string
  matchingRaw?: string
  section?: string | null
  quantity: number
  query?: {
    requestedFromPrompt: string
    queryFromPrompt: string
    finalRequested: string
    finalQuery: string
    changed: boolean
    influences: Array<{
      source: string
      label: string
      detail: string
    }>
  }
  selectedBy: 'signal' | 'pack_rule' | 'rerank' | 'deterministic' | null
  decisionPriority?: string[]
  decisionCandidates?: {
    signal?: { id: string; name: string } | null
    packRule?: { id: string; name: string; score?: number } | null
    rerank?: { id: string; name: string; confidence?: number | null } | null
    deterministic?: { id: string; name: string; score?: number } | null
  }
  finalChoice: { id: string; name: string } | null
  signals: Array<{
    id?: string | null
    term: string
    normalizedTerm?: string | null
    productId?: string | null
    productName: string
    source?: string | null
    confidence?: number | null
    occurrences?: number | null
    instructionOnly?: boolean
  }>
  rerank: { productId: string | null; confidence: number; reason?: string | null } | null
  deterministic: { productId: string; productName: string; score: number } | null
  preferredPack: { productId: string; productName: string; score: number } | null
  search?: {
    signalResults: number
    directResults: number
    semanticExpandedResults: number
    semanticRawResults: number
    candidatesBeforeFilter: number
    candidatesAfterFilter: number
    removedUnsafe: number
    removedWeak: number
  } | null
  candidates: Array<{
    id: string
    name: string
    similarity?: number | null
    deterministicScore: number
    signalMatch: boolean
    unsafe: boolean
    unsafeReasons: string[]
    selected: boolean
    rerankChoice: boolean
  }>
}

type QuoteItem = {
  uid: string
  type: 'product' | 'custom_charge' | 'section'
  product?: Product
  quantity: number
  requestedName: string
  title?: string
  section?: string | null
  confidence?: number
  reason?: string | null
  debug?: MatchDebug
}

type ParsedItem = {
  requestedName: string
  searchQuery?: string
  section?: string | null
  matched: Product | null
  quantity?: number
  confidence?: number
  reason?: string | null
  debug?: MatchDebug
}

type Step = 'client' | 'quote'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function tomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}
function daysBetween(a: string, b: string) {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000))
}
function matchPercent(confidence?: number | null) {
  return Math.max(0, Math.min(100, Math.round((confidence || 0) * 100)))
}
function matchColor(percent: number) {
  // 0 = rouge, 50 = jaune, 100 = vert
  return `hsl(${Math.round(percent * 1.2)} 78% 42%)`
}
function matchLabel(percent: number, type: QuoteItem['type']) {
  if (type === 'custom_charge') return 'À vérifier'
  if (percent >= 85) return 'Match fort'
  if (percent >= 70) return 'Bon match'
  if (percent >= 50) return 'Proposition à vérifier'
  return 'Match faible'
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}
function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}
function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>
  )
}
function IconDrag() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
      <circle cx="3" cy="3" r="1.5"/>
      <circle cx="9" cy="3" r="1.5"/>
      <circle cx="3" cy="8" r="1.5"/>
      <circle cx="9" cy="8" r="1.5"/>
      <circle cx="3" cy="13" r="1.5"/>
      <circle cx="9" cy="13" r="1.5"/>
    </svg>
  )
}
function Spinner({ size = 16, white = false }: { size?: number; white?: boolean }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`border-2 ${white ? 'border-white/30 border-t-white' : 'border-gray-200 border-t-gray-600'} rounded-full animate-spin flex-shrink-0`}
    />
  )
}
function MatchGauge({ confidence, type, requestedName }: { confidence?: number; type: QuoteItem['type']; requestedName?: string }) {
  if (type === 'section') return null
  const percent = matchPercent(confidence)
  const color = matchColor(percent)
  return (
    <div className="mt-1.5 flex items-center gap-2" title={`${matchLabel(percent, type)} — ${percent}%`}>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-medium tabular-nums" style={{ color }}>
        {percent}%
      </span>
      <span className="text-[11px] text-gray-400">
        {matchLabel(percent, type)}
        {requestedName && <span className="text-gray-400"> ({requestedName})</span>}
      </span>
    </div>
  )
}

function sourceLabel(source: MatchDebug['selectedBy']) {
  if (source === 'signal') return 'Signal validé'
  if (source === 'pack_rule') return 'Règle pack/kit'
  if (source === 'rerank') return 'Reranking IA'
  if (source === 'deterministic') return 'Score déterministe'
  return 'Aucun choix automatique'
}

function rootCauseSummary(debug: MatchDebug): string {
  if (debug.finalChoice) {
    if (debug.selectedBy === 'signal') return '✓ Signal appris → association directe au produit'
    if (debug.selectedBy === 'rerank') {
      const conf = debug.rerank?.confidence != null ? Math.round(debug.rerank.confidence * 100) : '?'
      return `✓ Reranking IA → confiance ${conf}%`
    }
    if (debug.selectedBy === 'deterministic') return `✓ Score déterministe → ${debug.deterministic?.score ?? '?'}`
    if (debug.selectedBy === 'pack_rule') return '✓ Règle pack/kit → priorité pack'
    return '✓ Choix automatique'
  }
  const before = debug.search?.candidatesBeforeFilter ?? 0
  const after = debug.search?.candidatesAfterFilter ?? 0
  const unsafe = debug.search?.removedUnsafe ?? 0
  if (before === 0) {
    return '✗ AUCUN CANDIDAT — la recherche vectorielle n\'a rien trouvé. Créer un signal dans /assistant/knowledge ou vérifier le nom du produit en base.'
  }
  if (after === 0 && unsafe > 0) {
    return `✗ TOUS BLOQUÉS PAR GARDE-FOUS — ${before} candidats trouvés, ${unsafe} rejetés pour incompatibilité (monture, type…).`
  }
  if (debug.rerank?.productId && debug.rerank.confidence < 0.5) {
    return `✗ CONFIANCE TROP FAIBLE — reranker a proposé un produit à ${Math.round(debug.rerank.confidence * 100)}% (seuil 50%). Améliorer le prompt ou créer un signal.`
  }
  if (after > 0) {
    return `✗ BON PRODUIT ABSENT DES CANDIDATS — ${after} candidats testés, aucun n'est le bon. Cause probable : distance sémantique trop grande entre la demande et le nom catalogue. Créer un signal.`
  }
  return `✗ Aucune correspondance (${before} candidats avant filtre)`
}

function formatDiagnosticForCopy(debug: MatchDebug, operatorProductName?: string) {
  const SEP = '─────────────────────────────────────────'
  const lines: string[] = []

  lines.push(`DIAGNOSTIC IA FILMEAI — ${debug.requestedName}`)
  lines.push(SEP)
  lines.push('')

  // ── Résultat final ────────────────────────────────────────────────────────
  lines.push('RÉSULTAT FINAL')
  lines.push(`  ${rootCauseSummary(debug)}`)
  if (operatorProductName !== undefined) {
    const changed = operatorProductName !== debug.finalChoice?.name
    lines.push(`  Choix IA        : ${debug.finalChoice?.name || 'aucun'}${debug.selectedBy ? ` (${sourceLabel(debug.selectedBy)})` : ''}`)
    lines.push(`  Choix opérateur : ${operatorProductName || 'aucun (intervention Filme)'}${changed ? ' ← MODIFIÉ' : ''}`)
  } else {
    lines.push(`  Choix IA : ${debug.finalChoice?.name || 'aucun'}${debug.selectedBy ? ` (${sourceLabel(debug.selectedBy)})` : ''}`)
  }
  if (debug.requestContext) {
    lines.push(`  Contexte : ${debug.requestContext}`)
  }
  lines.push('')

  // ── Étape 1 : Extraction ──────────────────────────────────────────────────
  lines.push('ÉTAPE 1 — EXTRACTION')
  lines.push(`  Demandé   : ${debug.requestedName}`)
  if (debug.matchingRaw && debug.matchingRaw !== debug.requestedName) {
    lines.push(`  Raw       : ${debug.matchingRaw}`)
  }
  lines.push(`  Query     : ${debug.searchQuery}`)
  if (debug.query) {
    const changed = debug.query.changed || debug.requestedName.trim() !== debug.searchQuery.trim()
    lines.push(`  Modifiée  : ${changed ? 'oui' : 'non'}`)
    if (debug.query.influences.length > 0) {
      lines.push('  Influences :')
      debug.query.influences.forEach(inf => {
        lines.push(`    · ${inf.label} : ${inf.detail}`)
      })
    } else {
      lines.push('  Influences : aucune')
    }
  }
  lines.push(`  Quantité  : ${debug.quantity}`)
  const sectionFromInfluence = debug.query?.influences?.find(i => i.source === 'section_context')?.detail?.match(/"([^"]+)"/)?.[1]
  lines.push(`  Section   : ${debug.section || sectionFromInfluence || '—'}`)
  lines.push('')

  // ── Étape 2 : Recherche catalogue ─────────────────────────────────────────
  lines.push('ÉTAPE 2 — RECHERCHE CATALOGUE')
  if (debug.search) {
    lines.push(`  Signaux appris    : ${debug.search.signalResults} résultats`)
    lines.push(`  Direct nom/texte  : ${debug.search.directResults} résultats`)
    lines.push(`  Vectoriel query   : ${debug.search.semanticExpandedResults} résultats`)
    lines.push(`  Vectoriel brut    : ${debug.search.semanticRawResults} résultats`)
    lines.push(`  Total (dédupliqué): ${debug.search.candidatesBeforeFilter} candidats`)
  } else {
    lines.push('  non disponible')
  }
  lines.push('')

  // ── Étape 3 : Filtrage / garde-fous ──────────────────────────────────────
  lines.push('ÉTAPE 3 — FILTRAGE GARDE-FOUS')
  if (debug.search) {
    const kept = debug.search.candidatesAfterFilter
    const unsafe = debug.search.removedUnsafe
    const weak = debug.search.removedWeak
    lines.push(`  Rejetés incompatibles : ${unsafe}`)
    lines.push(`  Rejetés score faible  : ${weak}`)
    lines.push(`  Candidats retenus     : ${kept}`)
    if (kept === 0) lines.push('  ⚠ Aucun candidat ne passe les filtres')
  } else {
    lines.push('  non disponible')
  }
  lines.push('')

  // ── Étape 4 : Reranking IA ────────────────────────────────────────────────
  lines.push('ÉTAPE 4 — RERANKING IA')
  if (debug.rerank) {
    if (debug.rerank.productId) {
      lines.push(`  Choix reranker    : ${debug.decisionCandidates?.rerank?.name || debug.rerank.productId}`)
      lines.push(`  Confiance         : ${Math.round(debug.rerank.confidence * 100)}%${debug.rerank.confidence < 0.5 ? ' ← sous le seuil (50%), ignoré' : ''}`)
      if (debug.rerank.reason) lines.push(`  Raison            : ${debug.rerank.reason}`)
    } else {
      lines.push('  Aucun produit sélectionné par le reranker')
    }
  } else {
    lines.push('  Reranking non exécuté (aucun candidat)')
  }
  lines.push('')

  // ── Étape 5 : Décision finale ─────────────────────────────────────────────
  lines.push('ÉTAPE 5 — DÉCISION FINALE')
  lines.push('  Ordre de priorité : signal → pack/kit → reranking → déterministe')
  lines.push(`  Signal      : ${debug.decisionCandidates?.signal?.name || 'aucun'}`)
  lines.push(`  Pack/kit    : ${debug.decisionCandidates?.packRule?.name || 'aucun'}`)
  lines.push(`  Reranking   : ${debug.decisionCandidates?.rerank?.name || 'aucun'}`)
  lines.push(`  Déterministe: ${debug.decisionCandidates?.deterministic?.name || 'aucun'}`)
  lines.push(`  → SÉLECTIONNÉ : ${debug.finalChoice?.name || 'aucun'}`)
  lines.push('')

  // ── Candidats testés ──────────────────────────────────────────────────────
  lines.push('CANDIDATS TESTÉS')
  if (debug.candidates.length === 0) {
    lines.push('  aucun')
  } else {
    debug.candidates.forEach((c, i) => {
      const flags = [
        c.selected ? '✓ SÉLECTIONNÉ' : null,
        c.rerankChoice ? 'choix reranker' : null,
        c.signalMatch ? 'signal' : null,
        c.unsafe ? `rejeté (${c.unsafeReasons.join(', ')})` : null,
      ].filter(Boolean).join(' · ')
      lines.push(`  ${i + 1}. ${c.name}`)
      lines.push(`     score=${c.deterministicScore} | sim=${c.similarity != null ? Math.round(c.similarity * 100) + '%' : 'n/a'}${flags ? ` | ${flags}` : ''}`)
    })
  }
  lines.push('')

  // ── JSON brut ─────────────────────────────────────────────────────────────
  lines.push('JSON DEBUG')
  lines.push(JSON.stringify(debug, null, 2))

  return lines.join('\n')
}

function MatchDiagnosticPanel({ debug, operatorProduct }: { debug: MatchDebug; operatorProduct?: Product | null }) {
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
                    {signal.id && !deleted ? (
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

// ── Product search dropdown ───────────────────────────────────────────────────

function ProductSearchDropdown({
  placeholder,
  onSelect,
  autoFocus = false,
}: {
  placeholder: string
  onSelect: (p: Product) => void
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const timeout = useRef<NodeJS.Timeout | null>(null)

  function handleChange(q: string) {
    setQuery(q)
    if (timeout.current) clearTimeout(timeout.current)
    if (q.trim().length < 2) { setResults([]); return }
    timeout.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/catalog-search?q=${encodeURIComponent(q.trim())}`)
        setResults(await res.json())
      } finally {
        setLoading(false)
      }
    }, 280)
  }

  function select(p: Product) {
    setQuery('')
    setResults([])
    onSelect(p)
  }

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <span className="absolute left-2.5 text-gray-400 pointer-events-none"><IconSearch /></span>
        <input
          type="text"
          autoFocus={autoFocus}
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-gray-800"
        />
        {loading && <span className="absolute right-2.5"><Spinner size={14} /></span>}
      </div>
      {results.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-52 overflow-y-auto">
          {results.map(p => (
            <button
              key={p.id}
              onMouseDown={() => select(p)}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900">{p.name}</span>
              {p.price_per_day != null && (
                <span className="text-xs text-gray-400 ml-2">{p.price_per_day}€/j</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NewRequestPage() {
  const router = useRouter()

  // ── Step
  const [step, setStep] = useState<Step>('client')

  // ── Client
  const [clientType, setClientType] = useState<CustomerType>('person')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientAddressLine1, setClientAddressLine1] = useState('')
  const [clientAddressLine2, setClientAddressLine2] = useState('')
  const [clientPostalCode, setClientPostalCode] = useState('')
  const [clientCity, setClientCity] = useState('')
  const [clientCountry, setClientCountry] = useState('FR')
  const [clientBooqableId, setClientBooqableId] = useState<string | null>(null)

  // ── Customer search
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<BooqableCustomer[]>([])
  const [customerSearching, setCustomerSearching] = useState(false)
  const customerTimeout = useRef<NodeJS.Timeout | null>(null)

  // ── Chat / parse
  const [message, setMessage] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseProgress, setParseProgress] = useState(0)
  const [parseStatus, setParseStatus] = useState('')
  const [chatHistory, setChatHistory] = useState<{ text: string; added: number; custom: number }[]>([])

  // ── Resizable assistant column
  const [assistantWidth, setAssistantWidth] = useState(() => {
    if (typeof window === 'undefined') return 560
    const saved = Number(window.localStorage.getItem('filmeai-request-assistant-width'))
    return Number.isFinite(saved) && saved >= 360 && saved <= 900 ? saved : 560
  })

  function startAssistantResize(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = assistantWidth

    function onMove(ev: MouseEvent) {
      const next = Math.min(900, Math.max(360, startWidth + ev.clientX - startX))
      setAssistantWidth(next)
      window.localStorage.setItem('filmeai-request-assistant-width', String(Math.round(next)))
    }

    function onUp() {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Quote items
  const [items, setItems] = useState<QuoteItem[]>([])

  // ── Dates
  const [startsAt, setStartsAt] = useState(todayStr())
  const [stopsAt, setStopsAt] = useState(tomorrowStr())

  // ── Edit item
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [debugUid, setDebugUid] = useState<string | null>(null)

  // ── Drag & drop
  const dragItem = useRef<number | null>(null)

  // ── Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Customer search
  function handleCustomerSearch(q: string) {
    setCustomerQuery(q)
    if (customerTimeout.current) clearTimeout(customerTimeout.current)
    if (q.trim().length < 2) { setCustomerResults([]); return }
    customerTimeout.current = setTimeout(async () => {
      setCustomerSearching(true)
      try {
        const res = await fetch(`/api/customer-search?q=${encodeURIComponent(q.trim())}`)
        setCustomerResults(await res.json())
      } finally {
        setCustomerSearching(false)
      }
    }, 280)
  }

  function clearSelectedCustomer() {
    setClientBooqableId(null)
    setClientType('person')
    setClientName('')
    setClientEmail('')
    setClientPhone('')
    setClientAddressLine1('')
    setClientAddressLine2('')
    setClientPostalCode('')
    setClientCity('')
    setClientCountry('FR')
  }

  function selectExistingCustomer(c: BooqableCustomer) {
    setClientType(c.customerType || 'person')
    setClientName(c.name)
    setClientEmail(c.email || '')
    setClientPhone(c.phone || '')
    setClientAddressLine1(c.addressLine1 || '')
    setClientAddressLine2(c.addressLine2 || '')
    setClientPostalCode(c.postalCode || '')
    setClientCity(c.city || '')
    setClientCountry(c.country || 'FR')
    setClientBooqableId(c.id)
    setCustomerQuery('')
    setCustomerResults([])
  }

  // ── Step 1 submit
  function handleClientSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientName.trim()) return
    setStep('quote')
  }

  // ── Parse message → products in order
  async function handleSend() {
    const text = message.trim()
    if (!text || parsing) return
    setMessage('')
    setParsing(true)
    setParseProgress(8)
    setParseStatus('Lecture de la demande…')

    const progressSteps = [
      { at: 24, label: 'Extraction des lignes et quantités…' },
      { at: 42, label: 'Recherche dans le catalogue Filme…' },
      { at: 64, label: 'Comparaison des correspondances…' },
      { at: 82, label: 'Préparation du devis…' },
    ]
    let stepIndex = 0
    let ticks = 0
    const progressTimer = window.setInterval(() => {
      ticks += 1
      setParseProgress(prev => {
        const target = progressSteps[Math.min(stepIndex, progressSteps.length - 1)]
        if (prev >= target.at && stepIndex < progressSteps.length - 1) stepIndex += 1
        const current = progressSteps[Math.min(stepIndex, progressSteps.length - 1)]
        setParseStatus(ticks > 18
          ? 'Grosse liste : je termine les derniers matchs…'
          : current.label
        )
        return Math.min(92, prev + (prev < current.at ? 3 : 1))
      })
    }, 700)

    try {
      const res = await fetch('/api/parse-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json() as {
        items?: ParsedItem[]
        error?: string
      }

      setParseProgress(96)
      setParseStatus('Ajout des lignes au devis…')

      const parsedItems = data.items || []
      let added = 0
      let custom = 0
      let currentSection = [...items].reverse().find(item => item.type === 'section')?.title || null

      for (let index = 0; index < parsedItems.length; index += 1) {
        const parsed = parsedItems[index]
        const section = parsed.section?.trim() || null
        setParseProgress(Math.min(99, 86 + Math.round(((index + 1) / Math.max(1, parsedItems.length)) * 13)))
        setParseStatus(`Ajout ${index + 1}/${parsedItems.length} au devis…`)

        const rowsToAdd: QuoteItem[] = []
        if (section && section !== currentSection) {
          rowsToAdd.push({
            uid: crypto.randomUUID(),
            type: 'section',
            title: section,
            quantity: 1,
            requestedName: section,
            section,
          })
          currentSection = section
        }

        if (parsed.matched) {
          rowsToAdd.push({
            uid: crypto.randomUUID(),
            type: 'product',
            product: parsed.matched,
            quantity: Math.max(1, parsed.quantity || 1),
            requestedName: parsed.requestedName,
            section,
            confidence: parsed.confidence,
            reason: parsed.reason,
            debug: parsed.debug,
          })
        } else {
          rowsToAdd.push({
            uid: crypto.randomUUID(),
            type: 'custom_charge',
            title: parsed.requestedName || parsed.searchQuery || 'Produit à vérifier',
            quantity: Math.max(1, parsed.quantity || 1),
            requestedName: parsed.requestedName || parsed.searchQuery || 'Produit à vérifier',
            section,
            confidence: parsed.confidence || 0,
            reason: parsed.reason || 'Correspondance catalogue incertaine',
            debug: parsed.debug,
          })
        }

        setItems(prev => [...prev, ...rowsToAdd])

        if (parsed.matched) {
          added += 1
        } else {
          custom += 1
          added += 1
        }

        await new Promise(resolve => window.setTimeout(resolve, parsedItems.length > 15 ? 45 : 80))
      }

      setChatHistory(prev => [...prev, { text, added, custom }])
    } catch {
      setChatHistory(prev => [...prev, { text, added: 0, custom: 0 }])
    } finally {
      window.clearInterval(progressTimer)
      setParseProgress(100)
      setParseStatus('Terminé')
      window.setTimeout(() => {
        setParsing(false)
        setParseProgress(0)
        setParseStatus('')
      }, 450)
    }
  }

  // ── Item operations
  function setQuantity(uid: string, delta: number) {
    setItems(prev => prev.map(item =>
      item.uid === uid ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ))
  }
  function removeItem(uid: string) {
    const previous = items.find(item => item.uid === uid)
    if (previous && previous.type !== 'section') {
      logCatalogCorrection(previous, 'delete_line', null)
    }
    setItems(prev => prev.filter(item => item.uid !== uid))
    if (editingUid === uid) setEditingUid(null)
  }
  function recordCatalogSignal(term: string, product: Product) {
    const cleanTerm = term.trim()
    if (!cleanTerm || cleanTerm.toLowerCase() === product.name.toLowerCase()) return

    void fetch('/api/catalog-signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: cleanTerm,
        productId: product.id,
        productName: product.name,
        source: 'requests_new_manual',
      }),
    }).catch(() => {})
  }
  function logCatalogCorrection(
    item: QuoteItem,
    correctionType: string,
    correctedProduct?: Product | null,
    metadata?: Record<string, unknown>
  ) {
    if (item.type === 'section') return
    const debug = item.debug || null

    void fetch('/api/catalog-corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'backoffice_quote',
        correctionType,
        quoteItemUid: item.uid,
        requestedText: item.requestedName || item.title || null,
        requestContext: debug?.requestContext || null,
        matchingRaw: debug?.matchingRaw || null,
        searchQuery: debug?.searchQuery || null,
        section: item.section || debug?.section || null,
        quantity: item.quantity,
        aiSelectedProductId: debug?.finalChoice?.id || item.product?.id || null,
        aiSelectedProductName: debug?.finalChoice?.name || item.product?.name || item.title || null,
        aiConfidence: item.confidence ?? null,
        aiSelectedBy: debug?.selectedBy || null,
        aiReason: item.reason || debug?.rerank?.reason || null,
        correctedProductId: correctedProduct?.id || null,
        correctedProductName: correctedProduct?.name || null,
        diagnostic: debug,
        candidates: debug?.candidates || null,
        metadata: metadata || {},
      }),
    }).catch(() => {})
  }
  function replaceProduct(uid: string, product: Product) {
    const previous = items.find(item => item.uid === uid)
    if (previous) {
      recordCatalogSignal(previous.requestedName || previous.title || product.name, product)
      logCatalogCorrection(previous, 'replace_product', product, {
        previousType: previous.type,
        previousProductId: previous.product?.id || null,
        previousProductName: previous.product?.name || previous.title || null,
      })
    }

    setItems(prev => prev.map(item => item.uid === uid ? {
      ...item,
      type: 'product',
      product,
      title: undefined,
      requestedName: item.requestedName || product.name,
    } : item))
    setEditingUid(null)
  }
  function renameCustomLine(uid: string, title: string) {
    setItems(prev => prev.map(item => item.uid === uid ? {
      ...item,
      title,
      requestedName: title,
    } : item))
  }
  function addProduct(product: Product) {
    setItems(prev => [...prev, {
      uid: crypto.randomUUID(),
      type: 'product',
      product,
      quantity: 1,
      requestedName: product.name,
    }])
  }

  // ── Drag & drop (reorder)
  function onDragStart(index: number) {
    dragItem.current = index
  }
  function onDragEnter(index: number) {
    if (dragItem.current === null || dragItem.current === index) return
    setItems(prev => {
      const next = [...prev]
      const [dragged] = next.splice(dragItem.current!, 1)
      next.splice(index, 0, dragged)
      dragItem.current = index
      return next
    })
  }
  function onDragEnd() {
    dragItem.current = null
  }

  // ── Submit quote
  async function handleSubmit() {
    const quoteLines = items.filter(item => item.type !== 'section' || item.title?.trim())
    const billableLines = quoteLines.filter(item => item.type !== 'section')
    if (billableLines.length === 0 || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/save-quote-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            type: clientType,
            name: clientName,
            email: clientEmail || undefined,
            phone: clientPhone || undefined,
            addressLine1: clientAddressLine1 || undefined,
            addressLine2: clientAddressLine2 || undefined,
            postalCode: clientPostalCode || undefined,
            city: clientCity || undefined,
            country: clientCountry || undefined,
            booqableId: clientBooqableId || undefined,
          },
          items: quoteLines.map((i, index) => ({
            type: i.type,
            productId: i.type === 'product' ? i.product?.id : undefined,
            quantity: i.type === 'section' ? 1 : i.quantity,
            name: i.type === 'product' ? i.product?.name : i.title || i.requestedName,
            title: i.type === 'section' ? i.title : undefined,
            requestedName: i.requestedName,
            section: i.section || null,
            unitPrice: i.type === 'product' ? i.product?.price_per_day || 0 : 0,
            deposit: i.type === 'product' ? i.product?.deposit || 0 : 0,
            position: index + 1,
          })),
          startsAt: new Date(startsAt + 'T09:00:00').toISOString(),
          stopsAt: new Date(stopsAt + 'T18:00:00').toISOString(),
        }),
      })
      const data = await res.json() as { conversationId?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error || `Erreur HTTP ${res.status}`)
      if (data.conversationId) {
        router.push('/requests/' + data.conversationId + '?autoEdit=1')
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde du devis')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Total
  const totalPerDay = items.reduce((acc, item) =>
    acc + (item.type === 'product' ? (item.product?.price_per_day || 0) * item.quantity : 0), 0
  )
  const billableItemCount = items.filter(item => item.type !== 'section').length
  const days = daysBetween(startsAt, stopsAt)

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1: Client info
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 'client') {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Nouvelle demande</h1>
            <p className="text-sm text-gray-500 mt-0.5">Construisez un devis avec votre client et poussez-le dans Booqable.</p>
          </div>
          <button
            onClick={() => router.push('/requests')}
            className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
          >
            ← Retour
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <span>👤</span> Client
          </h2>
          <p className="text-xs text-gray-500 mb-5">
            Choisissez un client existant (vos contacts Booqable) ou renseignez un nouveau client.
          </p>

          {/* Existing customer search */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">Client existant</label>
            <div className="relative">
              <div className="relative flex items-center">
                <span className="absolute left-2.5 text-gray-400 pointer-events-none"><IconSearch /></span>
                <input
                  type="text"
                  value={customerQuery}
                  onChange={e => handleCustomerSearch(e.target.value)}
                  placeholder="Rechercher par nom, email, téléphone…"
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-gray-800"
                />
                {customerSearching && <span className="absolute right-2.5"><Spinner size={14} /></span>}
              </div>
              {customerResults.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
                  {customerResults.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => selectExistingCustomer(c)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-400">
                        {[c.customerType === 'company' ? 'Société' : 'Particulier', c.email, c.phone].filter(Boolean).join(' · ')}
                      </p>
                      {(c.addressLine1 || c.city) && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {[c.addressLine1, c.postalCode, c.city].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                ou nouveau client
              </span>
            </div>
          </div>

          {/* New client form */}
          <form onSubmit={handleClientSubmit} className="space-y-3">
            {clientBooqableId && (
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                <span>✓ Client Booqable sélectionné : <strong>{clientName}</strong></span>
                <button
                  type="button"
                  onClick={clearSelectedCustomer}
                  className="text-gray-400 hover:text-gray-700"
                >
                  ×
                </button>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type de client</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setClientType('person'); setClientBooqableId(null) }}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${clientType === 'person' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                >
                  Particulier
                </button>
                <button
                  type="button"
                  onClick={() => { setClientType('company'); setClientBooqableId(null) }}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${clientType === 'company' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                >
                  Société
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nom {clientType === 'company' ? 'société / contact' : 'client'} *</label>
              <input
                type="text"
                placeholder="Nom du client"
                value={clientName}
                onChange={e => { setClientName(e.target.value); setClientBooqableId(null) }}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                placeholder="client@exemple.fr"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone</label>
              <input
                type="tel"
                placeholder="06 12 34 56 78"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Adresse</label>
              <input
                type="text"
                placeholder="Adresse"
                value={clientAddressLine1}
                onChange={e => setClientAddressLine1(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-800"
              />
            </div>
            <div>
              <input
                type="text"
                placeholder="Complément d’adresse"
                value={clientAddressLine2}
                onChange={e => setClientAddressLine2(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-800"
              />
            </div>
            <div className="grid grid-cols-[120px_1fr_80px] gap-2">
              <input
                type="text"
                placeholder="CP"
                value={clientPostalCode}
                onChange={e => setClientPostalCode(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-800"
              />
              <input
                type="text"
                placeholder="Ville"
                value={clientCity}
                onChange={e => setClientCity(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-800"
              />
              <input
                type="text"
                placeholder="Pays"
                value={clientCountry}
                onChange={e => setClientCountry(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:border-gray-800"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors mt-1"
            >
              Démarrer le devis →
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2: Split view
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 96px)' }}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Nouvelle demande</h1>
          <p className="text-sm text-gray-500 mt-0.5">Devis pour {clientName}</p>
        </div>
        <button
          onClick={() => router.push('/requests')}
          className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
        >
          ← Retour aux demandes
        </button>
      </div>

      {/* Split view */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT: Assistant ─────────────────────────────────────────────── */}
        <div
          className="min-w-[360px] max-w-[900px] flex-shrink-0 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col min-h-0"
          style={{ width: assistantWidth }}
        >
          <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <p className="text-sm font-semibold text-gray-900">Assistant</p>
            <p className="text-xs text-gray-400">Devis pour {clientName}</p>
          </div>

          {/* Chat history */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatHistory.length === 0 && !parsing && (
              <p className="text-sm text-gray-400 text-center mt-8 leading-relaxed">
                Collez la demande reçue (matériel, dates) :<br />
                je remplis le devis à droite.
              </p>
            )}
            {chatHistory.map((entry, i) => (
              <div key={i} className="space-y-1.5">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="max-w-[80%] bg-gray-900 text-white rounded-2xl rounded-br-sm px-3 py-2 text-sm whitespace-pre-wrap break-words">
                    {entry.text}
                  </div>
                </div>
                {/* Bot response */}
                <div className="flex justify-start">
                  <div className="max-w-[80%] bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
                    {entry.added === 0
                      ? "Aucun produit trouvé dans le catalogue. Précisez le nom du matériel."
                      : (
                        <>
                          ✓ {entry.added} ligne{entry.added > 1 ? 's' : ''} ajoutée{entry.added > 1 ? 's' : ''} au devis.
                          {entry.custom > 0 && (
                            <span className="block text-amber-700 mt-1">
                              {entry.custom} ligne{entry.custom > 1 ? 's' : ''} à vérifier créée{entry.custom > 1 ? 's' : ''} en charge custom.
                            </span>
                          )}
                        </>
                      )
                    }
                  </div>
                </div>
              </div>
            ))}
            {parsing && (
              <div className="flex justify-start">
                <div className="w-[min(80%,360px)] bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <Spinner size={14} />
                    <span className="text-sm text-gray-600">{parseStatus || 'Analyse en cours…'}</span>
                    <span className="ml-auto text-xs font-medium text-gray-400 tabular-nums">{parseProgress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-gray-900 transition-all duration-500"
                      style={{ width: `${parseProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-gray-400">
                    Je garde l’ordre de la liste et je vérifie le catalogue ligne par ligne.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3 flex-shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Écrivez un message…"
                rows={2}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-gray-800"
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || parsing}
                className="bg-gray-900 text-white rounded-xl px-3 py-2 flex items-center justify-center hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">Entrée = nouvelle ligne · ⌘/Ctrl + Entrée = envoyer</p>
          </div>
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={startAssistantResize}
          className="w-4 flex-shrink-0 cursor-col-resize flex items-center justify-center group select-none"
          title="Redimensionner la colonne assistant"
        >
          <div className="h-16 w-1 rounded-full bg-gray-200 group-hover:bg-gray-400 transition-colors" />
        </div>

        {/* ── RIGHT: Quote panel ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-[520px] bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
            <span>📋</span>
            <p className="text-sm font-semibold text-gray-900">Devis</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Dates */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Début de location</label>
                <input
                  type="date"
                  value={startsAt}
                  onChange={e => setStartsAt(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fin de location</label>
                <input
                  type="date"
                  value={stopsAt}
                  onChange={e => setStopsAt(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-gray-800"
                />
              </div>
            </div>

            {/* Ajouter un produit manuellement */}
            <ProductSearchDropdown
              placeholder="Ajouter un produit au catalogue…"
              onSelect={addProduct}
            />

            {/* Product list */}
            <div>
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8 leading-relaxed">
                  Ajoutez des produits pour chiffrer le devis.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {items.map((item, index) => (
                    <div
                      key={item.uid}
                      draggable={editingUid !== item.uid}
                      onDragStart={() => onDragStart(index)}
                      onDragEnter={() => onDragEnter(index)}
                      onDragEnd={onDragEnd}
                      onDragOver={e => e.preventDefault()}
                    >
                      {item.type === 'section' ? (
                        <div className="flex items-center gap-2 py-2 group cursor-grab active:cursor-grabbing">
                          <span className="text-gray-300 group-hover:text-gray-400 transition-colors select-none flex-shrink-0">
                            <IconDrag />
                          </span>
                          <div className="flex-1 border-t border-gray-200" />
                          <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
                            {item.title}
                          </span>
                          <div className="flex-1 border-t border-gray-200" />
                          <button
                            onClick={() => removeItem(item.uid)}
                            className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                            title="Supprimer la section"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      ) : editingUid === item.uid ? (
                        /* ── Edit mode ── */
                        <div className="border border-gray-300 rounded-xl p-3 bg-gray-50 space-y-3">
                          {item.type === 'custom_charge' && (
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Nom de la ligne custom :</p>
                              <input
                                value={item.title || item.requestedName}
                                onChange={e => renameCustomLine(item.uid, e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-800"
                              />
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-gray-500 mb-2">
                              {item.type === 'custom_charge' ? 'Ou remplacer par un produit catalogue :' : 'Remplacer par :'}
                            </p>
                            <ProductSearchDropdown
                              placeholder="Rechercher un produit…"
                              onSelect={p => replaceProduct(item.uid, p)}
                              autoFocus
                            />
                          </div>
                          <button
                            onClick={() => setEditingUid(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Fermer
                          </button>
                        </div>
                      ) : (
                        /* ── Normal mode ── */
                        <div className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 group transition-colors cursor-grab active:cursor-grabbing active:shadow-md ${item.type === 'custom_charge' ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300' : 'border-gray-100 hover:border-gray-200 active:border-gray-300'}`}>
                          {/* Drag handle */}
                          <span className="text-gray-300 group-hover:text-gray-400 transition-colors select-none flex-shrink-0">
                            <IconDrag />
                          </span>
                          {/* Product info */}
                          <div className="flex-1 min-w-0 select-text cursor-auto">
                            <p className="text-sm font-medium text-gray-900 leading-snug">
                              {item.type === 'product' ? item.product?.name : item.title || item.requestedName}
                            </p>
                            <p className="text-xs text-gray-400">
                              {item.type === 'product'
                                ? (item.product?.price_per_day != null && item.product.price_per_day > 0 ? `${item.product.price_per_day}€/jour` : 'Prix après dates')
                                : 'Ligne custom Booqable — à vérifier'}
                            </p>
                            {item.confidence != null && (
                              <MatchGauge confidence={item.confidence} type={item.type} requestedName={item.requestedName} />
                            )}
                            {item.type === 'custom_charge' && (
                              <p className="text-[11px] font-semibold text-amber-700 mt-0.5">Intervention humaine requise</p>
                            )}
                            {item.type === 'custom_charge' && item.reason && (
                              <p className="text-[11px] text-amber-700/80 mt-0.5 line-clamp-2">{item.reason}</p>
                            )}
                            {item.debug && (
                              <button
                                type="button"
                                onClick={() => setDebugUid(debugUid === item.uid ? null : item.uid)}
                                className="mt-1 text-[11px] font-medium text-slate-400 hover:text-slate-700"
                              >
                                {debugUid === item.uid ? 'Masquer le diagnostic IA' : 'Afficher le diagnostic IA'}
                              </button>
                            )}
                          </div>
                          {/* Quantity */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => setQuantity(item.uid, -1)}
                              className="w-5 h-5 flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-medium transition-colors bg-white"
                            >
                              −
                            </button>
                            <span className="text-sm font-medium w-4 text-center tabular-nums">{item.quantity}</span>
                            <button
                              onClick={() => setQuantity(item.uid, +1)}
                              className="w-5 h-5 flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-medium transition-colors bg-white"
                            >
                              +
                            </button>
                          </div>
                          {/* Edit */}
                          <button
                            onClick={() => setEditingUid(item.uid)}
                            className="text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0"
                            title="Modifier la ligne"
                          >
                            <IconEdit />
                          </button>
                          {/* Delete */}
                          <button
                            onClick={() => removeItem(item.uid)}
                            className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                            title="Supprimer"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      )}
                      {debugUid === item.uid && item.debug && (
                        <MatchDiagnosticPanel debug={item.debug} operatorProduct={item.product ?? null} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Total */}
            {billableItemCount > 0 && (
              <div className="border-t border-gray-100 pt-3 space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{days} jour{days > 1 ? 's' : ''} × {totalPerDay}€/jour</span>
                  <span>{totalPerDay}€/j</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-gray-900">
                  <span>Total estimé</span>
                  <span>{(totalPerDay * days).toFixed(2)}€</span>
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="border-t border-gray-100 p-4 flex-shrink-0">
            <>
              {submitError && (
                <p className="text-xs text-red-500 mb-2 text-center">{submitError}</p>
              )}
              <button
                onClick={handleSubmit}
                disabled={billableItemCount === 0 || submitting}
                className="w-full bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {submitting ? (
                  <><Spinner size={16} white /> Enregistrement…</>
                ) : (
                  'Enregistrer le devis'
                )}
              </button>
            </>
          </div>
        </div>

      </div>
    </div>
  )
}
