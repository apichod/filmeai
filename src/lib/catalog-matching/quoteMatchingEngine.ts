import {
  DEFAULT_QUOTE_EXTRACTION_PROMPT,
  DEFAULT_QUOTE_RERANK_PROMPT,
  normalizeEditablePrompt,
  splitQuoteBackendPrompt,
} from '@/lib/defaultAssistantPrompts'
import { buildMatchedQuoteItems } from './diagnostics'
import { extractItems } from './extract'
import { getQuotePrompts } from './prompts'
import { rerankAll } from './rerank'
import { candidateSearchWithDebug, createEmbeddingMap } from './search'
import { buildCatalogSignalsGlossary, getApprovedCatalogSignals } from './signals'
import { stripQuantityPrefix } from './text'
import type { CandidateSet, ParseQuoteRequestBody } from './types'

export type { ParseQuoteRequestBody }

export async function parseQuoteRequest(body: ParseQuoteRequestBody) {
  const {
    message,
    quoteExtractionPrompt: bodyQuoteExtractionPrompt,
    quoteRerankPrompt: bodyQuoteRerankPrompt,
    quoteBackendPrompt: bodyQuoteBackendPrompt,
  } = body

  let extractionPrompt: string
  let rerankPrompt: string

  if (typeof bodyQuoteExtractionPrompt === 'string' || typeof bodyQuoteRerankPrompt === 'string') {
    extractionPrompt = normalizeEditablePrompt(bodyQuoteExtractionPrompt, DEFAULT_QUOTE_EXTRACTION_PROMPT)
    rerankPrompt = normalizeEditablePrompt(bodyQuoteRerankPrompt, DEFAULT_QUOTE_RERANK_PROMPT)
  } else if (typeof bodyQuoteBackendPrompt === 'string' && bodyQuoteBackendPrompt.trim().length > 0) {
    const splitPrompts = splitQuoteBackendPrompt(bodyQuoteBackendPrompt)
    extractionPrompt = splitPrompts.extractionPrompt
    rerankPrompt = splitPrompts.rerankPrompt
  } else {
    const settingsPrompts = await getQuotePrompts()
    extractionPrompt = settingsPrompts.extractionPrompt
    rerankPrompt = settingsPrompts.rerankPrompt
  }

  const approvedSignals = await getApprovedCatalogSignals()
  const learnedGlossary = buildCatalogSignalsGlossary(approvedSignals)
  const finalExtractionPrompt = learnedGlossary
    ? `${extractionPrompt}

${learnedGlossary}`
    : extractionPrompt

  const extractedItems = await extractItems(message, finalExtractionPrompt)
  if (extractedItems.length === 0) return { items: [] }

  const embeddingMap = await createEmbeddingMap(
    extractedItems.flatMap(item => [item.query, stripQuantityPrefix(item.raw)])
  )

  const candidateSets: CandidateSet[] = await Promise.all(
    extractedItems.map(async item => {
      const result = await candidateSearchWithDebug(item, embeddingMap, approvedSignals)
      return {
        item,
        candidates: result.products,
        searchDebug: result.debug,
      }
    })
  )

  const selections = await rerankAll(candidateSets, rerankPrompt)
  const items = await buildMatchedQuoteItems(candidateSets, selections, approvedSignals)

  return { items }
}
