-- Migration 018 : add opening_hours + delivery_fee_return to assistant_settings
ALTER TABLE public.assistant_settings
  ADD COLUMN IF NOT EXISTS opening_hours JSONB,
  ADD COLUMN IF NOT EXISTS delivery_fee_return NUMERIC DEFAULT 0;
