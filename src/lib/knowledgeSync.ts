import { createHash } from 'crypto'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

export type KnowledgeChunk = {
  id: string
  source_type: 'faq' | 'url' | 'file'
  source_id: string
  title: string | null
  content: string
  url: string | null
  similarity: number
}

type FaqItemRow = {
  id: string
  organization_id: string
  question: string
  answer: string | null
}

type KnowledgeUrlRow = {
  id: string
  organization_id: string
  url: string
  title: string | null
}

type KnowledgeChunkInsert = {
  organization_id: string
  source_type: 'faq' | 'url' | 'file'
  source_id: string
  title: string | null
  content: string
  url: string | null
  chunk_index: number
  content_hash: string
  embedding: string
}

export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getDefaultOrganizationId(supabase: SupabaseAdmin): Promise<string | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.id ?? null
}

export function hashText(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function decodeBasicEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, '’')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&eacute;/gi, 'é')
    .replace(/&egrave;/gi, 'è')
    .replace(/&agrave;/gi, 'à')
    .replace(/&ccedil;/gi, 'ç')
}

function extractTitle(html: string, fallbackUrl: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  const raw = title || h1 || fallbackUrl
  return decodeBasicEntities(raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 180)
}

function htmlToText(html: string) {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')

  return decodeBasicEntities(
    withoutNoise
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|h1|h2|h3|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

export function normalizeAllowedKnowledgeUrl(value: string) {
  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  if (!['filme.fr', 'www.filme.fr'].includes(host)) {
    throw new Error('URL non autorisée : seules les pages filme.fr peuvent être synchronisées.')
  }
  if (url.protocol !== 'https:') throw new Error('URL non autorisée : HTTPS requis.')
  return url.toString()
}

export async function fetchKnowledgePage(urlValue: string) {
  const url = normalizeAllowedKnowledgeUrl(urlValue)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FilmeAI-knowledge-bot/1.0 (+https://filmeai.vercel.app)' },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`)
  const html = await res.text()
  const title = extractTitle(html, url)
  const text = htmlToText(html)
  if (text.length < 120) throw new Error('Page trop courte ou contenu illisible.')
  return { url, title, text }
}

function chunkText(text: string, maxChars = 2200) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph
    if (next.length <= maxChars) {
      current = next
      continue
    }

    if (current) chunks.push(current)
    if (paragraph.length <= maxChars) {
      current = paragraph
    } else {
      for (let i = 0; i < paragraph.length; i += maxChars) {
        chunks.push(paragraph.slice(i, i + maxChars).trim())
      }
      current = ''
    }
  }

  if (current) chunks.push(current)
  return chunks.slice(0, 12)
}

async function embedTexts(inputs: string[]) {
  if (inputs.length === 0) return []
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: inputs,
  })
  return response.data.map(item => item.embedding)
}

async function replaceChunks(supabase: SupabaseAdmin, rows: KnowledgeChunkInsert[]) {
  if (rows.length === 0) return
  const sourceType = rows[0].source_type
  const sourceId = rows[0].source_id

  const { error: deleteError } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)

  if (deleteError) throw new Error(deleteError.message)

  const { error: insertError } = await supabase
    .from('knowledge_chunks')
    .insert(rows)

  if (insertError) throw new Error(insertError.message)
}

export async function syncFaqItem(supabase: SupabaseAdmin, itemId: string) {
  const { data, error } = await supabase
    .from('faq_items')
    .select('id, organization_id, question, answer')
    .eq('id', itemId)
    .single()

  if (error) throw new Error(error.message)
  const item = data as FaqItemRow
  const content = `Question : ${item.question}\n\nRéponse : ${item.answer || ''}`.trim()
  const contentHash = hashText(content)
  const embeddings = await embedTexts([content])
  const embedding = embeddings[0]

  if (!embedding) throw new Error('Embedding FAQ introuvable.')

  await replaceChunks(supabase, [{
    organization_id: item.organization_id,
    source_type: 'faq',
    source_id: item.id,
    title: item.question,
    content,
    url: null,
    chunk_index: 0,
    content_hash: contentHash,
    embedding: JSON.stringify(embedding),
  }])

  const { data: updated, error: updateError } = await supabase
    .from('faq_items')
    .update({ synced: true, content_hash: contentHash, synced_at: new Date().toISOString(), sync_error: null })
    .eq('id', item.id)
    .select()
    .single()

  if (updateError) throw new Error(updateError.message)
  return updated
}

export async function markFaqUnsynced(supabase: SupabaseAdmin, itemId: string, message: string) {
  await supabase
    .from('faq_items')
    .update({ synced: false, sync_error: message, synced_at: null })
    .eq('id', itemId)
}

export async function deleteKnowledgeChunksForSource(supabase: SupabaseAdmin, sourceType: 'faq' | 'url' | 'file', sourceId: string) {
  const { error } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)

  if (error) throw new Error(error.message)
}

export async function syncKnowledgeUrl(supabase: SupabaseAdmin, urlId: string) {
  const { data, error } = await supabase
    .from('knowledge_urls')
    .select('id, organization_id, url, title')
    .eq('id', urlId)
    .single()

  if (error) throw new Error(error.message)
  const row = data as KnowledgeUrlRow

  await supabase
    .from('knowledge_urls')
    .update({ status: 'crawling', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', row.id)

  try {
    const page = await fetchKnowledgePage(row.url)
    const chunks = chunkText(page.text)
    const inputs = chunks.map((chunk, index) => `${page.title}\nSource : ${page.url}\nExtrait ${index + 1}/${chunks.length}\n\n${chunk}`)
    const embeddings = await embedTexts(inputs)
    const contentHash = hashText(`${page.title}\n${page.url}\n${page.text}`)

    const rows: KnowledgeChunkInsert[] = chunks.map((chunk, index) => ({
      organization_id: row.organization_id,
      source_type: 'url',
      source_id: row.id,
      title: page.title,
      content: chunk,
      url: page.url,
      chunk_index: index,
      content_hash: contentHash,
      embedding: JSON.stringify(embeddings[index]),
    }))

    await replaceChunks(supabase, rows)

    const { data: updated, error: updateError } = await supabase
      .from('knowledge_urls')
      .update({
        title: page.title,
        status: 'done',
        content_hash: contentHash,
        error_message: null,
        last_crawled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select()
      .single()

    if (updateError) throw new Error(updateError.message)
    return updated
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const { data: updated } = await supabase
      .from('knowledge_urls')
      .update({ status: 'error', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .select()
      .single()
    throw new Error(updated ? message : message)
  }
}

export async function searchKnowledge(supabase: SupabaseAdmin, query: string, limit = 5): Promise<KnowledgeChunk[]> {
  if (!query.trim()) return []

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const embedding = response.data[0]?.embedding
  if (!embedding) return []

  const { data, error } = await supabase.rpc('search_knowledge', {
    query_text: query,
    query_embedding: JSON.stringify(embedding),
    match_count: limit,
  })

  if (error) {
    console.warn('Knowledge search error:', error.message)
    return []
  }

  return (data || []) as KnowledgeChunk[]
}
