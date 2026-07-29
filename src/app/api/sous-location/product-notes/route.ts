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
 * Retourne notes et références : { notes: Record<product_id, string>, references: Record<product_id, string> }
 */
export async function GET() {
  const { data, error } = await getSupabase()
    .from('sous_location_product_notes')
    .select('product_id, note, reference')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const notes: Record<string, string> = {}
  const references: Record<string, string> = {}
  for (const row of data ?? []) {
    notes[row.product_id as string] = (row.note as string) ?? ''
    references[row.product_id as string] = (row.reference as string) ?? ''
  }

  return NextResponse.json({ notes, references })
}

/**
 * POST /api/sous-location/product-notes
 * Body : { product_id: string; note?: string; reference?: string }
 * Upsert la note et/ou la référence pour ce produit.
 */
export async function POST(req: NextRequest) {
  const { product_id, note, reference } = await req.json() as {
    product_id: string
    note?: string
    reference?: string
  }

  if (!product_id) return NextResponse.json({ error: 'product_id requis' }, { status: 400 })

  const patch: Record<string, unknown> = { product_id, updated_at: new Date().toISOString() }
  if (note      !== undefined) patch.note      = note
  if (reference !== undefined) patch.reference = reference

  const { error } = await getSupabase()
    .from('sous_location_product_notes')
    .upsert(patch, { onConflict: 'product_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
