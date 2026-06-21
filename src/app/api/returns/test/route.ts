import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const orderNumber = searchParams.get('order') || '1'

  const subdomain = process.env.BOOQABLE_SUBDOMAIN
  const key = process.env.BOOQABLE_API_KEY

  if (!subdomain || !key) {
    return NextResponse.json({ error: 'BOOQABLE_SUBDOMAIN ou BOOQABLE_API_KEY manquant' })
  }

  const url = `https://${subdomain}.booqable.com/api/1/orders?q=${encodeURIComponent(orderNumber)}&include=customer,lines&per=3`

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    const text = await res.text()
    let json: unknown
    try { json = JSON.parse(text) } catch { json = text }

    return NextResponse.json({
      status: res.status,
      url,
      subdomain,
      keyPrefix: key.slice(0, 8) + '…',
      response: json,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) })
  }
}
