import { hydrateProductMetadata } from './search'
import { isInstructionOnlySignal, matchingSignalsForItem } from './signals'
import {
  candidateIsUnsafe,
  candidateUnsafeReasons,
  deterministicAutoSelect,
  deterministicScore,
  productLooksLikePack,
  requestWantsPack,
} from './safety'
import { MIN_RERANK_CONFIDENCE } from './types'
import type { CandidateSet, CatalogSignal, RerankSelection } from './types'

export async function buildMatchedQuoteItems(
  candidateSets: CandidateSet[],
  selections: RerankSelection[],
  approvedSignals: CatalogSignal[]
) {
const selectionByIndex = new Map(selections.map(selection => [selection.index, selection]))

const rawItems = candidateSets.map((set, index) => {
  const selection = selectionByIndex.get(index)
  const aiSelected = selection && selection.confidence >= MIN_RERANK_CONFIDENCE
    ? set.candidates.find(candidate => candidate.id === selection.product_id) || null
    : null
  const deterministic = deterministicAutoSelect(set)
  const preferredPack = requestWantsPack(set.item)
    ? set.candidates
      .map(product => ({ product, score: deterministicScore(product, set.item) }))
      .filter(({ product, score }) => productLooksLikePack(product) && score >= 0.8)
      .sort((a, b) => b.score - a.score)[0] || null
    : null
  const safeAiSelected = aiSelected && candidateIsUnsafe(aiSelected, set.item)
    ? null
    : aiSelected
  const signalSelected = set.candidates.find(candidate => candidate.signal_match && !candidateIsUnsafe(candidate, set.item)) || null
  const selected = signalSelected || preferredPack?.product || safeAiSelected || deterministic?.product || null
  const selectedBy = signalSelected
    ? 'signal'
    : preferredPack?.product
      ? 'pack_rule'
      : safeAiSelected
        ? 'rerank'
        : deterministic?.product
          ? 'deterministic'
          : null
  const confidence = signalSelected
    ? 0.96
    : preferredPack
    ? Math.min(0.95, Math.max(0.84, preferredPack.score / 2.6))
    : safeAiSelected
    ? selection?.confidence || 0.85
    : deterministic
      ? Math.min(0.95, Math.max(0.72, deterministic.score / 2.6))
      : selection?.confidence || 0
  const matchingSignals = matchingSignalsForItem(set.item, approvedSignals)
  const queryInfluences = [
    ...(set.item.queryDebug?.influences || []),
    ...matchingSignals.map(signal => ({
      source: 'frontend_signal' as const,
      label: isInstructionOnlySignal(signal) ? 'Signal front : instruction' : 'Signal front : association catalogue',
      detail: `${signal.term} → ${signal.product_name}`,
    })),
  ]
  const debugCandidates = set.candidates.slice(0, 10).map(candidate => {
    const score = deterministicScore(candidate, set.item)
    const unsafeReasons = candidateUnsafeReasons(candidate, set.item)
    return {
      id: candidate.id,
      name: candidate.name,
      similarity: candidate.similarity || null,
      deterministicScore: Math.round(score * 100) / 100,
      signalMatch: Boolean(candidate.signal_match),
      unsafe: unsafeReasons.length > 0,
      unsafeReasons,
      selected: candidate.id === selected?.id,
      rerankChoice: candidate.id === selection?.product_id,
    }
  })

  const displayRequestedName = set.item.displayRaw || set.item.raw

  return {
    requestedName: displayRequestedName,
    searchQuery: set.item.query,
    section: set.item.section,
    quantity: set.item.quantity,
    matched: selected,
    confidence,
    reason: selected
      ? (signalSelected
        ? 'Association validée depuis Signaux'
        : preferredPack
          ? 'Pack/kit privilégié car demandé par le client'
          : safeAiSelected
            ? selection?.reason || null
            : 'Correspondance catalogue forte par nom/référence')
      : selection?.reason || 'Aucune correspondance catalogue assez fiable',
    debug: {
      requestedName: displayRequestedName,
      matchingRaw: set.item.raw,
      searchQuery: set.item.query,
      section: set.item.section,
      quantity: set.item.quantity,
      query: {
        requestedFromPrompt: set.item.queryDebug?.requestedFromPrompt || set.item.raw,
        queryFromPrompt: set.item.queryDebug?.queryFromPrompt || set.item.query,
        finalRequested: displayRequestedName,
        finalQuery: set.item.query,
        changed: Boolean(set.item.queryDebug?.changed) || set.item.raw.trim() !== set.item.query.trim(),
        influences: queryInfluences,
      },
      selectedBy,
      decisionPriority: ['signal', 'pack_rule', 'rerank', 'deterministic'],
      decisionCandidates: {
        signal: signalSelected ? { id: signalSelected.id, name: signalSelected.name } : null,
        packRule: preferredPack ? { id: preferredPack.product.id, name: preferredPack.product.name, score: Math.round(preferredPack.score * 100) / 100 } : null,
        rerank: safeAiSelected ? { id: safeAiSelected.id, name: safeAiSelected.name, confidence: selection?.confidence || null } : null,
        deterministic: deterministic ? { id: deterministic.product.id, name: deterministic.product.name, score: Math.round(deterministic.score * 100) / 100 } : null,
      },
      finalChoice: selected ? { id: selected.id, name: selected.name } : null,
      signals: matchingSignals.map(signal => ({
        term: signal.term,
        normalizedTerm: signal.normalized_term,
        productId: signal.product_id,
        productName: signal.product_name,
        source: signal.source,
        confidence: signal.confidence,
        occurrences: signal.occurrences,
        instructionOnly: isInstructionOnlySignal(signal),
      })),
      rerank: selection ? {
        productId: selection.product_id,
        confidence: selection.confidence,
        reason: selection.reason || null,
      } : null,
      deterministic: deterministic ? {
        productId: deterministic.product.id,
        productName: deterministic.product.name,
        score: Math.round(deterministic.score * 100) / 100,
      } : null,
      search: set.searchDebug || null,
      preferredPack: preferredPack ? {
        productId: preferredPack.product.id,
        productName: preferredPack.product.name,
        score: Math.round(preferredPack.score * 100) / 100,
      } : null,
      candidates: debugCandidates,
    },
    alternatives: set.candidates
      .filter(candidate => candidate.id !== selected?.id)
      .slice(0, 4),
  }
})

const productsToHydrate = rawItems.flatMap(item => [
  ...(item.matched ? [item.matched] : []),
  ...item.alternatives,
])
const hydrated = await hydrateProductMetadata(productsToHydrate)
const hydratedById = new Map(hydrated.map(product => [product.id, product]))

const items = rawItems.map(item => {
  const alternatives = item.alternatives
    .map(product => hydratedById.get(product.id) || product)
    .filter((product, index, arr) =>
      arr.findIndex(candidate =>
        candidate.id === product.id ||
        candidate.name.trim().toLowerCase() === product.name.trim().toLowerCase()
      ) === index
    )

  return {
    ...item,
    matched: item.matched ? hydratedById.get(item.matched.id) || item.matched : null,
    alternatives,
  }
})

  return items
}
