import { NextRequest, NextResponse } from 'next/server'
import { parseQuoteRequest, type ParseQuoteRequestBody } from '@/lib/catalog-matching/quoteMatchingEngine'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ParseQuoteRequestBody
    const result = await parseQuoteRequest(body)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('parse-request error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
