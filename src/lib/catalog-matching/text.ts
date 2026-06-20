export const STOPWORDS = new Set([
  'avec', 'pour', 'vers', 'plus', 'moins', 'sans', 'de', 'du', 'des', 'la', 'le', 'les',
  'en', 'et', 'ou', 'sur', 'un', 'une', 'au', 'aux', 'camera', 'objectif',
  'objectifs', 'moniteur', 'energie', 'énergie', 'data', 'machine', 'machinerie', 'type',
  'with', 'all', 'and', 'the', 'kit', 'complet', 'complets',
])

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[^a-z0-9+\-\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripQuantityPrefix(value: string): string {
  return value
    // x5 fx6 → fx6 ; ×5 fx6 → fx6
    .replace(/(^|\s)[x×]\s*(\d+)\s+/gi, ' ')
    // 5x fx6 → fx6 ; 5× fx6 → fx6
    .replace(/(^|\s)(\d+)\s*[x×]\s+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizedSignalTerm(value: string): string {
  return normalizeText(stripQuantityPrefix(value))
}

export function hasPreciseReference(value: string): boolean {
  const text = normalizeText(value)
  return /\b\d{2,3}\s*-\s*\d{2,3}\b/.test(text) ||
    /\b\d{2,4}\s*(mm|gb|go|wh|w)\b/.test(text) ||
    /\b\d+\s*\/\s*\d+\b/.test(text) ||
    /\bf\s*\/?\s*(?:1\.2|1\.4|1\.8|2\.8|4)\b/.test(text) ||
    /\b(?:1\.2|1\.4|1\.8|2\.8)\b/.test(text)
}


export function compactText(value: string): string {
  return normalizeText(value).replace(/\s+/g, '')
}

export function spacedModelVariant(value: string): string {
  return normalizeText(value).replace(/\b([a-z]+)(\d+)\b/g, '$1 $2')
}

export function significantTokens(value: string): string[] {
  const norm = normalizeText(stripQuantityPrefix(value))
  const rawTokens = norm.match(/[a-z0-9]+(?:[.-][a-z0-9]+)*/g) || []
  const expanded: string[] = []

  for (const token of rawTokens) {
    if (token.includes('-')) expanded.push(...token.split('-').filter(Boolean))
    if (/^[a-z]+\d+$/.test(token)) expanded.push(token.replace(/([a-z]+)(\d+)/, '$1 $2'))
    expanded.push(token)
  }

  return Array.from(new Set(
    expanded
      .map(t => t.trim())
      .filter(t => t.length >= 2 && !STOPWORDS.has(t))
  ))
}
