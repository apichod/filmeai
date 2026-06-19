-- Migration 018 : add opening_hours JSONB column to assistant_settings
ALTER TABLE public.assistant_settings
  ADD COLUMN IF NOT EXISTS opening_hours JSONB;
