import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getSeedRows, EMAIL_TEMPLATE_LABELS } from '@/lib/email-templates'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Ordre d'affichage des groupes (#10 → #11 → #12)
const TEMPLATE_GROUP_ORDER = [
  'retour_ok',
  'retour_casse',
  'retour_manquant',
  'facturation_casse',
  'facturation_perdu',
  'facturation_vole',
]

// Ordre des cas par template (priorité assurance+caution → assurance → caution → aucun)
const TEMPLATE_CASE_ORDER: Record<string, string[]> = {
  retour_casse: [
    'insurance_caution',
    'insurance_no_caution',
    'no_insurance_caution',
    'no_insurance_no_caution',
  ],
  facturation_casse: [
    'insurance_caution_high',
    'insurance_caution_low',
    'insurance_no_caution_high',
    'insurance_no_caution_low',
    'no_insurance_caution',
    'no_insurance_no_caution',
    'late_payment',
  ],
  facturation_perdu: [
    'insurance_caution',
    'insurance_no_caution',
    'no_insurance_caution',
    'no_insurance_no_caution',
    'late_payment',
  ],
  facturation_vole: [
    'insurance_caution_high',
    'insurance_caution_low',
    'insurance_no_caution_high',
    'insurance_no_caution_low',
    'no_insurance_caution',
    'no_insurance_no_caution',
    'late_payment',
  ],
}

// Labels des cas (source de vérité côté code)
const CASE_LABELS: Record<string, Record<string, string>> = {
  retour_casse: {
    insurance_caution:          'Avec assurance, avec caution',
    insurance_no_caution:       'Avec assurance, sans caution',
    no_insurance_caution:       'Sans assurance, avec caution',
    no_insurance_no_caution:    'Sans assurance, sans caution',
  },
}

// GET — retourne toutes les lignes groupées par template_id, seed si vide
export async function GET() {
  const supabase = getSupabaseAdmin()

  // Vérifie si la table est vide
  const { count } = await supabase
    .from('email_templates')
    .select('*', { count: 'exact', head: true })

  if (count === 0) {
    // Seed depuis les TypeScript defaults
    const rows = getSeedRows()
    await supabase.from('email_templates').insert(rows)
  }

  const { data, error } = await supabase
    .from('email_templates')
    .select('*')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Grouper par template_id
  const grouped: Record<string, {
    template_id: string
    label: string
    cases: typeof data
  }> = {}

  for (const row of data || []) {
    if (!grouped[row.template_id]) {
      grouped[row.template_id] = {
        template_id: row.template_id,
        label: EMAIL_TEMPLATE_LABELS[row.template_id as keyof typeof EMAIL_TEMPLATE_LABELS] || row.template_id,
        cases: [],
      }
    }
    // Surcharger case_label depuis la source de vérité côté code si disponible
    const overrideLabel = CASE_LABELS[row.template_id]?.[row.case_key]
    grouped[row.template_id].cases.push(overrideLabel ? { ...row, case_label: overrideLabel } : row)
  }

  // Trier les cas dans chaque groupe selon TEMPLATE_CASE_ORDER
  for (const templateId of Object.keys(grouped)) {
    const order = TEMPLATE_CASE_ORDER[templateId]
    if (order) {
      grouped[templateId].cases.sort((a, b) => {
        const ia = order.indexOf(a!.case_key)
        const ib = order.indexOf(b!.case_key)
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
      })
    } else {
      grouped[templateId].cases.sort((a, b) => (a!.sort_order ?? 0) - (b!.sort_order ?? 0))
    }
    // Ajouter le slug dérivé sur chaque cas
    grouped[templateId].cases = grouped[templateId].cases.map((c, i) => ({
      ...c!,
      slug: grouped[templateId].cases.length > 1 ? `${templateId}_cas_${i + 1}` : templateId,
    }))
  }

  // Trier les groupes selon TEMPLATE_GROUP_ORDER (#10 → #11 → #12)
  const sorted = TEMPLATE_GROUP_ORDER
    .map(id => grouped[id])
    .filter(Boolean)
    .concat(Object.values(grouped).filter(g => !TEMPLATE_GROUP_ORDER.includes(g.template_id)))

  return NextResponse.json(sorted)
}

// PATCH — met à jour subject et/ou body d'une variante
export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    template_id: string
    case_key: string
    subject?: string
    body?: string
  }

  if (!body.template_id || !body.case_key) {
    return NextResponse.json({ error: 'template_id et case_key requis' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const updates: Record<string, string> = { updated_at: new Date().toISOString() }
  if (body.subject !== undefined) updates.subject = body.subject
  if (body.body    !== undefined) updates.body    = body.body

  const { error } = await supabase
    .from('email_templates')
    .update(updates)
    .eq('template_id', body.template_id)
    .eq('case_key',    body.case_key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
