import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/me?email=...
// Retourne { role, permissions } pour l'email donné.
// Si l'email n'est pas dans organization_members → owner/admin implicite.
export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get('email')
  if (!email) return NextResponse.json({ role: 'admin', permissions: [] })

  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('organization_members')
    .select('role, permissions')
    .eq('email', email.toLowerCase())
    .eq('status', 'active')
    .maybeSingle()

  if (!data) {
    // Pas dans organization_members → propriétaire du compte = admin
    return NextResponse.json({ role: 'admin', permissions: [] })
  }

  return NextResponse.json({
    role: data.role,
    // Les admins ont accès complet, on ne stocke pas leurs permissions
    permissions: data.role === 'admin' ? [] : (data.permissions ?? []),
  })
}
