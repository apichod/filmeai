// Doctrine matching: lire ./DOCTRINE.md avant modification. Généraliser l'intention, éviter les exceptions produit.
import { MIN_DETERMINISTIC_ACCEPT } from './types'
import { compactText, normalizeText, significantTokens, stripQuantityPrefix } from './text'

/** Vérifie si haystack contient le token, avec ou sans espaces (pour gérer "RS 4" vs "rs4"). */
function haystackContainsToken(haystack: string, token: string): boolean {
  const norm = normalizeText(token)
  return haystack.includes(norm) || compactText(haystack).includes(compactText(norm))
}
import type { CandidateSet, ExtractedItem, Product } from './types'

// ── Contexte caméra global ────────────────────────────────────────────────────

export type CameraMount = 'FE' | 'RF' | 'EF' | 'PL' | null

/**
 * Déduit la monture depuis les mots-clés de monture présents dans les queries.
 * Le prompt d'extraction enrichit les queries avec Sony FE / Canon RF / etc.
 * Pas de liste de modèles hardcodée — on fait confiance au prompt.
 */
export function detectCameraMount(items: ExtractedItem[]): CameraMount {
  const mounts: CameraMount[] = []

  for (const item of items) {
    const text = normalizeText(`${item.raw} ${item.query}`)

    if (/\bsony\s*fe\b/.test(text)) mounts.push('FE')
    else if (/\bcanon\s*rf\b/.test(text)) mounts.push('RF')
    else if (/\bcanon\s*ef\b/.test(text)) mounts.push('EF')
    else if (/\bpl\b/.test(text) && /\b(arri|komodo|pyxis|cinema|cine)\b/.test(text)) mounts.push('PL')
    // Inférence depuis la marque quand le contexte indique clairement une caméra
    else if (/\bsony\b/.test(text) && /\b(camera|caméra|pack|cinema|cinéma)\b/.test(text)) mounts.push('FE')
    else if (/\bcanon\b/.test(text) && /\brf\b/.test(text)) mounts.push('RF')
    else if (/\bcanon\b/.test(text) && /\bef\b/.test(text)) mounts.push('EF')
  }

  const unique = Array.from(new Set(mounts.filter(Boolean)))
  if (unique.length === 1) return unique[0] as CameraMount
  return null
}

/**
 * Retourne true si le nom produit est cohérent avec la monture détectée.
 */
export function productMatchesMount(product: Product, mount: CameraMount): boolean {
  if (!mount) return true
  const name = normalizeText(product.name)
  if (mount === 'FE') return /\bfe\b/.test(name) || /\bsony\b/.test(name)
  if (mount === 'RF') return /\brf\b/.test(name) || /\bcanon rf\b/.test(name)
  if (mount === 'EF') return /\bef\b/.test(name) || /\bcanon ef\b/.test(name)
  if (mount === 'PL') return /\bpl\b/.test(name)
  return true
}

export function queryHasAllTokens(product: Product, tokens: string[]): boolean {
  const haystack = normalizeText(`${product.name} ${product.description || ''}`)
  return tokens.every(token => {
    const normalized = normalizeText(token)
    return haystack.includes(normalized) || compactText(haystack).includes(compactText(normalized))
  })
}

export function requestWantsPack(item: ExtractedItem): boolean {
  const raw = normalizeText(item.raw)
  const query = normalizeText(item.query)
  const packPattern = /\b(pack|kit|serie|série|set|duo)\b/
  return packPattern.test(raw) || packPattern.test(query)
}

export function productLooksLikePack(product: Product): boolean {
  const name = normalizeText(product.name)
  return Boolean(product.is_bundle) || /\b(pack|kit|serie|série|set|duo)\b/.test(name)
}

export function requestWantsCameraBody(item: ExtractedItem): boolean {
  const text = normalizeText(`${item.raw} ${item.query}`)
  return /\b(camera|caméra|cine|ciné|cinema|cinéma)\b/.test(text)
}

export function productLooksLikeAccessoryOnly(product: Product): boolean {
  const name = normalizeText(product.name)
  return /\b(cage|rig|poignee|poignée|handle|plate|plaque|support|adaptateur|cable|câble|declencheur|déclencheur|trigger|battery plate|baseplate|module|sac|plateau|epauliere|épaulière)\b/.test(name)
}

export function importantModelTokens(item: ExtractedItem): string[] {
  const text = normalizeText(`${item.raw} ${item.query}`)
  const tokens = significantTokens(text)
  const hasFocalRange = tokens.some(token => /^\d{2,3}-\d{2,3}(mm)?$/.test(token))

  const important = tokens.filter(token =>
    /^\d{2,3}-\d{2,3}(mm)?$/.test(token) ||
    /^f\d(?:\.\d)?$/.test(token) ||
    /^\d\.\d$/.test(token) ||
    (!hasFocalRange && /^\d{2,3}$/.test(token)) ||
    (!hasFocalRange && /^\d{4}$/.test(token)) ||
    /^\d{2,3}mm$/.test(token) ||
    /^\d{2,3}gb$/.test(token) ||
    /^\d{2,3}go$/.test(token) ||
    /^\d{2,3}wh$/.test(token)
  )

  // Codes modèle génériques : lettres + chiffres (ex: rs4, a7, z9, xt4, r5)
  // Traités token par token + paires adjacentes pour gérer "RS 4" → "rs4"
  // sans fusionner les mots voisins ("roninrs4" capturerait "rs4r" à tort).
  const words = text.split(/\s+/).filter(Boolean)
  const modelCodeRe = /^[a-z]{1,3}\d{1,3}[a-z]{0,2}$/
  const existingSet = new Set(important)
  const parts: string[] = []
  for (let i = 0; i < words.length; i++) {
    parts.push(compactText(words[i]))
    if (i + 1 < words.length) parts.push(compactText(words[i] + words[i + 1]))
  }
  for (const part of parts) {
    if (modelCodeRe.test(part) && !/^f\d/.test(part) && !existingSet.has(part)) {
      important.push(part)
      existingSet.add(part)
    }
  }

  return Array.from(new Set(important))
}

export function productNameText(product: Product): string {
  return normalizeText(product.name)
}

export function requestText(item: ExtractedItem): string {
  return normalizeText(`${item.displayRaw || ''} ${item.raw} ${item.query}`)
}


/**
 * Gardes structurelles uniquement — pas de liste de modèles hardcodée.
 * Les décisions métier (quel modèle correspond à quel produit) sont dans le prompt rerank.
 */
export function requestHasFamilyMismatch(product: Product, item: ExtractedItem): boolean {
  const req = requestText(item)
  const name = productNameText(product)

  // Plages focales exactes — structurelles
  const focalRules: Array<[RegExp, RegExp]> = [
    [/\b16\s*-?\s*35\s*(?:mm)?\b/, /\b16\s*-?\s*35\s*(?:mm)?\b/],
    [/\b24\s*-?\s*70\s*(?:mm)?\b/, /\b24\s*-?\s*70\s*(?:mm)?\b/],
    [/\b24\s*-?\s*105\s*(?:mm)?\b/, /\b24\s*-?\s*105\s*(?:mm)?\b/],
    [/\b70\s*-?\s*200\s*(?:mm)?\b/, /\b70\s*-?\s*200\s*(?:mm)?\b/],
  ]

  for (const [requestPattern, productPattern] of focalRules) {
    if (requestPattern.test(req) && !productPattern.test(name)) return true
  }

  // Monture : RF/FE/EF sont structurellement incompatibles
  if (/\brf\b/.test(req) && /\b(fe|e-mount|sony)\b/.test(name) && !/\brf\b/.test(name)) return true
  if (/\bfe\b/.test(req) && /\b(rf|ef|canon)\b/.test(name) && !/\bfe\b/.test(name)) return true
  if (/\bsony\b/.test(req) && /\bcanon\b/.test(name)) return true

  // Ouverture explicite
  const explicitAperture = req.match(/\bf\s*\/?\s*(1\.2|1\.4|1\.8|2\.8|4)\b/)?.[1]
  const decimalApertureNearLens = /\b(16\s*-?\s*35|24\s*-?\s*70|24\s*-?\s*105|70\s*-?\s*200)\b/.test(req)
    ? req.match(/\b(1\.2|1\.4|1\.8|2\.8)\b/)?.[1]
    : undefined
  const aperture = explicitAperture || decimalApertureNearLens
  if (aperture) {
    const aperturePattern = new RegExp(`\\bf\\s*${aperture.replace('.', '\\.?')}\\s*l?\\b|\\b${aperture.replace('.', '\\.?')}\\s*l?\\b`)
    if (!aperturePattern.test(name)) return true
  }


  return false
}

export function isBrandOnlyAmbiguousRequest(item: ExtractedItem): boolean {
  const tokens = significantTokens(`${item.raw} ${item.query}`)
  const raw = normalizeText(stripQuantityPrefix(item.raw))
  // Un seul token significatif = demande trop vague pour auto-sélectionner un accessoire
  return tokens.length === 1 && raw === tokens[0]
}

export function candidateUnsafeReasons(product: Product, item: ExtractedItem): string[] {
  const reasons: string[] = []

  if (requestHasFamilyMismatch(product, item)) {
    reasons.push('Famille, focale, ouverture ou monture incohérente avec la demande')
  }
  if (requestWantsCameraBody(item) && productLooksLikeAccessoryOnly(product)) {
    reasons.push('Accessoire détecté alors que la demande vise une caméra ou un pack')
  }
  if (requestWantsTripod(item) && !productLooksLikeTripod(product)) {
    reasons.push('La demande vise un trépied : accessoire non retenu automatiquement')
  }
  if (requestWantsStabilizer(item) && productLooksLikeAccessoryOnly(product)) {
    reasons.push('La demande vise un stabilisateur complet : accessoire non retenu automatiquement')
  }
  if (isBrandOnlyAmbiguousRequest(item) && productLooksLikeAccessoryOnly(product)) {
    reasons.push('Demande trop générique : accessoire non retenu automatiquement')
  }

  return reasons
}

export function candidateIsUnsafe(product: Product, item: ExtractedItem): boolean {
  return candidateUnsafeReasons(product, item).length > 0
}

export function candidateMatchesImportantTokens(product: Product, item: ExtractedItem): boolean {
  const haystack = normalizeText(`${product.name} ${product.description || ''}`)
  const important = importantModelTokens(item)
  return important.length === 0 || important.every(token => haystack.includes(normalizeText(token)))
}

export function requestWantsTripod(item: ExtractedItem): boolean {
  const text = requestText(item)
  return /\b(trepied|trépied|tripod)\b/.test(text)
}

export function productLooksLikeTripod(product: Product): boolean {
  const name = productNameText(product)
  return /\b(trepied|trépied|tripod)\b/.test(name)
}

export function requestWantsStabilizer(item: ExtractedItem): boolean {
  const text = requestText(item)
  return /\b(stabilisateur|gimbal)\b/.test(text)
}

export function deterministicScore(product: Product, item: ExtractedItem): number {
  const name = normalizeText(product.name)
  const haystack = normalizeText(`${product.name} ${product.description || ''}`)
  const raw = normalizeText(stripQuantityPrefix(item.raw))
  const query = normalizeText(item.query)
  const tokens = significantTokens(`${item.raw} ${item.query}`)
  const important = importantModelTokens(item)

  let score = product.similarity || 0

  if (candidateIsUnsafe(product, item)) score -= 4

  if (raw && name.includes(raw)) score += 1.1
  if (query && name.includes(query)) score += 0.9

  const matchedTokens = tokens.filter(token => haystack.includes(normalizeText(token))).length
  if (tokens.length) score += (matchedTokens / tokens.length) * 0.8

  // Comparaison avec compactText pour gérer "RS 4" (haystack) vs "rs4" (token)
  const matchedImportant = important.filter(token => haystackContainsToken(haystack, token)).length
  if (important.length) score += (matchedImportant / important.length) * 1.4

  if (/\bold\b/i.test(product.name)) score -= 0.35

  if (requestWantsPack(item)) {
    if (productLooksLikePack(product)) score += 2.25
    else score -= 1.25
  } else if (productLooksLikePack(product)) {
    score -= 0.95
  }

  if (requestWantsCameraBody(item) && productLooksLikeAccessoryOnly(product)) {
    score -= 2.4
  }

  for (const token of important) {
    if (!haystackContainsToken(haystack, token)) score -= 0.85
  }

  // Cohérence focale et stockage — structurelles
  const focalStorageRules: Array<[RegExp, RegExp]> = [
    [/\b70\s*-?\s*200\s*(?:mm)?\b/, /\b70\s*-?\s*200\s*(?:mm)?\b/],
    [/\b24\s*-?\s*70\s*(?:mm)?\b/, /\b24\s*-?\s*70\s*(?:mm)?\b/],
    [/\b24\s*-?\s*105\s*(?:mm)?\b/, /\b24\s*-?\s*105\s*(?:mm)?\b/],
    [/\b16\s*-?\s*35\s*(?:mm)?\b/, /\b16\s*-?\s*35\s*(?:mm)?\b/],
    [/\b82\s*mm\b/, /\b82\s*mm\b/],
    [/\b512\s*(gb|go)\b/, /\b512\s*(gb|go)\b|\b512\b/],
  ]

  const reqText = normalizeText(`${item.raw} ${item.query}`)
  for (const [requestPattern, productPattern] of focalStorageRules) {
    if (requestPattern.test(reqText) && !productPattern.test(haystack)) score -= 1.2
  }

  return score
}

export function deterministicAutoSelect(set: CandidateSet, cameraMount?: CameraMount): { product: Product; score: number } | null {
  if (set.candidates.length === 0) return null

  const ranked = set.candidates
    .map(product => ({ product, score: deterministicScore(product, set.item) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]

  const tied = ranked.filter(r => Math.abs(r.score - best.score) < 0.01)
  if (tied.length >= 2) {
    const raw = normalizeText(stripQuantityPrefix(set.item.raw))
    const query = normalizeText(set.item.query)
    const hasMount = /\b(fe|rf|ef|pl|e-mount|mft|f-mount)\b/.test(raw) || /\b(fe|rf|ef|pl|e-mount|mft|f-mount)\b/.test(query)
    const hasAperture = /\bf\s*\/?\s*(1\.2|1\.4|1\.8|2\.8|4)\b/.test(raw) || /\b(1\.2|1\.4|1\.8|2\.8)\b/.test(raw)

    if (!hasMount && !hasAperture && cameraMount) {
      const mountMatch = tied.find(r => productMatchesMount(r.product, cameraMount))
      if (mountMatch) return mountMatch
    }

    if (!hasMount && !hasAperture) return null
  }

  const haystack = normalizeText(`${best.product.name} ${best.product.description || ''}`)
  const raw = normalizeText(stripQuantityPrefix(set.item.raw))
  const query = normalizeText(set.item.query)
  const tokens = significantTokens(`${set.item.raw} ${set.item.query}`)
  const important = importantModelTokens(set.item)
  const matchedTokens = tokens.filter(token => haystack.includes(normalizeText(token))).length
  const tokenRatio = tokens.length ? matchedTokens / tokens.length : 0
  const importantOk = important.length === 0 || important.every(token => haystack.includes(normalizeText(token)))
  const strongPhrase = Boolean(
    (raw.length >= 3 && haystack.includes(raw)) ||
    (query.length >= 3 && haystack.includes(query))
  )
  const enoughTokens = tokens.length <= 2 ? tokenRatio === 1 : tokenRatio >= 0.67

  if (best.score >= MIN_DETERMINISTIC_ACCEPT && importantOk && (strongPhrase || enoughTokens)) {
    return best
  }

  if (best.score >= 2.2 && importantOk) return best

  return null
}
