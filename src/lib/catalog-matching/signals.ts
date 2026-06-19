// Doctrine matching: lire ./DOCTRINE.md avant modification. Généraliser l'intention, éviter les exceptions produit.
import { getDefaultOrganizationId, getSupabaseAdmin } from './db'
import { hasPreciseReference, normalizeText, normalizedSignalTerm, significantTokens, STOPWORDS } from './text'
import type { CatalogSignal, ExtractedItem, Product } from './types'

export async function getApprovedCatalogSignals(): Promise<CatalogSignal[]> {
  try {
    const organizationId = await getDefaultOrganizationId()
    if (!organizationId) return []

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('catalog_signals')
      .select('term, normalized_term, product_id, product_name, source, confidence, occurrences')
      .eq('organization_id', organizationId)
      .eq('approved', true)
      .order('occurrences', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(500)

    if (error || !data?.length) return []
    return data as CatalogSignal[]
  } catch (err) {
    console.warn('Catalog signals fallback:', err instanceof Error ? err.message : String(err))
    return []
  }
}

export function buildCatalogSignalsGlossary(signals: CatalogSignal[]): string {
  const lines = signals
    .map(row => {
      const term = String(row.term || '').trim()
      const productName = String(row.product_name || '').trim()
      if (!term || !productName) return null
      return `- ${term} → ${productName}`
    })
    .filter(Boolean)
    .join('\n')

  return lines
    ? `GLOSSAIRE APPRIS DEPUIS L'INTERFACE :\n${lines}\n\nSi un terme client correspond à une entrée de ce glossaire appris, utilise cette association dans le champ query. Ce glossaire est prioritaire sur les déductions générales.`
    : ''
}

export function isInstructionOnlySignal(signal: CatalogSignal): boolean {
  const productName = normalizeText(signal.product_name || '')
  return productName.startsWith('appliquer ') || productName.startsWith('utiliser ')
}

export function isBroadSignalTerm(value: string): boolean {
  const text = normalizeText(value)
  return /^(canon|sony|blackmagic|profoto|aputure|smallhd|atomos|canon rf|canon ef|sony fe|sony e|rf|ef|fe|pl|objectif|objectifs|camera|caméra)$/.test(text)
}

function isCameraModelToPackSignal(signal: CatalogSignal): boolean {
  const source = normalizeText(signal.source || '')
  const productName = normalizeText(signal.product_name || '')
  return source === 'camera_model_to_pack' || /\bpack\b/.test(productName)
}

function itemLooksLikeCameraAccessoryRequest(item: ExtractedItem): boolean {
  const text = normalizeText(`${item.displayRaw || ''} ${item.raw} ${item.query}`)
  const hasCameraModel = /\b(fx3|fx6|fx9|fx30|c50|c70|c80|c300|c400|komodo|pyxis)\b/.test(text)
  const hasAccessoryHead = /\b(cable|câble|declencheur|déclencheur|trigger|poignee|poignée|cage|rig|support|adaptateur|adapter|alim|alimentation|batterie|battery|chargeur|plate|plaque)\b/.test(text)
  const explicitlyAsksCamera = /\b(camera|caméra|boitier|boîtier|body|pack|kit)\b/.test(text)
  return hasCameraModel && hasAccessoryHead && !explicitlyAsksCamera
}

export function signalMatchesItem(signal: CatalogSignal, item: ExtractedItem): boolean {
  const signalTerm = normalizedSignalTerm(signal.normalized_term || signal.term)
  if (!signalTerm) return false

  const raw = normalizedSignalTerm(item.raw)
  const query = normalizedSignalTerm(item.query)
  const itemText = normalizeText(`${item.raw} ${item.query}`)

  // Un signal métier “Sony FX6 → pack essentiel” sert quand le client demande
  // la caméra. Il ne doit pas capturer “câble déclencheur pour Sony FX6”,
  // “batterie pour FX6”, “cage FX6”, etc.
  if (isCameraModelToPackSignal(signal) && itemLooksLikeCameraAccessoryRequest(item)) return false

  if (signalTerm === raw || signalTerm === query) return true

  // Les signaux génériques de marque/monture (ex: “canon rf”) ne doivent pas
  // capturer une demande précise comme “24-70 Canon”, sinon ils court-circuitent
  // le reranking et imposent une série/pack sans rapport.
  if (isBroadSignalTerm(signalTerm)) return false

  // Si la demande contient une référence précise (24-70, 82mm, 256Go…), un signal
  // plus vague ne peut matcher en inclusion que s’il contient lui aussi cette référence.
  if (hasPreciseReference(itemText) && !hasPreciseReference(signalTerm)) return false

  // Les signaux courts (FX3, FX6, C70…) doivent matcher exactement.
  // Les expressions longues peuvent matcher en inclusion.
  if (signalTerm.length < 4) return false
  return raw.includes(signalTerm) || query.includes(signalTerm) || itemText.includes(signalTerm)
}

export function matchingSignalsForItem(item: ExtractedItem, signals: CatalogSignal[]): CatalogSignal[] {
  return signals
    .filter(signal => signalMatchesItem(signal, item))
    .sort((a, b) => Number(b.occurrences || 0) - Number(a.occurrences || 0))
    .slice(0, 6)
}

export function signalNameMatchesProduct(signalProductName: string, product: Product): boolean {
  const signalName = normalizeText(signalProductName)
  const productName = normalizeText(product.name)
  if (!signalName || !productName) return false

  const packTerms = ['pack', 'kit', 'serie', 'série', 'set', 'duo']
  const packVariantTerms = ['essentiel', 'standard', 'reportage', 'stabilisateur', 'multicam', 'mode', 'cine', 'ciné', 'cinema', 'cinéma']
  const signalWantsPack = packTerms.some(term => signalName.includes(term)) || packVariantTerms.some(term => signalName.includes(term))
  const productIsPack = packTerms.some(term => productName.includes(term))

  // A signal that points to “Sony FX3 – pack essentiel” must not validate the bare “Sony FX3”.
  if (signalWantsPack && !productIsPack) return false

  // If the signal targets a specific pack variant, require that same variant in the candidate.
  const requiredVariant = packVariantTerms.find(term => signalName.includes(term))
  if (requiredVariant && !productName.includes(requiredVariant)) return false

  // Direction matters: a product can be more specific than the signal, but not less specific.
  if (productName === signalName || productName.includes(signalName)) return true

  const tokens = significantTokens(signalProductName)
    .filter(token => !STOPWORDS.has(token) && token.length >= 3)
  if (tokens.length === 0) return false

  const matched = tokens.filter(token => productName.includes(token)).length
  return matched / tokens.length >= 0.9
}
