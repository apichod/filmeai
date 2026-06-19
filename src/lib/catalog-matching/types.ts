export type CatalogSignal = {
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

export type ExtractedItem = {
  raw: string
  query: string
  quantity: number
  section: string | null
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

export const MIN_SIMILARITY = 0.16
export const MIN_RERANK_CONFIDENCE = 0.5
export const MIN_DETERMINISTIC_ACCEPT = 1.25
