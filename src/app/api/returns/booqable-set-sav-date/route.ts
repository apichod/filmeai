import { NextRequest, NextResponse } from 'next/server'

const KEY       = process.env.BOOQABLE_API_KEY
const SUBDOMAIN = process.env.BOOQABLE_SUBDOMAIN || ''
const BASE      = `https://${SUBDOMAIN}.booqable.com/api/boomerang`

function bqHeaders() {
  return {
    Authorization:  `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Accept:         'application/json',
  }
}

/**
 * POST /api/returns/booqable-set-sav-date
 * Body: { order_id: string, date: string } — date au format YYYY-MM-DD
 *
 * 1. GET /api/boomerang/properties?filter[owner_id]= → trouve l'ID de l'instance date_sav
 * 2. PATCH order avec cet ID + valeur ISO datetime (format exact du frontend Booqable)
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as { order_id?: string; date?: string }
  const { order_id, date } = body

  if (!order_id || !date) {
    return NextResponse.json({ error: 'order_id et date requis' }, { status: 400 })
  }

  // ── Étape 1 : récupérer la liste des properties de cet order ─────────────────
  const propsUrl =
    `${BASE}/properties` +
    `?filter[owner_id]=${encodeURIComponent(order_id)}` +
    `&filter[owner_type]=Order`

  const propsRes = await fetch(propsUrl, {
    headers: bqHeaders(),
    signal:  AbortSignal.timeout(10000),
  })

  if (!propsRes.ok) {
    const text = await propsRes.text()
    return NextResponse.json({ error: `GET properties ${propsRes.status}: ${text}` }, { status: 502 })
  }

  type PropData = {
    id: string
    attributes: {
      identifier?:    string
      name?:          string
      property_type?: string
      show_on?:       string[]
      value?:         unknown
    }
  }
  const propsJson = await propsRes.json() as { data?: PropData[] }

  const dateSavProp = (propsJson.data ?? []).find(
    p => p.attributes?.identifier === 'date_sav' || p.attributes?.name === 'Date suivi SAV'
  )

  if (!dateSavProp) {
    return NextResponse.json({
      error:  'Propriété date_sav introuvable',
      debug:  { count: propsJson.data?.length ?? 0, props: propsJson.data?.map(p => p.attributes?.identifier ?? p.attributes?.name) },
    }, { status: 404 })
  }

  // ── Étape 2 : PATCH order avec l'ID exact de la property ─────────────────────
  const propEntry = {
    id:            dateSavProp.id,
    property_type: dateSavProp.attributes.property_type ?? 'date_field',
    name:          dateSavProp.attributes.name ?? 'Date suivi SAV',
    show_on:       dateSavProp.attributes.show_on ?? [],
    value:         `${date}T12:00:00.000Z`,
  }

  const patchRes = await fetch(`${BASE}/orders/${order_id}`, {
    method:  'PATCH',
    headers: bqHeaders(),
    body:    JSON.stringify({ order: { properties_attributes: [propEntry] } }),
    signal:  AbortSignal.timeout(10000),
  })

  if (!patchRes.ok) {
    const text = await patchRes.text()
    return NextResponse.json({ error: `PATCH order ${patchRes.status}: ${text}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, date })
}
