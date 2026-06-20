export type CatalogSignal = {
  id?: string
  term: string
  normalized_term: string | null
  product_id: string | null
  product_name: string
  source: string | null
  confidence: number | null
  occurrences: number | null
}

export type Product = {
  id: string
  name: string
  description: string | null
  price_per_day: number | null
  deposit: number | null
  photo_url: string | null
  similarity?: number
  signal_match?: boolean
  is_bundle?: boolean
  bundle_items?: string[]
}

export type QueryInfluence = {
  source: 'extraction_prompt' | 'frontend_signal' | 'backend_preserve_brand' | 'backend_preserve_aperture' | 'backend_preserve_focal' | 'section_context' | 'original_client_text'
  label: string
  detail: string
}

export type QueryDebug = {
  requestedFromPrompt: string
  queryFromPrompt: string
  finalRequested: string
  finalQuery: string
  changed: boolean
  influences: QueryInfluence[]
}

export type ExtractedItem = {
  // Terme court/nettoyé utilisé par le moteur de matching.
  raw: string
  // Terme enrichi utilisé pour chercher dans le catalogue.
  query: string
  // Terme exact client, sans préfixe quantité, utilisé pour l'affichage et la correction humaine.
  displayRaw?: string
  quantity: number
  section: string | null
  queryDebug?: QueryDebug
}

export type SearchDebug = {
  signalResults: number
  directResults: number
  semanticExpandedResults: number
  semanticRawResults: number
  candidatesBeforeFilter: number
  candidatesAfterFilter: number
  removedUnsafe: number
  removedWeak: number
}

export type CandidateSet = {
  item: ExtractedItem
  candidates: Product[]
  searchDebug?: SearchDebug
}

export type RerankSelection = {
  index: number
  product_id: string | null
  confidence: number
  reason?: string
}

export type RerankResult = {
  selections?: RerankSelection[]
}

export type EmbeddingMap = Map<string, number[]>

export type AssistantPromptSettings = {
  quote_extraction_prompt?: string | null
  quote_rerank_prompt?: string | null
  quote_backend_prompt?: string | null
}

export type ParseQuoteRequestBody = {
  message: string
  quoteExtractionPrompt?: string
  quoteRerankPrompt?: string
  quoteBackendPrompt?: string
}

// Les seuils sont désormais dans constants.ts — re-exportés ici pour rétrocompatibilité.
export { MIN_SIMILARITY, MIN_RERANK_CONFIDENCE, MIN_DETERMINISTIC_ACCEPT } from './constants'
