// Doctrine matching: lire ./DOCTRINE.md avant modification. Généraliser l'intention, éviter les exceptions produit.
import { openai } from './openai'
import type { CandidateSet, RerankResult, RerankSelection } from './types'

export async function rerankAll(candidateSets: CandidateSet[], rerankPrompt: string): Promise<RerankSelection[]> {
  const payload = candidateSets.map((set, index) => ({
    index,
    requested: set.item.displayRaw || set.item.raw,
    raw: set.item.raw,
    query: set.item.query,
    quantity: set.item.quantity,
    section: set.item.section,
    candidates: set.candidates.map(candidate => ({
      id: candidate.id,
      name: candidate.name,
      price_per_day: candidate.price_per_day,
      description: (candidate.description || '').slice(0, 320),
      similarity: candidate.similarity || null,
      is_bundle: candidate.is_bundle || false,
    })),
  }))

  const rerankRes = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: rerankPrompt,
      },
      { role: 'user', content: JSON.stringify({ items: payload }) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 2600,
  })

  try {
    const parsed = JSON.parse(rerankRes.choices[0].message.content || '{}') as RerankResult
    return parsed.selections || []
  } catch {
    return []
  }
}
