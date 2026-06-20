-- Migration 024 : heures par défaut de prise en charge et de retour
ALTER TABLE public.assistant_settings
  ADD COLUMN IF NOT EXISTS default_pickup_time TEXT DEFAULT '14:00',
  ADD COLUMN IF NOT EXISTS default_return_time TEXT DEFAULT '13:00';
