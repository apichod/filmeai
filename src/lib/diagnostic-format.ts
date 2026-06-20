// Formatage partagé du diagnostic IA — utilisé dans requests/new et assistant/corrections

export type MatchDebug = {
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
    influences: Array<{ source: string; label: string; detail: string }>
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

export function sourceLabel(source: MatchDebug['selectedBy']): string {
  if (source === 'signal') return 'Signal validé'
  if (source === 'pack_rule') return 'Règle pack/kit'
  if (source === 'rerank') return 'Reranking IA'
  if (source === 'deterministic') return 'Score déterministe'
  return 'Aucun choix automatique'
}

export function rootCauseSummary(debug: MatchDebug): string {
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
  if (before === 0) return '✗ AUCUN CANDIDAT — la recherche vectorielle n\'a rien trouvé. Créer un signal dans /assistant/knowledge ou vérifier le nom du produit en base.'
  if (after === 0 && unsafe > 0) return `✗ TOUS BLOQUÉS PAR GARDE-FOUS — ${before} candidats trouvés, ${unsafe} incompatibles (monture/type). Si le bon produit existe au catalogue, créer un signal dans /assistant/knowledge.`
  if (debug.rerank?.productId && debug.rerank.confidence < 0.5) return `✗ CONFIANCE TROP FAIBLE — reranker a proposé un produit à ${Math.round(debug.rerank.confidence * 100)}% (seuil 50%). Améliorer le prompt ou créer un signal.`
  if (after > 0) return `✗ BON PRODUIT ABSENT DES CANDIDATS — ${after} candidats testés, aucun n'est le bon. Cause probable : distance sémantique trop grande entre la demande et le nom catalogue. Créer un signal.`
  return `✗ Aucune correspondance (${before} candidats avant filtre)`
}

export function formatDiagnosticForCopy(debug: MatchDebug, operatorProductName?: string): string {
  const SEP = '─────────────────────────────────────────'
  const lines: string[] = []

  lines.push(`DIAGNOSTIC IA FILMEAI — ${debug.requestedName}`)
  lines.push(SEP)
  lines.push('')

  lines.push('RÉSULTAT FINAL')
  lines.push(`  ${rootCauseSummary(debug)}`)
  if (operatorProductName !== undefined) {
    const changed = operatorProductName !== debug.finalChoice?.name
    lines.push(`  Choix IA        : ${debug.finalChoice?.name || 'aucun'}${debug.selectedBy ? ` (${sourceLabel(debug.selectedBy)})` : ''}`)
    lines.push(`  Choix opérateur : ${operatorProductName || 'aucun (intervention Filme)'}${changed ? ' ← MODIFIÉ' : ''}`)
  } else {
    lines.push(`  Choix IA : ${debug.finalChoice?.name || 'aucun'}${debug.selectedBy ? ` (${sourceLabel(debug.selectedBy)})` : ''}`)
  }
  if (debug.requestContext) lines.push(`  Contexte : ${debug.requestContext}`)
  lines.push('')

  lines.push('ÉTAPE 1 — EXTRACTION')
  lines.push(`  Demandé   : ${debug.requestedName}`)
  if (debug.matchingRaw && debug.matchingRaw !== debug.requestedName) lines.push(`  Raw       : ${debug.matchingRaw}`)
  lines.push(`  Query     : ${debug.searchQuery}`)
  if (debug.query) {
    const changed = debug.query.changed || debug.requestedName.trim() !== debug.searchQuery.trim()
    lines.push(`  Modifiée  : ${changed ? 'oui' : 'non'}`)
    if (debug.query.influences.length > 0) {
      lines.push('  Influences :')
      debug.query.influences.forEach(inf => lines.push(`    · ${inf.label} : ${inf.detail}`))
    } else {
      lines.push('  Influences : aucune')
    }
  }
  lines.push(`  Quantité  : ${debug.quantity}`)
  const sectionFromInfluence = debug.query?.influences?.find(i => i.source === 'section_context')?.detail?.match(/"([^"]+)"/)?.[1]
  lines.push(`  Section   : ${debug.section || sectionFromInfluence || '—'}`)
  lines.push('')

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

  lines.push('ÉTAPE 3 — FILTRAGE GARDE-FOUS')
  if (debug.search) {
    lines.push(`  Rejetés incompatibles : ${debug.search.removedUnsafe}`)
    lines.push(`  Rejetés score faible  : ${debug.search.removedWeak}`)
    lines.push(`  Candidats retenus     : ${debug.search.candidatesAfterFilter}`)
    if (debug.search.candidatesAfterFilter === 0) lines.push('  ⚠ Aucun candidat ne passe les filtres')
  } else {
    lines.push('  non disponible')
  }
  lines.push('')

  lines.push('ÉTAPE 4 — RERANKING IA')
  if (debug.rerank?.productId) {
    lines.push(`  Choix reranker : ${debug.decisionCandidates?.rerank?.name || debug.rerank.productId}`)
    lines.push(`  Confiance      : ${Math.round(debug.rerank.confidence * 100)}%${debug.rerank.confidence < 0.5 ? ' ← sous le seuil (50%), ignoré' : ''}`)
    if (debug.rerank.reason) lines.push(`  Raison         : ${debug.rerank.reason}`)
  } else {
    lines.push(`  ${debug.rerank ? 'Aucun produit sélectionné par le reranker' : 'Reranking non exécuté (aucun candidat)'}`)
  }
  lines.push('')

  lines.push('ÉTAPE 5 — DÉCISION FINALE')
  lines.push('  Ordre de priorité : signal → pack/kit → reranking → déterministe')
  lines.push(`  Signal      : ${debug.decisionCandidates?.signal?.name || 'aucun'}`)
  lines.push(`  Pack/kit    : ${debug.decisionCandidates?.packRule?.name || 'aucun'}`)
  lines.push(`  Reranking   : ${debug.decisionCandidates?.rerank?.name || 'aucun'}`)
  lines.push(`  Déterministe: ${debug.decisionCandidates?.deterministic?.name || 'aucun'}`)
  lines.push(`  → SÉLECTIONNÉ : ${debug.finalChoice?.name || 'aucun'}`)
  lines.push('')

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
  lines.push('JSON DEBUG')
  lines.push(JSON.stringify(debug, null, 2))

  return lines.join('\n')
}
