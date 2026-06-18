import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { markFaqUnsynced, syncFaqItem } from '@/lib/knowledgeSync'

export const dynamic = 'force-dynamic'

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

export async function GET() {
  const supabase = getSupabase()
  const orgId = await getOrgId(supabase)
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('faq_items')
    .select('*')
    .eq('organization_id', orgId)
    .order('position')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const orgId = await getOrgId(supabase)
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { question, answer } = await req.json() as { question?: string; answer?: string }
  if (!question?.trim()) return NextResponse.json({ error: 'Question requise.' }, { status: 400 })

  const { data, error } = await supabase
    .from('faq_items')
    .insert({ organization_id: orgId, question: question.trim(), answer: (answer ?? '').trim(), synced: false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    const synced = await syncFaqItem(supabase, data.id as string)
    return NextResponse.json({ item: synced })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await markFaqUnsynced(supabase, data.id as string, message)
    return NextResponse.json({ item: data, sync_error: message })
  }
}
