/**
 * Constantes partagées du moteur de matching.
 * Source unique pour les listes de modèles et les seuils de décision.
 * Modifier ici suffit — aucun autre fichier ne doit redéfinir ces listes.
 */

// ── Modèles caméra connus ─────────────────────────────────────────────────────
// Utilisé dans text.ts, signals.ts, safety.ts pour détecter les références précises.
export const CAMERA_MODELS = [
  'fx3', 'fx6', 'fx9', 'fx30',
  'c50', 'c70', 'c80', 'c300', 'c400', 'c500',
  'r5c', 'r5', 'r6',
  'komodo', 'pyxis',
] as const

export const CAMERA_MODELS_PATTERN = CAMERA_MODELS.join('|')
export const CAMERA_MODELS_RE = new RegExp(`\\b(${CAMERA_MODELS_PATTERN})\\b`)

// ── Montures objectifs ────────────────────────────────────────────────────────
export const SONY_BODIES_RE = /\b(fx3|fx6|fx9|fx30)\b/
export const CANON_RF_BODIES_RE = /\b(c400|c50|c80)\b/
export const CANON_EF_BODIES_RE = /\b(c300|c500)\b/
export const CANON_C70_RE = /\bc70\b/

// ── Seuils de décision ────────────────────────────────────────────────────────
export const MIN_SIMILARITY = 0.16
export const MIN_RERANK_CONFIDENCE = 0.5
export const MIN_DETERMINISTIC_ACCEPT = 1.25
