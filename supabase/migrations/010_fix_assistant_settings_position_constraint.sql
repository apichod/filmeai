-- Migration 010: corrige la contrainte position d'assistant_settings
-- Ancien schéma probable : bottom_right / bottom_left
-- Nouveau code : right / left

ALTER TABLE public.assistant_settings
  DROP CONSTRAINT IF EXISTS assistant_settings_position_check;

UPDATE public.assistant_settings
SET position = CASE
  WHEN position IN ('left', 'bottom_left') THEN 'left'
  ELSE 'right'
END
WHERE position IS NULL
   OR position NOT IN ('left', 'right');

ALTER TABLE public.assistant_settings
  ALTER COLUMN position SET DEFAULT 'right',
  ALTER COLUMN position SET NOT NULL;

ALTER TABLE public.assistant_settings
  ADD CONSTRAINT assistant_settings_position_check
  CHECK (position IN ('left', 'right'));

-- Force Supabase/PostgREST à recharger son cache de schéma.
NOTIFY pgrst, 'reload schema';
