import { NextResponse } from 'next/server'

// Endpoint désactivé — les workflows sont gérés via les migrations Supabase
export async function GET() {
  return NextResponse.json({ error: 'Endpoint désactivé' }, { status: 410 })
}
