// Doctrine matching: lire ./DOCTRINE.md avant modification. Généraliser l'intention, éviter les exceptions produit.
import { MIN_DETERMINISTIC_ACCEPT } from './types'
import { compactText, normalizeText, significantTokens, stripQuantityPrefix } from './text'
import type { CandidateSet, ExtractedItem, Product } from './types'

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

  // La demande brute prime. Exception utile : une association “Signaux” peut
  // injecter explicitement un nom de pack dans query.
  return packPattern.test(raw) || packPattern.test(query)
}

export function productLooksLikePack(product: Product): boolean {
  // Important : on se base surtout sur le NOM. Les descriptions contiennent souvent
  // "Packs apparentés", ce qui faisait remonter des accessoires type cage/rig
  // comme si c'étaient des packs.
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

function requestWantsReceiverProduct(item: ExtractedItem): boolean {
  const text = requestText(item)
  return /\b(recepteur|récepteur|receiver|rx)\b/.test(text)
}

function productLooksLikeReceiverProduct(product: Product): boolean {
  const name = productNameText(product)
  return /\b(recepteur|récepteur|receiver|rx)\b/.test(name)
}

function productLooksLikeReceiverAccessory(product: Product): boolean {
  const name = productNameText(product)
  return /\b(antenne|antennes|batterie|battery|chargeur|cable|câble|adaptateur|base\s*plate|plate|support|commande|focus)\b/.test(name)
}


function filterDensityFractions(value: string): string[] {
  const text = stripQuantityPrefix(value).replace(/[,;]/g, ' ')
  const matches = text.match(/\b1\s*\/\s*(?:8|4|2)\b/g) || []
  return Array.from(new Set(matches.map(match => match.replace(/\s+/g, ''))))
}

function requestedFilterDensities(item: ExtractedItem): string[] {
  return filterDensityFractions(`${item.displayRaw || ''} ${item.raw} ${item.query}`)
}

function productFilterDensities(product: Product): string[] {
  return filterDensityFractions(product.name)
}

function productHasFilterDensity(product: Product, density: string): boolean {
  return productFilterDensities(product).includes(density)
}

function requestWantsGmVersionTwo(item: ExtractedItem): boolean {
  const text = normalizeText(`${item.displayRaw || ''} ${item.raw} ${item.query}`)
  const compact = compactText(text)
  return /\bgm\s*(ii|2)\b/.test(text) || /\bgm\s*mark\s*(ii|2)\b/.test(text) || /gm(?:ii|2)\b/.test(compact)
}

function productHasGmVersionTwo(product: Product): boolean {
  const name = productNameText(product)
  const compact = compactText(name)
  return /\bgm\s*(ii|2)\b/.test(name) || /\bgm\s*mark\s*(ii|2)\b/.test(name) || /gm(?:ii|2)\b/.test(compact)
}

function requestedBoltDistance(item: ExtractedItem): string | null {
  const text = requestText(item)
  return text.match(/\bbolt\s*(?:4k\s*)?(3000|1500|750|500)\b/)?.[1] || null
}

function productHasBoltDistance(product: Product, distance: string): boolean {
  const name = productNameText(product)
  return new RegExp(`\\b${distance}\\b`).test(name)
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

function productMatchesRsModel(product: Product, model: '3' | '4'): boolean {
  const name = productNameText(product)
  const compact = compactText(name)
  const spacedPattern = new RegExp(`\\b(?:dji\\s*)?(?:ronin\\s*)?rs\\s*${model}(?:\\s*pro)?\\b`)
  const compactPattern = new RegExp(`(?:dji)?(?:ronin)?rs${model}(?:pro)?`)
  return spacedPattern.test(name) || compactPattern.test(compact)
}

export function requestHasFamilyMismatch(product: Product, item: ExtractedItem): boolean {
  const req = requestText(item)
  const name = productNameText(product)

  // Les références modèle/focales doivent apparaître dans le nom produit, pas
  // seulement dans une description ou dans “packs apparentés”.
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

  // Familles filtres : Vari ND / ND / Pro-Mist / pola ne sont pas interchangeables.
  if (/\bvari\s*nd\b|\bvariable\s*nd\b/.test(req)) {
    if (/\bpro\s*-?\s*mist\b|\bblack\s*pro\s*-?\s*mist\b|\bhollywood\s*black\s*magic\b/.test(name)) return true
    if (!(/\bvari\s*nd\b|\bvariable\s*nd\b/.test(name))) return true
  }

  if (/\bpro\s*-?\s*mist\b|\bblack\s*promist\b|\bblack\s*pro\s*-?\s*mist\b/.test(req)) {
    if (/\bvari\s*nd\b|\bvariable\s*nd\b/.test(name)) return true
    if (!(/\bmist\b/.test(name))) return true
  }

  // Densités de filtres : 1/8, 1/4, 1/2 ne sont pas interchangeables.
  // On travaille sur le texte original parce que normalizeText transforme "1/4" en "1 4".
  const requestedDensities = requestedFilterDensities(item)
  if (requestedDensities.length > 0 && !requestedDensities.every(density => productHasFilterDensity(product, density))) return true

  // Famille Glimmerglass : ne pas accepter un ND, pola ou Pro-Mist uniquement parce que 82mm matche.
  if (/\bglimmer\s*glass\b|\bglimmerglass\b/.test(req) && !(/\bglimmer\s*glass\b|\bglimmerglass\b/.test(name))) return true

  // Versions/générations : GM et GM II ne sont pas interchangeables.
  if (requestWantsGmVersionTwo(item) && !productHasGmVersionTwo(product)) return true

  // Si la demande vise un accessoire pour caméra, ne pas substituer la caméra
  // ou son pack prêt-à-tourner simplement parce que le modèle FX6/FX3 est cité.
  if (requestLooksLikeCameraAccessory(item) && productLooksLikeCameraOrCameraPack(product)) return true

  // Récepteur / RX : c'est une intention produit générique. Ne pas remplacer un
  // récepteur demandé par ses accessoires (antennes, batteries, chargeurs, etc.).
  if (requestWantsReceiverProduct(item) && productLooksLikeReceiverAccessory(product)) {
    return true
  }

  // Transmission vidéo : un kit Teradek Bolt TX/RX doit rester un Teradek Bolt
  // complet et respecter la portée/référence demandée si elle est indiquée.
  const boltDistance = requestedBoltDistance(item)
  if (boltDistance && !productHasBoltDistance(product, boltDistance)) return true
  if (/\btx\b/.test(req) && /\brx\b/.test(req) && (!/\btx\b/.test(name) || !/\brx\b/.test(name))) return true

  // Régie Blackmagic ATEM : SDI / ISO / Extreme / Pro ne sont pas des variantes
  // marketing interchangeables. "ATEM Mini Extreme ISO SDI" doit donc matcher
  // un ATEM SDI Extreme ISO, pas la version HDMI/non-SDI.
  if (/\batem\b/.test(req)) {
    if (/\bsdi\b/.test(req) && !/\bsdi\b/.test(name)) return true
    if (/\biso\b/.test(req) && !/\biso\b/.test(name)) return true
    if (/\bextreme\b/.test(req) && !/\bextreme\b/.test(name)) return true
    if (/\bpro\b/.test(req) && !/\bpro\b/.test(name) && !/\bextreme\b/.test(req)) return true
  }

  if (/\bangelbird\b/.test(req) && !/\bangelbird\b/.test(name)) return true
  if (/\b256\s*(gb|go)\b/.test(req) && !/\b256\b/.test(name)) return true
  if (/\b512\s*(gb|go)\b/.test(req) && !/\b512\b/.test(name)) return true
  if (/\b82\s*mm\b/.test(req) && !/\b82\s*mm\b|\b82mm\b/.test(name)) return true
  if (/\brf\b/.test(req) && /\b(fe|e-mount|sony)\b/.test(name) && !/\brf\b/.test(name)) return true
  if (/\bfe\b/.test(req) && /\b(rf|ef|canon)\b/.test(name) && !/\bfe\b/.test(name)) return true
  if (/\bsony\b/.test(req) && /\bcanon\b/.test(name)) return true

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

export function candidateUnsafeReasons(product: Product, item: ExtractedItem): string[] {
  const reasons: string[] = []
  const req = requestText(item)
  const name = productNameText(product)

  const requestedDensities = requestedFilterDensities(item)
  if (requestedDensities.length > 0 && !requestedDensities.every(density => productHasFilterDensity(product, density))) {
    reasons.push(`Densité filtre demandée ${requestedDensities.join(', ')} absente du produit`)
  }
  if (requestWantsGmVersionTwo(item) && !productHasGmVersionTwo(product)) {
    reasons.push('Version demandée GM II absente du produit')
  }
  if (requestLooksLikeCameraAccessory(item) && productLooksLikeCameraOrCameraPack(product)) {
    reasons.push('Accessoire caméra demandé : caméra ou pack caméra non retenu automatiquement')
  }
  if (requestWantsReceiverProduct(item) && productLooksLikeReceiverAccessory(product)) {
    reasons.push('Récepteur demandé : accessoire non retenu automatiquement')
  }
  const boltDistance = requestedBoltDistance(item)
  if (boltDistance && !productHasBoltDistance(product, boltDistance)) {
    reasons.push(`Référence Teradek Bolt ${boltDistance} absente du produit`)
  }
  if (/\btx\b/.test(req) && /\brx\b/.test(req) && (!/\btx\b/.test(name) || !/\brx\b/.test(name))) {
    reasons.push('Kit TX/RX demandé : produit incomplet TX/RX')
  }
  if (/\batem\b/.test(req)) {
    if (/\bsdi\b/.test(req) && !/\bsdi\b/.test(name)) reasons.push('Version ATEM SDI demandée absente du produit')
    if (/\biso\b/.test(req) && !/\biso\b/.test(name)) reasons.push('Version ATEM ISO demandée absente du produit')
    if (/\bextreme\b/.test(req) && !/\bextreme\b/.test(name)) reasons.push('Version ATEM Extreme demandée absente du produit')
    if (/\bpro\b/.test(req) && !/\bpro\b/.test(name) && !/\bextreme\b/.test(req)) reasons.push('Version ATEM Pro demandée absente du produit')
  }
  if (requestHasFamilyMismatch(product, item)) {
    reasons.push('Famille, modèle, focale, densité ou monture incohérente avec la demande')
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

  const requestedDensities = requestedFilterDensities(item)
  if (requestedDensities.length > 0) {
    const matchedDensities = requestedDensities.filter(density => productHasFilterDensity(product, density)).length
    score += matchedDensities * 1.2
  }

  if (requestWantsGmVersionTwo(item)) {
    if (productHasGmVersionTwo(product)) score += 1.35
    else score -= 1.35
  }

  if (requestWantsReceiverProduct(item)) {
    if (productLooksLikeReceiverProduct(product)) score += 1.5
    if (productLooksLikeReceiverAccessory(product)) score -= 1.5
  }

  if (/\bold\b/i.test(product.name)) score -= 0.35

  // Business rule: if the client asks for a pack/kit/series, prefer the pack over
  // the naked product when the model family is otherwise equivalent.
  if (requestWantsPack(item)) {
    if (productLooksLikePack(product)) score += 2.25
    else score -= 1.25
  } else if (productLooksLikePack(product)) {
    // Si le client n'a pas demandé de pack, on préfère le produit nu à modèle égal.
    score -= 0.95
  }

  // “Sony FX6 pack caméra” means camera/pack, not an accessory compatible with FX6.
  if (requestWantsCameraBody(item) && productLooksLikeAccessoryOnly(product)) {
    score -= 2.4
  }

  // Hard-ish penalties: if a model/reference is present in the request but absent from the candidate,
  // the candidate is usually dangerous. This prevents “x5 fx6” → “Insta360 X5”, etc.
  for (const token of important) {
    if (!haystack.includes(normalizeText(token))) score -= 0.85
  }

  // Product family sanity checks
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

  const requestText = normalizeText(`${item.raw} ${item.query}`)
  for (const [requestPattern, productPattern] of familyRules) {
    if (requestPattern.test(requestText) && !productPattern.test(haystack)) score -= 1.2
  }

  return score
}

export function deterministicAutoSelect(set: CandidateSet): { product: Product; score: number } | null {
  if (set.candidates.length === 0) return null

  const ranked = set.candidates
    .map(product => ({ product, score: deterministicScore(product, set.item) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]

  // Si plusieurs candidats ont le même score maximal et que le terme demandé
  // ne contient pas de discriminant de marque ou de monture, ne pas choisir
  // arbitrairement — laisser l'UI afficher les alternatives.
  const tied = ranked.filter(r => Math.abs(r.score - best.score) < 0.01)
  if (tied.length >= 2) {
    const raw = normalizeText(stripQuantityPrefix(set.item.raw))
    const query = normalizeText(set.item.query)
    const hasBrand = /\b(sony|canon|sigma|zeiss|tamron|fuji|nikon|leica)\b/.test(raw) || /\b(sony|canon|sigma|zeiss|tamron|fuji|nikon|leica)\b/.test(query)
    const hasMount = /\b(fe|rf|ef|pl|e-mount|mft|f-mount)\b/.test(raw) || /\b(fe|rf|ef|pl|e-mount|mft|f-mount)\b/.test(query)
    const hasAperture = /\bf\s*\/?\s*(1\.2|1\.4|1\.8|2\.8|4)\b/.test(raw) || /\b(1\.2|1\.4|1\.8|2\.8)\b/.test(raw)
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
