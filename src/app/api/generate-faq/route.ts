import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getOrgId(supabase: ReturnType<typeof getSupabase>) {
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FilmeAI-bot/1.0' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const html = await res.text()
  // Strip tags, collapse whitespace
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000) // max context
}

type FaqPair = { question: string; answer: string }

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json() as { url?: string }
    if (!url?.trim()) return NextResponse.json({ error: 'URL requise.' }, { status: 400 })

    const supabase = getSupabase()
    const orgId = await getOrgId(supabase)
    if (!orgId) return NextResponse.json({ error: 'Organisation introuvable.' }, { status: 401 })

    // Fetch page content
    let pageText: string
    try {
      pageText = await fetchPageText(url.trim())
    } catch (e) {
      return NextResponse.json({ error: `Impossible de récupérer la page : ${String(e)}` }, { status: 400 })
    }

    if (pageText.length < 100) {
      return NextResponse.json({ error: 'Page trop courte ou vide.' }, { status: 400 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es un assistant qui génère des FAQ claires et utiles à partir du contenu d'une page web.
Génère entre 5 et 15 paires question/réponse basées uniquement sur le contenu fourni.
Les questions doivent être formulées du point de vue d'un client.
Les réponses doivent être concises (1 à 3 phrases maximum).
Réponds UNIQUEMENT avec un JSON de la forme : {"faqs": [{"question": "...", "answer": "..."}]}`
        },
        {
          role: 'user',
          content: `Voici le contenu de la page ${url} :\n\n${pageText}`
        }
      ]
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    let faqs: FaqPair[] = []
    try {
      const parsed = JSON.parse(raw) as { faqs?: FaqPair[] }
      faqs = (parsed.faqs ?? []).filter(f => f.question && f.answer)
    } catch {
      return NextResponse.json({ error: 'Erreur de parsing GPT.' }, { status: 500 })
    }

    return NextResponse.json({ faqs })
  } catch (err) {
    console.error('generate-faq error:', err)
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
