import { openai } from './openai'
import { normalizeText, stripQuantityPrefix } from './text'
import type { ExtractedItem } from './types'


function appendTokenIfMissing(value: string, token: string): string {
  const norm = normalizeText(value)
  const tokenNorm = normalizeText(token)
  return norm.includes(tokenNorm) ? value : `${value} ${token}`.trim()
}

function restoreExplicitBrand(raw: string, message: string): string {
  const cleanRaw = normalizeText(raw)
  const rules: Array<{ raw: RegExp; message: RegExp; label: string }> = [
    { raw: /^fx3$/, message: /\bsony\s+fx3\b/i, label: 'Sony FX3' },
    { raw: /^fx6$/, message: /\bsony\s+fx6\b/i, label: 'Sony FX6' },
    { raw: /^fx9$/, message: /\bsony\s+fx9\b/i, label: 'Sony FX9' },
    { raw: /^fx30$/, message: /\bsony\s+fx30\b/i, label: 'Sony FX30' },
    { raw: /^c50$/, message: /\bcanon\s+c50\b/i, label: 'Canon C50' },
    { raw: /^c70$/, message: /\bcanon\s+c70\b/i, label: 'Canon C70' },
    { raw: /^c80$/, message: /\bcanon\s+c80\b/i, label: 'Canon C80' },
    { raw: /^c400$/, message: /\bcanon\s+c400\b/i, label: 'Canon C400' },
    { raw: /^rs3$/, message: /\bronin\s+rs\s*3\b/i, label: 'Ronin RS3' },
    { raw: /^rs4$/, message: /\bronin\s+rs\s*4\b/i, label: 'Ronin RS4' },
  ]

  const match = rules.find(rule => rule.raw.test(cleanRaw) && rule.message.test(message))
  return match ? match.label : raw
}

function findApertureNearFocal(message: string, item: ExtractedItem): string | null {
  const itemText = normalizeText(`${item.raw} ${item.query}`)
  const focalMatch = itemText.match(/\b(12\s*-\s*24|14\s*-\s*24|15\s*-\s*35|16\s*-\s*35|24\s*-\s*70|24\s*-\s*105|70\s*-\s*200)\b/)
  if (!focalMatch) return null

  const focal = focalMatch[1].replace(/\s+/g, '\\s*')
  const source = message.replace(/[–—−]/g, '-')
  const after = new RegExp(`${focal}\\s*(?:mm)?\\s*(?:f\\s*/?\\s*)?(1\\.2|1\\.4|1\\.8|2\\.8|4)`, 'i')
  const before = new RegExp(`(?:f\\s*/?\\s*)?(1\\.2|1\\.4|1\\.8|2\\.8|4)\\s*${focal}`, 'i')
  const match = source.match(after) || source.match(before)
  return match?.[1] ? `F${match[1]}` : null
}

function restoreOriginalHints(item: ExtractedItem, message: string): ExtractedItem {
  let raw = restoreExplicitBrand(item.raw, message)
  let query = item.query
  const aperture = findApertureNearFocal(message, { ...item, raw })

  if (aperture) {
    raw = appendTokenIfMissing(raw, aperture)
    query = appendTokenIfMissing(query, aperture)
  }

  return { ...item, raw, query }
}

export async function extractItems(message: string, quoteBackendPrompt: string): Promise<ExtractedItem[]> {
  const extractRes = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: quoteBackendPrompt },
      { role: 'user', content: `Message client :\n${message}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 2200,
  })

  type ExtractResult = { items?: Partial<ExtractedItem>[] }
  let parsed: ExtractResult = {}
  try {
    parsed = JSON.parse(extractRes.choices[0].message.content || '{}') as ExtractResult
  } catch {
    parsed = {}
  }

  return (parsed.items || [])
    .map(item => ({
      raw: stripQuantityPrefix(String(item.raw || item.query || '')).trim(),
      query: stripQuantityPrefix(String(item.query || item.raw || '')).trim(),
      quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
      section: typeof item.section === 'string' && item.section.trim()
        ? item.section.trim()
        : null,
    }))
    .map(item => restoreOriginalHints(item, message))
    .filter(item => item.raw.length > 0 && item.query.length > 0)
}
