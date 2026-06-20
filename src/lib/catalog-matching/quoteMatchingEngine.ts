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
import { detectCameraMount } from './safety'
import { candidateSearchWithDebug, createEmbeddingMap } from './search'
import { buildCatalogSignalsGlossary, getApprovedCatalogSignals } from './signals'
import { stripQuantityPrefix } from './text'
import type { CandidateSet, ParseQuoteRequestBody } from './types'

export type { ParseQuoteRequestBody }

export async function parseQuoteRequest(body: ParseQuoteRequestBody) {
  const t0 = Date.now()
  const {
    message,
    quoteExtractionPrompt: bodyQuoteExtractionPrompt,
    quoteRerankPrompt: bodyQuoteRerankPrompt,
    quoteBackendPrompt: bodyQuoteBackendPrompt,
  } = body

  console.log('[matching] ▶ start', { messageLength: message.length })

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
  console.log('[matching] signals', { count: approvedSignals.length })

  const learnedGlossary = buildCatalogSignalsGlossary(approvedSignals)
  const finalExtractionPrompt = learnedGlossary
    ? `${extractionPrompt}

${learnedGlossary}`
    : extractionPrompt

  const extractedItems = await extractItems(message, finalExtractionPrompt)
  const cameraMount = detectCameraMount(extractedItems)
  console.log('[matching] extraction', {
    count: extractedItems.length,
    cameraMount,
    items: extractedItems.map(i => ({
      raw: i.raw,
      query: i.query,
      queryChanged: i.queryDebug?.changed,
      qty: i.quantity,
      section: i.section,
    })),
  })

  if (extractedItems.length === 0) {
    console.log('[matching] ✗ no items extracted')
    return { items: [] }
  }

  const embeddingMap = await createEmbeddingMap(
    extractedItems.flatMap(item => [item.query, stripQuantityPrefix(item.raw)])
  )

  const candidateSets: CandidateSet[] = await Promise.all(
    extractedItems.map(async item => {
      const result = await candidateSearchWithDebug(item, embeddingMap, approvedSignals)
      console.log('[matching] search', {
        raw: item.raw,
        query: item.query,
        signals: result.debug.signalResults,
        direct: result.debug.directResults,
        semantic: result.debug.semanticExpandedResults,
        candidatesAfterFilter: result.debug.candidatesAfterFilter,
        removedUnsafe: result.debug.removedUnsafe,
      })
      return {
        item,
        candidates: result.products,
        searchDebug: result.debug,
      }
    })
  )

  const selections = await rerankAll(candidateSets, rerankPrompt, cameraMount)
  console.log('[matching] rerank raw', selections.map(s => ({
    index: s.index,
    productId: s.product_id,
    confidence: s.confidence,
    reason: s.reason,
  })))

  const items = await buildMatchedQuoteItems(candidateSets, selections, approvedSignals, cameraMount)
  console.log('[matching] ✔ done', {
    ms: Date.now() - t0,
    results: items.map(i => ({
      requested: i.requestedName,
      matched: i.matched?.name ?? null,
      selectedBy: i.debug?.selectedBy ?? null,
      confidence: i.confidence,
    })),
  })

  return { items }
}
