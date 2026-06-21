/**
 * Structure tarifaire Booqable — paliers de prix selon la durée de location.
 *
 * Le prix total d'une location = prix_jour_base × multiplicateur(jours)
 * Ex. 100€/j × 3 jours = 100 × 2.00 = 200€ HT
 *     100€/j × 7 jours = 100 × 3.85 = 385€ HT
 *     100€/j × 14 jours = 100 × 6.75 = 675€ HT
 *
 * Les paliers correspondent à la Price Structure configurée dans Booqable.
 */

export const PRICE_TIERS: { days: number; mul: number }[] = [
  { days: 1,  mul: 1.00 }, { days: 2,  mul: 1.50 }, { days: 3,  mul: 2.00 },
  { days: 4,  mul: 2.50 }, { days: 5,  mul: 2.95 }, { days: 6,  mul: 3.40 },
  { days: 7,  mul: 3.85 }, { days: 8,  mul: 4.30 }, { days: 9,  mul: 4.75 },
  { days: 10, mul: 5.15 }, { days: 11, mul: 5.55 }, { days: 12, mul: 5.95 },
  { days: 13, mul: 6.35 }, { days: 14, mul: 6.75 }, { days: 15, mul: 7.10 },
  { days: 16, mul: 7.45 }, { days: 17, mul: 7.80 }, { days: 18, mul: 8.15 },
  { days: 19, mul: 8.50 }, { days: 20, mul: 8.80 }, { days: 21, mul: 9.10 },
  { days: 22, mul: 9.40 }, { days: 23, mul: 9.70 }, { days: 24, mul: 10.00 },
]

/**
 * Retourne le multiplicateur pour N jours de location.
 * Pour >24 jours : extrapolation à +0.30 par jour supplémentaire.
 */
export function getTierMultiplier(days: number): number {
  if (days <= 0) return PRICE_TIERS[0].mul
  if (days <= 24) return PRICE_TIERS[days - 1].mul
  return 10.00 + (days - 24) * 0.30
}

/**
 * Prix total d'une ligne = prix_jour_base × quantité × multiplicateur(jours).
 * Retourne 0 si pricePerDay ou days est absent/nul.
 */
export function lineTotal(pricePerDay: number | null | undefined, qty: number, days: number): number {
  if (!pricePerDay || !days) return 0
  return pricePerDay * qty * getTierMultiplier(days)
}

/** Formate un prix en euros avec 2 décimales. */
export function formatPrice(amount: number): string {
  return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
