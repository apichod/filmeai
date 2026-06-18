import { NextRequest, NextResponse } from 'next/server'

type CustomerType = 'person' | 'company'

type JsonObject = Record<string, unknown>

type BooqableCustomerOutput = {
  id: string
  name: string
  email: string | null
  phone: string | null
  customerType: CustomerType
  addressLine1: string | null
  addressLine2: string | null
  postalCode: string | null
  city: string | null
  country: string | null
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function pickString(source: JsonObject | null, keys: string[]): string | null {
  if (!source) return null
  for (const key of keys) {
    const value = str(source[key])
    if (value) return value
  }
  return null
}

function nestedObject(source: JsonObject | null, keys: string[]): JsonObject | null {
  if (!source) return null
  for (const key of keys) {
    const value = asObject(source[key])
    if (value) return value
  }
  return null
}

function normalizeCustomerType(value: string | null): CustomerType {
  const lowered = (value || '').toLowerCase()
  if (['company', 'business', 'organization', 'organisation', 'professional', 'professionnel'].some(token => lowered.includes(token))) {
    return 'company'
  }
  return 'person'
}

function mapCustomer(raw: unknown): BooqableCustomerOutput | null {
  const obj = asObject(raw)
  if (!obj) return null

  const attrs = asObject(obj.attributes)
  const source = attrs ? { ...obj, ...attrs } : obj
  const billingAddress = nestedObject(source, ['billing_address', 'address', 'main_address', 'default_address'])

  const id = str(source.id)
  const name = pickString(source, ['name', 'display_name', 'company_name', 'full_name'])
  if (!id || !name) return null

  return {
    id,
    name,
    email: pickString(source, ['email', 'email_address']) || pickString(billingAddress, ['email']),
    phone: pickString(source, ['phone', 'phone_number', 'mobile']) || pickString(billingAddress, ['phone']),
    customerType: normalizeCustomerType(pickString(source, ['customer_type', 'type', 'legal_type'])),
    addressLine1: pickString(source, ['address_line_1', 'address1', 'street', 'street_1']) || pickString(billingAddress, ['address_line_1', 'address1', 'street', 'street_1']),
    addressLine2: pickString(source, ['address_line_2', 'address2', 'street_2']) || pickString(billingAddress, ['address_line_2', 'address2', 'street_2']),
    postalCode: pickString(source, ['postal_code', 'postcode', 'zipcode', 'zip']) || pickString(billingAddress, ['postal_code', 'postcode', 'zipcode', 'zip']),
    city: pickString(source, ['city']) || pickString(billingAddress, ['city']),
    country: pickString(source, ['country', 'country_code']) || pickString(billingAddress, ['country', 'country_code']),
  }
}

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
    const data = await res.json() as { customers?: unknown[] }
    return NextResponse.json((data.customers || []).map(mapCustomer).filter(Boolean))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('customer-search error:', msg)
    return NextResponse.json([])
  }
}
