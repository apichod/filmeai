'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  DEFAULT_CHAT_SYSTEM_PROMPT,
  DEFAULT_QUOTE_EXTRACTION_PROMPT,
  DEFAULT_QUOTE_RERANK_PROMPT,
  normalizeEditablePrompt,
  splitQuoteBackendPrompt,
} from '@/lib/defaultAssistantPrompts'

type Settings = {
  language: string
  greeting_message: string
  chat_system_prompt: string
  quote_extraction_prompt: string
  quote_rerank_prompt: string
  forbidden_topics: string[]
}

type ApiSettings = Partial<Settings> & {
  quote_backend_prompt?: string | null
}

const defaults: Settings = {
  language: 'fr',
  greeting_message: '',
  chat_system_prompt: DEFAULT_CHAT_SYSTEM_PROMPT,
  quote_extraction_prompt: DEFAULT_QUOTE_EXTRACTION_PROMPT,
  quote_rerank_prompt: DEFAULT_QUOTE_RERANK_PROMPT,
  forbidden_topics: [],
}


export default function AssistantBehaviorPage() {
  const [s, setS] = useState<Settings>(defaults)
  const [topicInput, setTopicInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetch('/api/assistant-settings')
      .then(r => r.json())
      .then((d: { settings?: ApiSettings }) => {
        if (!d.settings) return
        const legacyPrompts = splitQuoteBackendPrompt(d.settings.quote_backend_prompt)
        setS(prev => ({
          ...prev,
          ...d.settings,
          chat_system_prompt: normalizeEditablePrompt(d.settings?.chat_system_prompt, DEFAULT_CHAT_SYSTEM_PROMPT),
          quote_extraction_prompt: normalizeEditablePrompt(d.settings?.quote_extraction_prompt, legacyPrompts.extractionPrompt),
          quote_rerank_prompt: normalizeEditablePrompt(d.settings?.quote_rerank_prompt, legacyPrompts.rerankPrompt),
          forbidden_topics: Array.isArray(d.settings?.forbidden_topics) ? d.settings.forbidden_topics : prev.forbidden_topics,
        }))
      })
  }, [])

  useEffect(() => { load() }, [load])

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setS(prev => ({ ...prev, [key]: val }))
  }

  function addTopic() {
    const t = topicInput.trim()
    if (!t || s.forbidden_topics.includes(t)) return
    set('forbidden_topics', [...s.forbidden_topics, t])
    setTopicInput('')
  }

  function removeTopic(topic: string) {
    set('forbidden_topics', s.forbidden_topics.filter(t => t !== topic))
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    setError('')

    try {
      const payload = {
        language: s.language,
        greeting_message: s.greeting_message,
        // internal_persona supprimé du flux actif : le prompt côté chat est désormais la source unique.
        internal_persona: '',
        chat_system_prompt: s.chat_system_prompt,
        quote_extraction_prompt: s.quote_extraction_prompt,
        quote_rerank_prompt: s.quote_rerank_prompt,
        forbidden_topics: s.forbidden_topics,
      }

      const res = await fetch('/api/assistant-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Sauvegarde impossible.')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sauvegarde impossible.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-5xl space-y-5">

      {/* Messages */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900">Messages</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Langue de réponse</label>
          <select
            value={s.language}
            onChange={e => set('language', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="auto">Automatique (langue du visiteur)</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">Message d&apos;accueil</label>
            <span className="text-xs text-gray-400">{s.greeting_message.length}/280</span>
          </div>
          <textarea
            value={s.greeting_message}
            onChange={e => set('greeting_message', e.target.value.slice(0, 280))}
            rows={4}
            placeholder="Bonjour ! Je suis FilmeAI, l'assistant de Filme. Dites-moi ce dont vous avez besoin pour votre tournage…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
          />
        </div>
      </div>

      {/* Prompts avancés */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Prompts avancés</h2>
          <p className="text-xs text-gray-500 mt-1">
            Ces instructions sont utilisées côté backend. Le prompt côté chat remplace l’ancien “Persona interne” : c’est la source unique pour le comportement conversationnel.
            Extraction et reranking doivent conserver une sortie JSON exploitable.
          </p>
        </div>

        <div>
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Prompt côté chat</label>
              <p className="text-xs text-gray-500 mt-0.5">
                Utilisé par l&apos;assistant conversationnel pour collecter les informations, poser les bonnes questions et déclencher les outils.
              </p>
            </div>
            <button
              type="button"
              onClick={() => set('chat_system_prompt', DEFAULT_CHAT_SYSTEM_PROMPT)}
              className="shrink-0 text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50"
            >
              Réinitialiser
            </button>
          </div>
          <textarea
            value={s.chat_system_prompt}
            onChange={e => set('chat_system_prompt', e.target.value)}
            rows={16}
            spellCheck={false}
            className="w-full font-mono border border-gray-200 rounded-lg px-3 py-2 text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-black resize-y"
          />
          <p className="mt-1 text-[11px] text-gray-400">{s.chat_system_prompt.length.toLocaleString('fr-FR')} caractères</p>
        </div>

        <div>
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Prompt extraction liste</label>
              <p className="text-xs text-gray-500 mt-0.5">
                Commun au chat et à /requests/new. Il transforme un message client en lignes produit structurées, avec quantités, ordre et sections.
              </p>
            </div>
            <button
              type="button"
              onClick={() => set('quote_extraction_prompt', DEFAULT_QUOTE_EXTRACTION_PROMPT)}
              className="shrink-0 text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50"
            >
              Réinitialiser
            </button>
          </div>
          <textarea
            value={s.quote_extraction_prompt}
            onChange={e => set('quote_extraction_prompt', e.target.value)}
            rows={22}
            spellCheck={false}
            className="w-full font-mono border border-gray-200 rounded-lg px-3 py-2 text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-black resize-y"
          />
          <p className="mt-1 text-[11px] text-gray-400">{s.quote_extraction_prompt.length.toLocaleString('fr-FR')} caractères</p>
        </div>

        <div>
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Prompt reranking catalogue</label>
              <p className="text-xs text-gray-500 mt-0.5">
                Commun au chat et à /requests/new. Il choisit le meilleur produit parmi les candidats du moteur hybride, sans inventer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => set('quote_rerank_prompt', DEFAULT_QUOTE_RERANK_PROMPT)}
              className="shrink-0 text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50"
            >
              Réinitialiser
            </button>
          </div>
          <textarea
            value={s.quote_rerank_prompt}
            onChange={e => set('quote_rerank_prompt', e.target.value)}
            rows={14}
            spellCheck={false}
            className="w-full font-mono border border-gray-200 rounded-lg px-3 py-2 text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-black resize-y"
          />
          <p className="mt-1 text-[11px] text-gray-400">{s.quote_rerank_prompt.length.toLocaleString('fr-FR')} caractères</p>
        </div>
      </div>

      {/* Garde-fous */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Garde-fous</h2>
          <p className="text-xs text-gray-500 mt-0.5">L&apos;assistant refusera de répondre à ces sujets ou de mentionner ces marques concurrentes.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Sujets &amp; marques interdits</label>
          {s.forbidden_topics.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {s.forbidden_topics.map(topic => (
                <span key={topic} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full">
                  {topic}
                  <button onClick={() => removeTopic(topic)} className="text-gray-400 hover:text-gray-700 leading-none">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTopic()}
              placeholder="ex: politique, concurrents, prix…"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <button
              onClick={addTopic}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              + Ajouter
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Erreur : {error}
          </p>
        )}
        <button onClick={save} disabled={saving}
          className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
          {saved ? 'Sauvegardé ✓' : saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  )
}
