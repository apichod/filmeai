/**
 * Calcul des jours de location facturés selon les règles Booqable.
 *
 * Règles (fixées par le price ruleset Booqable, non modifiables) :
 *   - Jour de retrait : facturé si retrait AVANT 13h45, gratuit si APRÈS 13h45
 *   - Jour de retour  : facturé si retour APRÈS 13h15, gratuit si AVANT 13h15
 *
 * Formule :
 *   jours_calendaires = (endDate − startDate + 1)   ← inclusif start ET end
 *   billingDays = jours_calendaires
 *               − (pickupTime ≥ PICKUP_PIVOT ? 1 : 0)   ← retrait gratuit
 *               − (returnTime ≤ RETURN_PIVOT ? 1 : 0)   ← retour gratuit
 *   minimum 1 jour
 *
 * Exemple avec les heures par défaut (retrait 14h00, retour 13h00) :
 *   lundi 14h → mercredi 13h = 3 jours calendaires − 1 − 1 = 1 jour facturé
 */

/** Pivot Booqable pour le jour de retrait (avant = facturé, après = gratuit). */
export const PICKUP_PIVOT = '13:45'

/** Pivot Booqable pour le jour de retour (après = facturé, avant = gratuit). */
export const RETURN_PIVOT = '13:15'

/** Heures disponibles dans les sélecteurs (toutes les 30 min). */
export const RENTAL_HOURS: string[] = Array.from({ length: 24 }, (_, i) => {
  const h = String(i).padStart(2, '0')
  return [`${h}:00`, `${h}:30`]
}).flat()

/** Convertit "HH:MM" en minutes depuis minuit. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Nombre de jours facturés.
 * @param startDateStr  YYYY-MM-DD
 * @param pickupTime    HH:MM (heure de retrait)
 * @param endDateStr    YYYY-MM-DD
 * @param returnTime    HH:MM (heure de retour)
 */
export function billingDays(
  startDateStr: string,
  pickupTime: string,
  endDateStr: string,
  returnTime: string,
): number {
  if (!startDateStr || !endDateStr) return 1

  const start = new Date(startDateStr + 'T00:00:00')
  const end   = new Date(endDateStr   + 'T00:00:00')
  const dayDiff = Math.round((end.getTime() - start.getTime()) / 86_400_000)

  if (dayDiff < 0) return 1

  const pickupFree = timeToMinutes(pickupTime) >= timeToMinutes(PICKUP_PIVOT) ? 1 : 0
  const returnFree = timeToMinutes(returnTime) <= timeToMinutes(RETURN_PIVOT)  ? 1 : 0

  return Math.max(1, dayDiff + 1 - pickupFree - returnFree)
}

/**
 * Résumé lisible : "2 jours · retrait gratuit · retour gratuit"
 */
export function billingDaysSummary(
  startDateStr: string,
  pickupTime: string,
  endDateStr: string,
  returnTime: string,
): string {
  if (!startDateStr || !endDateStr) return ''

  const days = billingDays(startDateStr, pickupTime, endDateStr, returnTime)
  const pickupFree = timeToMinutes(pickupTime) >= timeToMinutes(PICKUP_PIVOT)
  const returnFree = timeToMinutes(returnTime) <= timeToMinutes(RETURN_PIVOT)

  const notes: string[] = []
  if (pickupFree) notes.push('retrait gratuit')
  if (returnFree) notes.push('retour gratuit')

  const label = `${days} jour${days > 1 ? 's' : ''}`
  return notes.length ? `${label} · ${notes.join(' · ')}` : label
}

/**
 * Construit un ISO datetime complet depuis une date YYYY-MM-DD et une heure HH:MM.
 * Utilise l'heure locale (pas UTC) pour correspondre au comportement Booqable.
 */
export function toLocalISOString(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00`).toISOString()
}
