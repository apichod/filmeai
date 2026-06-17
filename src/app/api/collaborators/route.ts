import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getDefaultOrgId(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

// ── GET — liste des membres ───────────────────────────────────────────────────
export async function GET() {
  const supabase = getSupabaseAdmin()
  const orgId = await getDefaultOrgId(supabase)
  if (!orgId) return NextResponse.json({ members: [] })

  const { data, error } = await supabase
    .from('organization_members')
    .select('id, email, name, role, status, invited_at, joined_at')
    .eq('organization_id', orgId)
    .order('invited_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data || [] })
}

// ── POST — inviter un collaborateur ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { email, role = 'operator' } = await req.json() as { email: string; role?: string }

  if (!email?.includes('@')) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  }
  if (!['admin', 'operator'].includes(role)) {
    return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const orgId = await getDefaultOrgId(supabase)
  if (!orgId) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 })

  // Vérifier si déjà membre
  const { data: existing } = await supabase
    .from('organization_members')
    .select('id, status')
    .eq('organization_id', orgId)
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: existing.status === 'pending' ? 'Invitation déjà envoyée.' : "Déjà membre de l'équipe." },
      { status: 409 }
    )
  }

  // Envoyer l'invitation Supabase (magic link par email)
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    email.toLowerCase(),
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://filmeai.vercel.app'}/settings/collaborators`,
      data: { organization_id: orgId, role },
    }
  )

  if (inviteError) {
    // L'utilisateur existe peut-être déjà — on crée quand même l'entrée membre
    console.warn('Supabase invite warning:', inviteError.message)
  }

  // Créer l'entrée dans organization_members
  const { error: insertError } = await supabase
    .from('organization_members')
    .insert({
      organization_id: orgId,
      email: email.toLowerCase(),
      name: email.split('@')[0],
      role,
      status: 'pending',
      user_id: inviteData?.user?.id ?? null,
    })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, email })
}

// ── DELETE — retirer un membre ────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { memberId } = await req.json() as { memberId: string }
  if (!memberId) return NextResponse.json({ error: 'memberId manquant' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
