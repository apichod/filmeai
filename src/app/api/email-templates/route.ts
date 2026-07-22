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

// Ordre d'affichage des groupes (#10 → #11a → #11b → #12a → #12b → #12c)
const TEMPLATE_GROUP_ORDER = [
  'retour_ok',
  'retour_manquant',
  'retour_casse',
  'facturation_perdu',
  'facturation_vole',
  'facturation_casse',
]

// Ordre des cas par template
const TEMPLATE_CASE_ORDER: Record<string, string[]> = {
  retour_casse: [
    'insurance_caution',
    'insurance_no_caution',
    'no_insurance_caution',
    'no_insurance_no_caution',
  ],
  facturation_perdu: [
    'insurance_caution',
    'insurance_no_caution',
    'no_insurance_caution',
    'no_insurance_no_caution',
    'late_payment',
  ],
  facturation_vole: [
    'insurance_caution_low',
    'insurance_caution_high',
    'insurance_no_caution_low',
    'insurance_no_caution_high',
    'no_insurance_caution',
    'no_insurance_no_caution',
    'late_payment',
  ],
  facturation_casse: [
    'insurance_caution_low',
    'insurance_caution_high',
    'insurance_no_caution_low',
    'insurance_no_caution_high',
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
  facturation_perdu: {
    insurance_caution:          'Avec assurance, avec caution',
    insurance_no_caution:       'Avec assurance, sans caution',
    no_insurance_caution:       'Sans assurance, avec caution',
    no_insurance_no_caution:    'Sans assurance, sans caution',
    late_payment:               'Retard de paiement',
  },
  facturation_vole: {
    insurance_caution_low:      'Avec assurance, avec caution, valeur < 500 €',
    insurance_caution_high:     'Avec assurance, avec caution, valeur > 500 €',
    insurance_no_caution_low:   'Avec assurance, sans caution, valeur < 500 €',
    insurance_no_caution_high:  'Avec assurance, sans caution, valeur > 500 €',
    no_insurance_caution:       'Sans assurance, avec caution',
    no_insurance_no_caution:    'Sans assurance, sans caution',
    late_payment:               'Retard de paiement',
  },
  facturation_casse: {
    insurance_caution_low:      'Avec assurance, avec caution, valeur < 500 €',
    insurance_caution_high:     'Avec assurance, avec caution, valeur > 500 €',
    insurance_no_caution_low:   'Avec assurance, sans caution, valeur < 500 €',
    insurance_no_caution_high:  'Avec assurance, sans caution, valeur > 500 €',
    no_insurance_caution:       'Sans assurance, avec caution',
    no_insurance_no_caution:    'Sans assurance, sans caution',
    late_payment:               'Retard de paiement',
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
        // Priorité : valeur DB (row.label) si renseignée, sinon fallback code
        label: row.label || EMAIL_TEMPLATE_LABELS[row.template_id as keyof typeof EMAIL_TEMPLATE_LABELS] || row.template_id,
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
    // Slug : utiliser la valeur DB si présente, sinon calculer le défaut
    grouped[templateId].cases = grouped[templateId].cases.map((c, i) => ({
      ...c!,
      slug: c!.slug || (grouped[templateId].cases.length > 1 ? `${templateId}_cas_${i + 1}` : templateId),
    }))
  }

  // Trier les groupes par préfixe numérique du label ("R00", "R11", "#12", "10 –" → 0, 11, 12, 10)
  function parseGroupNum(label: string): number {
    const m = (label || '').match(/^[R#]?(\d+)/)
    return m ? parseInt(m[1], 10) : 999
  }
  const sorted = Object.values(grouped).sort((a, b) => {
    const na = parseGroupNum(a.label)
    const nb = parseGroupNum(b.label)
    if (na !== nb) return na - nb
    const ia = TEMPLATE_GROUP_ORDER.indexOf(a.template_id)
    const ib = TEMPLATE_GROUP_ORDER.indexOf(b.template_id)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })

  return NextResponse.json(sorted)
}

// POST — crée un nouveau template ou une nouvelle variante
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    template_id: string
    case_key: string
    label: string
    case_label?: string
    subject?: string
    body?: string
    slug?: string
    sort_order?: number
  }

  if (!body.template_id || !body.case_key || !body.label) {
    return NextResponse.json({ error: 'template_id, case_key et label requis' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('email_templates')
    .insert({
      template_id: body.template_id,
      case_key:    body.case_key,
      label:       body.label,
      case_label:  body.case_label || '',
      subject:     body.subject || '',
      body:        body.body || '',
      conditions:  {},
      sort_order:  body.sort_order ?? 0,
      slug:        body.slug || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, row: data })
}

// PATCH — met à jour label (toutes les variantes), renomme template_id, ou subject/body/slug d'une variante
export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    template_id: string
    new_template_id?: string
    case_key?: string
    subject?: string
    body?: string
    label?: string
    slug?: string
  }

  if (!body.template_id) {
    return NextResponse.json({ error: 'template_id requis' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Renommage du template_id du groupe (toutes les variantes)
  if (body.new_template_id !== undefined) {
    const { error } = await supabase
      .from('email_templates')
      .update({ template_id: body.new_template_id, updated_at: new Date().toISOString() })
      .eq('template_id', body.template_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Mise à jour du label du groupe (toutes les variantes)
  if (body.label !== undefined) {
    const { error } = await supabase
      .from('email_templates')
      .update({ label: body.label, updated_at: new Date().toISOString() })
      .eq('template_id', body.template_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Mise à jour subject/body/slug d'une variante
  if (!body.case_key) {
    return NextResponse.json({ error: 'case_key requis pour subject/body/slug' }, { status: 400 })
  }
  const updates: Record<string, string> = { updated_at: new Date().toISOString() }
  if (body.subject !== undefined) updates.subject = body.subject
  if (body.body    !== undefined) updates.body    = body.body
  if (body.slug !== undefined) updates.slug = body.slug

  const { error } = await supabase
    .from('email_templates')
    .update(updates)
    .eq('template_id', body.template_id)
    .eq('case_key',    body.case_key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
