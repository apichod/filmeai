import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * GET /api/sous-location/product-notes
 * Retourne toutes les notes : { notes: Record<product_id, string> }
 */
export async function GET() {
  const { data, error } = await getSupabase()
    .from('sous_location_product_notes')
    .select('product_id, note')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const notes: Record<string, string> = {}
  for (const row of data ?? []) notes[row.product_id as string] = row.note as string

  return NextResponse.json({ notes })
}

/**
 * POST /api/sous-location/product-notes
 * Body : { product_id: string; note: string }
 * Upsert la note pour ce produit.
 */
export async function POST(req: NextRequest) {
  const { product_id, note } = await req.json() as { product_id: string; note: string }

  if (!product_id) return NextResponse.json({ error: 'product_id requis' }, { status: 400 })

  const { error } = await getSupabase()
    .from('sous_location_product_notes')
    .upsert({ product_id, note, updated_at: new Date().toISOString() }, { onConflict: 'product_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
