import {
  DEFAULT_QUOTE_EXTRACTION_PROMPT,
  DEFAULT_QUOTE_RERANK_PROMPT,
  normalizeEditablePrompt,
  splitQuoteBackendPrompt,
} from '@/lib/defaultAssistantPrompts'
import { getDefaultOrganizationId, getSupabaseAdmin } from './db'
import type { AssistantPromptSettings } from './types'

export async function getQuotePrompts(): Promise<{ extractionPrompt: string; rerankPrompt: string }> {
  try {
    const organizationId = await getDefaultOrganizationId()
    if (!organizationId) {
      return {
        extractionPrompt: DEFAULT_QUOTE_EXTRACTION_PROMPT,
        rerankPrompt: DEFAULT_QUOTE_RERANK_PROMPT,
      }
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('assistant_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    const settings = (data || {}) as AssistantPromptSettings
    const legacyPrompts = splitQuoteBackendPrompt(settings.quote_backend_prompt)
    return {
      extractionPrompt: normalizeEditablePrompt(settings.quote_extraction_prompt, legacyPrompts.extractionPrompt),
      rerankPrompt: normalizeEditablePrompt(settings.quote_rerank_prompt, legacyPrompts.rerankPrompt),
    }
  } catch (err) {
    console.warn('Quote backend prompt fallback:', err instanceof Error ? err.message : String(err))
    return {
      extractionPrompt: DEFAULT_QUOTE_EXTRACTION_PROMPT,
      rerankPrompt: DEFAULT_QUOTE_RERANK_PROMPT,
    }
  }
}
