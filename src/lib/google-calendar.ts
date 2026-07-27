/**
 * Google Calendar — création d'événements via Service Account.
 * Implémentation sans googleapis : JWT + fetch natif (zéro dépendance webpack).
 *
 * Env vars requises :
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — JSON complet du service account Google
 *   GOOGLE_CALENDAR_ID           — ID du calendrier cible (défaut: location@filme.fr)
 */

import crypto from 'crypto'

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? 'location@filme.fr'

function base64url(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function getAccessToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON non défini dans les variables d\'environnement')

  const sa = JSON.parse(raw) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  }))

  const signInput  = `${header}.${claims}`
  const privateKey = crypto.createPrivateKey(sa.private_key)
  const signature  = base64url(crypto.sign('RSA-SHA256', Buffer.from(signInput), privateKey))
  const jwt        = `${signInput}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google OAuth error ${res.status}: ${text}`)
  }

  const data = await res.json() as { access_token: string }
  return data.access_token
}

export type CalendarEventInput = {
  summary:      string
  location?:    string
  description?: string
  startIso:     string   // ISO 8601 avec timezone, ex: "2025-08-15T09:30:00+02:00"
  endIso:       string
  timeZone?:    string   // défaut: "Europe/Paris"
}

export async function createCalendarEvent(event: CalendarEventInput): Promise<{
  eventId:  string
  htmlLink: string
}> {
  const token = await getAccessToken()
  const tz    = event.timeZone ?? 'Europe/Paris'

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary:     event.summary,
        location:    event.location,
        description: event.description,
        start: { dateTime: event.startIso, timeZone: tz },
        end:   { dateTime: event.endIso,   timeZone: tz },
      }),
      signal: AbortSignal.timeout(10000),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Calendar error ${res.status}: ${text}`)
  }

  const data = await res.json() as { id?: string; htmlLink?: string }
  if (!data.id) throw new Error('Google Calendar : événement créé sans id')

  return {
    eventId:  data.id,
    htmlLink: data.htmlLink ?? 'https://calendar.google.com',
  }
}
