-- ─────────────────────────────────────────────────────────────────────────────
-- 029_email_templates.sql
-- Bibliothèque de templates d'emails — une ligne par cas/variante
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_templates (
  template_id  TEXT    NOT NULL,
  case_key     TEXT    NOT NULL DEFAULT 'default',
  label        TEXT    NOT NULL,
  case_label   TEXT    NOT NULL DEFAULT '',
  subject      TEXT    NOT NULL DEFAULT '',
  body         TEXT    NOT NULL DEFAULT '',
  -- conditions de sélection du cas : {insurance, caution, amountAbove500, latePayment}
  conditions   JSONB   NOT NULL DEFAULT '{}',
  sort_order   INT     NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (template_id, case_key)
);

-- Index pour fetch rapide par template
CREATE INDEX IF NOT EXISTS email_templates_by_template
  ON email_templates (template_id, sort_order);
