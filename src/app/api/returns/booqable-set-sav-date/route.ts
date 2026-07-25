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
 * 1. GET order?include=properties → récupère l'ID de l'instance "date_sav"
 * 2. PATCH avec l'ID et la valeur en ISO datetime (format exact du frontend Booqable)
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as { order_id?: string; date?: string }
  const { order_id, date } = body

  if (!order_id || !date) {
    return NextResponse.json({ error: 'order_id et date requis' }, { status: 400 })
  }

  // ── Étape 1 : récupérer l'ID de la property date_sav sur cet order ───────────
  const getRes = await fetch(`${BASE}/orders/${order_id}?include=properties`, {
    headers: bqHeaders(),
    signal:  AbortSignal.timeout(10000),
  })
  if (!getRes.ok) {
    const text = await getRes.text()
    return NextResponse.json({ error: `GET order ${getRes.status}: ${text}` }, { status: 502 })
  }

  const getJson = await getRes.json() as Record<string, unknown>
  // Log temporaire pour debug — à retirer une fois le format confirmé
  console.log('[setSavDate] GET keys:', Object.keys(getJson))
  const includedRaw = Array.isArray(getJson.included) ? getJson.included : []
  console.log('[setSavDate] included:', JSON.stringify(includedRaw.slice(0, 3), null, 2))
  if (getJson.data && typeof getJson.data === 'object') {
    const d = getJson.data as Record<string, unknown>
    console.log('[setSavDate] data.attributes keys:', Object.keys((d.attributes as Record<string, unknown>) ?? {}))
    console.log('[setSavDate] data.relationships keys:', Object.keys((d.relationships as Record<string, unknown>) ?? {}))
  }

  type PropItem = { id: string; attributes?: { identifier?: string; name?: string }; identifier?: string; name?: string }

  // Cherche dans included (JSON:API) OU dans data.attributes.properties (boomerang flat)
  const included = (getJson.included ?? []) as PropItem[]
  let dateSavProp = included.find(
    p => p.attributes?.identifier === 'date_sav' || p.attributes?.name === 'Date suivi SAV'
         || p.identifier === 'date_sav' || p.name === 'Date suivi SAV'
  )

  // Fallback : cherche dans data.relationships.properties si disponible
  if (!dateSavProp) {
    return NextResponse.json({
      error:  'Propriété date_sav introuvable — voir logs Vercel pour la structure',
      debug:  {
        keys:     Object.keys(getJson),
        included: Array.isArray(getJson.included) ? getJson.included.slice(0, 2) : [],
      }
    }, { status: 404 })
  }

  // ── Étape 2 : PATCH avec l'ID et la valeur en ISO datetime ───────────────────
  const valueISO = `${date}T12:00:00.000Z`
  const propEntry = {
    id:            dateSavProp.id,
    property_type: 'date_field',
    name:          'Date suivi SAV',
    show_on:       [] as string[],
    value:         valueISO,
  }

  const patchRes = await fetch(`${BASE}/orders/${order_id}`, {
    method:  'PATCH',
    headers: bqHeaders(),
    body: JSON.stringify({
      order: { properties_attributes: [propEntry] },
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!patchRes.ok) {
    const text = await patchRes.text()
    return NextResponse.json({ error: `PATCH order ${patchRes.status}: ${text}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, date })
}
