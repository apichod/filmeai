-- Migration 025 : tarifs de livraison camion (gros volume)
ALTER TABLE public.assistant_settings
  ADD COLUMN IF NOT EXISTS delivery_fee_truck        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee_truck_return NUMERIC DEFAULT 0;
