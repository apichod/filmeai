import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import {
  createSupabaseAdmin,
  getDefaultOrganizationId,
  syncFaqItem,
  syncKnowledgeUrl,
} from '@/lib/knowledgeSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type SyncBody = {
  type?: 'faq' | 'url' | 'all'
  id?: string
}

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      ...(init?.headers || {}),
    },
  })
}

async function requireUser(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set() {},
        remove() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req)
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as SyncBody
    const type = body.type || 'all'
    const supabase = createSupabaseAdmin()
    const organizationId = await getDefaultOrganizationId(supabase)
    if (!organizationId) return json({ error: 'Organisation introuvable.' }, { status: 404 })

    if (type === 'faq') {
      if (!body.id) return json({ error: 'ID FAQ requis.' }, { status: 400 })
      const item = await syncFaqItem(supabase, body.id)
      return json({ success: true, item })
    }

    if (type === 'url') {
      if (!body.id) return json({ error: 'ID URL requis.' }, { status: 400 })
      const url = await syncKnowledgeUrl(supabase, body.id)
      return json({ success: true, url })
    }

    const { data: faqs, error: faqError } = await supabase
      .from('faq_items')
      .select('id')
      .eq('organization_id', organizationId)
      .or('synced.eq.false,synced.is.null')
      .order('updated_at', { ascending: true })
      .limit(20)

    if (faqError) throw new Error(faqError.message)

    const { data: urls, error: urlError } = await supabase
      .from('knowledge_urls')
      .select('id')
      .eq('organization_id', organizationId)
      .in('status', ['pending', 'error'])
      .order('created_at', { ascending: true })
      .limit(8)

    if (urlError) throw new Error(urlError.message)

    const syncedFaqIds: string[] = []
    const syncedUrlIds: string[] = []
    const errors: string[] = []

    for (const faq of faqs || []) {
      try {
        await syncFaqItem(supabase, faq.id as string)
        syncedFaqIds.push(faq.id as string)
      } catch (err) {
        errors.push(`FAQ ${faq.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    for (const url of urls || []) {
      try {
        await syncKnowledgeUrl(supabase, url.id as string)
        syncedUrlIds.push(url.id as string)
      } catch (err) {
        errors.push(`URL ${url.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return json({
      success: errors.length === 0,
      faq_synced: syncedFaqIds.length,
      url_synced: syncedUrlIds.length,
      errors,
    }, { status: errors.length ? 207 : 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, { status: 500 })
  }
}
