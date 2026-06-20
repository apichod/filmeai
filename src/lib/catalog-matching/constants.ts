/**
 * Constantes partagées du moteur de matching.
 * Les modèles caméra ne sont plus hardcodés ici — ils sont gérés par les prompts
 * éditables depuis /assistant/behavior.
 */

// ── Seuils de décision ────────────────────────────────────────────────────────
export const MIN_SIMILARITY = 0.16
export const MIN_RERANK_CONFIDENCE = 0.5
export const MIN_DETERMINISTIC_ACCEPT = 1.25
