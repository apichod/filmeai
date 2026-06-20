// Doctrine matching: lire ./DOCTRINE.md avant modification. Généraliser l'intention, éviter les exceptions produit.
import { MIN_DETERMINISTIC_ACCEPT } from './types'
import { compactText, normalizeText, significantTokens, stripQuantityPrefix } from './text'
import type { CandidateSet, ExtractedItem, Product } from './types'

// ── Contexte caméra global ────────────────────────────────────────────────────

export type CameraMount = 'FE' | 'RF' | 'EF' | 'PL' | null

/**
 * Analyse la liste complète des items extraits et déduit la monture probable.
 * Sony FX3/FX6/FX9/FX30 → E mount → FE
 * Canon C400/C50/C80 → RF
 * Canon C300/C70 → EF (défaut)
 * Si plusieurs caméras de montures différentes → null (ambiguïté)
 */
export function detectCameraMount(items: ExtractedItem[]): CameraMount {
  const mounts: CameraMount[] = []

  for (const item of items) {
    const text = normalizeText(`${item.raw} ${item.query}`)
    if (/\b(fx3|fx6|fx9|fx30)\b/.test(text)) mounts.push('FE')
    else if (/\bc400\b/.test(text)) mounts.push('RF')
    else if (/\bc70\b/.test(text) && /\brf\b/.test(text)) mounts.push('RF')
    else if (/\bc70\b/.test(text) && /\bef\b/.test(text)) mounts.push('EF')
    else if (/\bc70\b/.test(text)) mounts.push('EF') // défaut C70 = EF Cinema
    else if (/\bc300\b/.test(text)) mounts.push('EF')
    else if (/\bc50\b/.test(text)) mounts.push('RF')
    else if (/\bc80\b/.test(text)) mounts.push('RF')
  }

  const unique = Array.from(new Set(mounts.filter(Boolean)))
  if (unique.length === 1) return unique[0] as CameraMount
  return null // ambiguïté ou pas de caméra détectée
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
  const packPattern = /\b(pack|kit|serie|série|set|duo|reportage|standard|essentiel|multicam)\b/
  return packPattern.test(raw) || packPattern.test(query)
}

export function productLooksLikePack(product: Product): boolean {
  const name = normalizeText(product.name)
  return Boolean(product.is_bundle) || /\b(pack|kit|serie|série|set|duo)\b/.test(name)
}

export function requestWantsCameraBody(item: ExtractedItem): boolean {
  const text = normalizeText(`${item.raw} ${item.query}`)
  return /\b(camera|caméra|cine|ciné|cinema|cinéma)\b/.test(text) || /\bfx[369]0?\b/.test(text)
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
    /^(fx3|fx6|fx9|fx30|b10x|b10|d2|prohead|profoto|atem|ntg3|c1|r5|r6|rj45|bpu|bpu60|bpu90|vmount|vlock|v-lock|indie|shogun|sachtler|magliner|macbook|aputure|600x|1200d)$/.test(token) ||
    /^(c50|c70|c80|c300|c400|r5c|rf|rs3|rs4|teradek|bolt|tx|rx|blackmagic|sdi|iso|extreme)$/.test(token) ||
    /^(dji|transmission|recepteur|receiver)$/.test(token) ||
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

  const compact = compactText(text)
  if (/roninrs3|rs3/.test(compact)) important.push('rs3')
  if (/roninrs4|rs4/.test(compact)) important.push('rs4')

  return Array.from(new Set(important))
}

export function productNameText(product: Product): string {
  return normalizeText(product.name)
}

export function requestText(item: ExtractedItem): string {
  return normalizeText(`${item.displayRaw || ''} ${item.raw} ${item.query}`)
}

function requestLooksLikeCameraAccessory(item: ExtractedItem): boolean {
  const text = requestText(item)
  const hasCameraModel = /\b(fx3|fx6|fx9|fx30|c50|c70|c80|c300|c400|komodo|pyxis)\b/.test(text)
  const hasAccessoryHead = /\b(cable|câble|declencheur|déclencheur|trigger|poignee|poignée|cage|rig|support|adaptateur|adapter|alim|alimentation|batterie|battery|chargeur|plate|plaque)\b/.test(text)
  const explicitlyAsksCamera = /\b(camera|caméra|boitier|boîtier|body|pack|kit)\b/.test(text)
  return hasCameraModel && hasAccessoryHead && !explicitlyAsksCamera
}

function productLooksLikeCameraOrCameraPack(product: Product): boolean {
  const name = productNameText(product)
  const hasCameraModel = /\b(fx3|fx6|fx9|fx30|c50|c70|c80|c300|c400|komodo|pyxis)\b/.test(name)
  return hasCameraModel && (productLooksLikePack(product) || !productLooksLikeAccessoryOnly(product))
}

function productMatchesRsModel(product: Product, model: '3' | '4'): boolean {
  const name = productNameText(product)
  const compact = compactText(name)
  const spacedPattern = new RegExp(`\\b(?:dji\\s*)?(?:ronin\\s*)?rs\\s*${model}(?:\\s*pro)?\\b`)
  const compactPattern = new RegExp(`(?:dji)?(?:ronin)?rs${model}(?:pro)?`)
  return spacedPattern.test(name) || compactPattern.test(compact)
}

/**
 * Garde de sécurité structurelle : retourne true si le produit appartient
 * manifestement à la mauvaise famille pour cet item.
 *
 * Les règles domain-spécifiques (GM II, ATEM variantes, Bolt distance, densité
 * filtre, TX/RX, types filtre) sont traitées par le prompt de reranking, éditable
 * dans /assistant/behavior. Ce code ne gère que les incohérences structurelles
 * (modèle caméra, plage focale, monture, ouverture).
 */
export function requestHasFamilyMismatch(product: Product, item: ExtractedItem): boolean {
  const req = requestText(item)
  const name = productNameText(product)

  // Familles caméra et focales exactes — structurelles
  const exactNameFamilies: Array<[RegExp, RegExp]> = [
    [/\bfx3\b/, /\bfx3\b/],
    [/\bfx6\b/, /\bfx6\b/],
    [/\bfx9\b/, /\bfx9\b/],
    [/\bfx30\b/, /\bfx30\b/],
    [/\bc400\b/, /\bc400\b/],
    [/\bc50\b/, /\bc50\b/],
    [/\bc70\b/, /\bc70\b/],
    [/\bc300\b/, /\bc300\b/],
    [/\bb10x\s*plus\b/, /\bb10x\s*plus\b/],
    [/\bpro\s*-?\s*11\b/, /\bpro\s*-?\s*11\b/],
    [/\bronin\s*rs\s*3\b|\brs3\b/, /\b(?:dji\s*)?(?:ronin\s*)?rs\s*3(?:\s*pro)?\b|\brs3(?:pro)?\b/],
    [/\bronin\s*rs\s*4\b|\brs4\b/, /\b(?:dji\s*)?(?:ronin\s*)?rs\s*4(?:\s*pro)?\b|\brs4(?:pro)?\b/],
    [/\b300x\b/, /\b300x\b/],
    [/\b600x\b/, /\b600x\b/],
    [/\b1200d\b/, /\b1200d\b/],
    [/\bteradek\b/, /\bteradek\b/],
    [/\bbolt\b/, /\bbolt\b/],
    [/\b16\s*-?\s*35\s*(?:mm)?\b/, /\b16\s*-?\s*35\s*(?:mm)?\b/],
    [/\b24\s*-?\s*70\s*(?:mm)?\b/, /\b24\s*-?\s*70\s*(?:mm)?\b/],
    [/\b24\s*-?\s*105\s*(?:mm)?\b/, /\b24\s*-?\s*105\s*(?:mm)?\b/],
    [/\b70\s*-?\s*200\s*(?:mm)?\b/, /\b70\s*-?\s*200\s*(?:mm)?\b/],
  ]

  for (const [requestPattern, productPattern] of exactNameFamilies) {
    if (requestPattern.test(req) && !productPattern.test(name)) return true
  }

  // Monture : RF/FE/EF sont structurellement incompatibles
  if (/\brf\b/.test(req) && /\b(fe|e-mount|sony)\b/.test(name) && !/\brf\b/.test(name)) return true
  if (/\bfe\b/.test(req) && /\b(rf|ef|canon)\b/.test(name) && !/\bfe\b/.test(name)) return true
  if (/\bsony\b/.test(req) && /\bcanon\b/.test(name)) return true

  // Accessoire pour caméra ≠ caméra ou pack caméra
  if (requestLooksLikeCameraAccessory(item) && productLooksLikeCameraOrCameraPack(product)) return true

  // Ouverture explicite
  const explicitAperture = req.match(/\bf\s*\/?\s*(1\.2|1\.4|1\.8|2\.8|4)\b/)?.[1]
  const decimalApertureNearLens = /\b(12\s*-?\s*24|14\s*-?\s*24|15\s*-?\s*35|16\s*-?\s*35|24\s*-?\s*70|24\s*-?\s*105|70\s*-?\s*200)\b/.test(req)
    ? req.match(/\b(1\.2|1\.4|1\.8|2\.8)\b/)?.[1]
    : undefined
  const aperture = explicitAperture || decimalApertureNearLens
  if (aperture) {
    const aperturePattern = new RegExp(`\\bf\\s*${aperture.replace('.', '\\.?')}\\s*l?\\b|\\b${aperture.replace('.', '\\.?')}\\s*l?\\b`)
    if (!aperturePattern.test(name)) return true
  }

  if (/\bronin\s*rs\s*3\b|\brs3\b/.test(req) && !productMatchesRsModel(product, '3')) return true
  if (/\bronin\s*rs\s*4\b|\brs4\b/.test(req) && !productMatchesRsModel(product, '4')) return true

  return false
}

export function isBrandOnlyAmbiguousRequest(item: ExtractedItem): boolean {
  const tokens = significantTokens(`${item.raw} ${item.query}`)
  const raw = normalizeText(stripQuantityPrefix(item.raw))
  return tokens.length === 1 && /^(atomos|sony|canon|profoto|aputure|smallhd)$/.test(tokens[0]) && raw === tokens[0]
}

/**
 * Raisons structurelles pour lesquelles un candidat est unsafe.
 * Les variantes domain-spécifiques (GM II, ATEM, Bolt, densité filtre, types filtre)
 * sont gérées par le reranker LLM via le prompt éditable /assistant/behavior.
 */
export function candidateUnsafeReasons(product: Product, item: ExtractedItem): string[] {
  const reasons: string[] = []

  if (requestLooksLikeCameraAccessory(item) && productLooksLikeCameraOrCameraPack(product)) {
    reasons.push('Accessoire caméra demandé : caméra ou pack caméra non retenu automatiquement')
  }
  if (requestHasFamilyMismatch(product, item)) {
    reasons.push('Famille, modèle, focale ou monture incohérente avec la demande')
  }
  if (requestWantsCameraBody(item) && productLooksLikeAccessoryOnly(product)) {
    reasons.push('Accessoire caméra détecté alors que la demande vise une caméra ou un pack caméra')
  }
  if (requestWantsTripod(item) && !productLooksLikeTripod(product)) {
    reasons.push('La demande vise un trépied : accessoire ou élément compatible non retenu automatiquement')
  }
  if (requestWantsStabilizer(item) && productLooksLikeAccessoryOnly(product)) {
    reasons.push('La demande vise un stabilisateur Ronin complet : accessoire Ronin non retenu automatiquement')
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
  return /\b(ronin|rs\s*3|rs3|rs\s*4|rs4|stabilisateur|gimbal)\b/.test(text)
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

  const matchedImportant = important.filter(token => haystack.includes(normalizeText(token))).length
  if (important.length) score += (matchedImportant / important.length) * 1.4

  if (/\bold\b/i.test(product.name)) score -= 0.35

  // Règle métier : pack demandé → favoriser le pack ; sinon pénaliser les packs.
  if (requestWantsPack(item)) {
    if (productLooksLikePack(product)) score += 2.25
    else score -= 1.25
  } else if (productLooksLikePack(product)) {
    score -= 0.95
  }

  // Caméra/boîtier demandé → pénaliser les accessoires seuls.
  if (requestWantsCameraBody(item) && productLooksLikeAccessoryOnly(product)) {
    score -= 2.4
  }

  // Pénalité par token important absent du candidat.
  for (const token of important) {
    if (!haystack.includes(normalizeText(token))) score -= 0.85
  }

  // Cohérence famille / modèle / focale.
  const familyRules: Array<[RegExp, RegExp]> = [
    [/\bfx6\b/, /\bfx6\b/],
    [/\bfx3\b/, /\bfx3\b/],
    [/\bfx30\b/, /\bfx30\b/],
    [/\bc400\b/, /\bc400\b/],
    [/\bc50\b/, /\bc50\b/],
    [/\bc70\b/, /\bc70\b/],
    [/\bb10x\b/, /\bb10x\b/],
    [/\batem\b/, /\batem\b/],
    [/\bntg3\b/, /\bntg3\b/],
    [/\bsachtler\b/, /\bsachtler\b/],
    [/\bmagliner\b/, /\bmagliner\b/],
    [/\b70\s*-?\s*200\s*(?:mm)?\b/, /\b70\s*-?\s*200\s*(?:mm)?\b/],
    [/\b24\s*-?\s*70\s*(?:mm)?\b/, /\b24\s*-?\s*70\s*(?:mm)?\b/],
    [/\b24\s*-?\s*105\s*(?:mm)?\b/, /\b24\s*-?\s*105\s*(?:mm)?\b/],
    [/\b16\s*-?\s*35\s*(?:mm)?\b/, /\b16\s*-?\s*35\s*(?:mm)?\b/],
    [/\b82\s*mm\b/, /\b82\s*mm\b/],
    [/\b512\s*(gb|go)\b/, /\b512\s*(gb|go)\b|\b512\b/],
  ]

  const reqText = normalizeText(`${item.raw} ${item.query}`)
  for (const [requestPattern, productPattern] of familyRules) {
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

  // Si plusieurs candidats ont le même score maximal, tenter de les départager.
  const tied = ranked.filter(r => Math.abs(r.score - best.score) < 0.01)
  if (tied.length >= 2) {
    const raw = normalizeText(stripQuantityPrefix(set.item.raw))
    const query = normalizeText(set.item.query)
    const hasBrand = /\b(sony|canon|sigma|zeiss|tamron|fuji|nikon|leica)\b/.test(raw) || /\b(sony|canon|sigma|zeiss|tamron|fuji|nikon|leica)\b/.test(query)
    const hasMount = /\b(fe|rf|ef|pl|e-mount|mft|f-mount)\b/.test(raw) || /\b(fe|rf|ef|pl|e-mount|mft|f-mount)\b/.test(query)
    const hasAperture = /\bf\s*\/?\s*(1\.2|1\.4|1\.8|2\.8|4)\b/.test(raw) || /\b(1\.2|1\.4|1\.8|2\.8)\b/.test(raw)

    // Tiebreaker : monture caméra détectée dans le devis global
    if (!hasBrand && !hasMount && !hasAperture && cameraMount) {
      const mountMatch = tied.find(r => productMatchesMount(r.product, cameraMount))
      if (mountMatch) return mountMatch
    }

    // Aucun discriminant → laisser le reranker décider
    if (!hasBrand && !hasMount && !hasAperture) return null
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
