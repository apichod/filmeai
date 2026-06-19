-- Migration 019 : support brouillons de devis
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS booqable_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS contact_meta JSONB;
