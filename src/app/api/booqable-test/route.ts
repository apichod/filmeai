import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const subdomain = process.env.BOOQABLE_SUBDOMAIN
    const apiKey = process.env.BOOQABLE_API_KEY

    if (!subdomain || !apiKey) {
      return NextResponse.json({ error: 'Configuration Booqable manquante.' }, { status: 400 })
    }

    const url = `https://${subdomain}.booqable.com/api/1/product_groups?per=1`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Booqable a répondu ${res.status}` }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
