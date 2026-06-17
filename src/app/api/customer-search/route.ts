import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q || q.trim().length < 2) return NextResponse.json([])

  const BOOQABLE_BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/1`
  const KEY = process.env.BOOQABLE_API_KEY

  try {
    const res = await fetch(
      `${BOOQABLE_BASE}/customers?api_key=${KEY}&q=${encodeURIComponent(q.trim())}&per=10`
    )
    if (!res.ok) throw new Error(`Booqable error: ${res.status}`)
    const data = await res.json() as {
      customers?: {
        id: string
        name: string
        email: string | null
        phone: string | null
      }[]
    }
    return NextResponse.json(data.customers || [])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('customer-search error:', msg)
    return NextResponse.json([])
  }
}
