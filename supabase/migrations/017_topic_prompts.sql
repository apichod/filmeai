-- Migration 017 : add topic-specific system prompts
ALTER TABLE public.assistant_settings
  ADD COLUMN IF NOT EXISTS chat_system_prompt_disponibilite TEXT,
  ADD COLUMN IF NOT EXISTS chat_system_prompt_technique TEXT,
  ADD COLUMN IF NOT EXISTS chat_system_prompt_general TEXT;
