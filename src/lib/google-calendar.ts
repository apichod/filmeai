/**
 * Google Calendar — création d'événements via Service Account.
 *
 * Env vars requises :
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — JSON complet du service account Google
 *   GOOGLE_CALENDAR_ID           — ID du calendrier cible (défaut: location@filme.fr)
 *
 * Pour autoriser le service account à écrire dans le calendrier :
 *   Google Calendar → Paramètres du calendrier → Partager avec des personnes
 *   → Ajouter l'email du service account avec permission "Apporter des modifications aux événements"
 */

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? 'location@filme.fr'
const SCOPES      = ['https://www.googleapis.com/auth/calendar.events']

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
  // Import dynamique — évite que webpack tente de bundler googleapis
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { google } = await import('googleapis')

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON non défini dans les variables d\'environnement')
  const credentials = JSON.parse(raw) as object

  const auth     = new google.auth.GoogleAuth({ credentials, scopes: SCOPES })
  const calendar = google.calendar({ version: 'v3', auth })
  const tz       = event.timeZone ?? 'Europe/Paris'

  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary:     event.summary,
      location:    event.location,
      description: event.description,
      start: { dateTime: event.startIso, timeZone: tz },
      end:   { dateTime: event.endIso,   timeZone: tz },
    },
  })

  const data = res.data
  if (!data.id) throw new Error('Google Calendar : event créé sans id')

  return {
    eventId:  data.id,
    htmlLink: data.htmlLink ?? 'https://calendar.google.com',
  }
}
