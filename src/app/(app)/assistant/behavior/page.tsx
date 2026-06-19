'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  DEFAULT_CHAT_SECTIONS,
  DEFAULT_CHAT_IDENTITY,
  DEFAULT_CHAT_FLOW,
  DEFAULT_CHAT_STYLE,
  DEFAULT_CHAT_COMPAT,
  DEFAULT_CHAT_RULES,
  DEFAULT_CHAT_INFO,
  DEFAULT_QUOTE_EXTRACTION_PROMPT,
  DEFAULT_QUOTE_RERANK_PROMPT,
  DEFAULT_SYSTEM_PROMPT_DISPONIBILITE,
  DEFAULT_SYSTEM_PROMPT_TECHNIQUE,
  assembleChatPrompt,
  splitChatPrompt,
  normalizeEditablePrompt,
  splitQuoteBackendPrompt,
  type ChatSections,
} from '@/lib/defaultAssistantPrompts'

type Tab = 'devis' | 'disponibilite' | 'technique' | 'avance'

type Settings = {
  language: string
  greeting_message: string
  chatSections: ChatSections
  chat_system_prompt_disponibilite: string
  chat_system_prompt_technique: string
  quote_extraction_prompt: string
  quote_rerank_prompt: string
  forbidden_topics: string[]
}

type ApiSettings = {
  language?: string
  greeting_message?: string
  chat_system_prompt?: string | null
  chat_system_prompt_disponibilite?: string | null
  chat_system_prompt_technique?: string | null
  quote_extraction_prompt?: string | null
  quote_rerank_prompt?: string | null
  quote_backend_prompt?: string | null
  forbidden_topics?: string[]
}

const defaults: Settings = {
  language: 'fr',
  greeting_message: '',
  chatSections: DEFAULT_CHAT_SECTIONS,
  chat_system_prompt_disponibilite: DEFAULT_SYSTEM_PROMPT_DISPONIBILITE,
  chat_system_prompt_technique: DEFAULT_SYSTEM_PROMPT_TECHNIQUE,
  quote_extraction_prompt: DEFAULT_QUOTE_EXTRACTION_PROMPT,
  quote_rerank_prompt: DEFAULT_QUOTE_RERANK_PROMPT,
  forbidden_topics: [],
}

function topicsToText(topics: string[]) { return topics.join('\n') }
function textToTopics(value: string) {
  return value.split('\n').map(l => l.trim()).filter(Boolean)
    .filter((l, i, a) => a.indexOf(l) === i)
}

type SectionConfig = {
  key: keyof ChatSections
  label: string
  description: string
  rows: number
  defaultValue: string
}

const DEVIS_SECTIONS: SectionConfig[] = [
  { key: 'identity', label: 'Identité & ton', description: "Qui est l'assistant, son rôle, son ton général.", rows: 4, defaultValue: DEFAULT_CHAT_IDENTITY },
  { key: 'flow', label: 'Étapes de conversation', description: 'Le déroulé et les signaux [SEARCH:] / [CREATE_QUOTE] qui déclenchent les outils backend.', rows: 8, defaultValue: DEFAULT_CHAT_FLOW },
  { key: 'style', label: 'Style de réponse', description: 'Comment formuler les réponses selon les situations.', rows: 8, defaultValue: DEFAULT_CHAT_STYLE },
  { key: 'compat', label: 'Compatibilité montures', description: 'Vérifications caméra ↔ optiques avant émission du devis (E-mount, EF, PL, adaptateurs).', rows: 10, defaultValue: DEFAULT_CHAT_COMPAT },
  { key: 'rules', label: 'Règles', description: "Ce que l'assistant ne doit jamais faire ou dire.", rows: 6, defaultValue: DEFAULT_CHAT_RULES },
  { key: 'info', label: 'Infos pratiques', description: 'Adresse, email, spécialités, zones de livraison, horaires, etc.', rows: 5, defaultValue: DEFAULT_CHAT_INFO },
]

function TabButton({ id, active, label, onClick }: { id: Tab; active: boolean; label: string; onClick: (t: Tab) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
    >
      {label}
    </button>
  )
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">
      Réinitialiser
    </button>
  )
}

export default function AssistantBehaviorPage() {
  const [s, setS] = useState<Settings>(defaults)
  const [tab, setTab] = useState<Tab>('devis')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetch('/api/assistant-settings')
      .then(r => r.json())
      .then((d: { settings?: ApiSettings }) => {
        if (!d.settings) return
        const legacyPrompts = splitQuoteBackendPrompt(d.settings.quote_backend_prompt)
        const rawChat = normalizeEditablePrompt(d.settings.chat_system_prompt, assembleChatPrompt(DEFAULT_CHAT_SECTIONS))
        setS(prev => ({
          ...prev,
          language: d.settings?.language ?? prev.language,
          greeting_message: d.settings?.greeting_message ?? prev.greeting_message,
          chatSections: splitChatPrompt(rawChat),
          chat_system_prompt_disponibilite: normalizeEditablePrompt(d.settings?.chat_system_prompt_disponibilite, DEFAULT_SYSTEM_PROMPT_DISPONIBILITE),
          chat_system_prompt_technique: normalizeEditablePrompt(d.settings?.chat_system_prompt_technique, DEFAULT_SYSTEM_PROMPT_TECHNIQUE),
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

  function setSection(key: keyof ChatSections, val: string) {
    setS(prev => ({ ...prev, chatSections: { ...prev.chatSections, [key]: val } }))
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const res = await fetch('/api/assistant-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: s.language,
          greeting_message: s.greeting_message,
          internal_persona: '',
          chat_system_prompt: assembleChatPrompt(s.chatSections),
          chat_system_prompt_disponibilite: s.chat_system_prompt_disponibilite,
          chat_system_prompt_technique: s.chat_system_prompt_technique,
          quote_extraction_prompt: s.quote_extraction_prompt,
          quote_rerank_prompt: s.quote_rerank_prompt,
          forbidden_topics: s.forbidden_topics,
        }),
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

  const devisChars = assembleChatPrompt(s.chatSections).length

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

      {/* Comportement — tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-1 p-3 border-b border-gray-100 bg-gray-50">
          <TabButton id="devis" active={tab === 'devis'} label="Devis" onClick={setTab} />
          <TabButton id="disponibilite" active={tab === 'disponibilite'} label="Disponibilité" onClick={setTab} />
          <TabButton id="technique" active={tab === 'technique'} label="Question technique" onClick={setTab} />
          <TabButton id="avance" active={tab === 'avance'} label="Avancé" onClick={setTab} />
        </div>

        <div className="p-6">

          {/* ── Tab Devis ─────────────────────────────────────────────────── */}
          {tab === 'devis' && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-500">
                    Activé quand le visiteur clique <strong>Faire un devis</strong>. Gère la collecte d&apos;infos, la recherche catalogue, la compatibilité montures et la création du devis.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-gray-400">{devisChars.toLocaleString('fr-FR')} car.</span>
                  <ResetButton onClick={() => set('chatSections', DEFAULT_CHAT_SECTIONS)} />
                </div>
              </div>
              <div className="space-y-5 divide-y divide-gray-100">
                {DEVIS_SECTIONS.map(({ key, label, description, rows, defaultValue }) => (
                  <div key={key} className="pt-5 first:pt-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">{label}</label>
                        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                      </div>
                      <ResetButton onClick={() => setSection(key, defaultValue)} />
                    </div>
                    <textarea
                      value={s.chatSections[key]}
                      onChange={e => setSection(key, e.target.value)}
                      rows={rows}
                      spellCheck={false}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-black resize-y"
                    />
                    <p className="mt-1 text-[11px] text-gray-400">{s.chatSections[key].length.toLocaleString('fr-FR')} caractères</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tab Disponibilité ─────────────────────────────────────────── */}
          {tab === 'disponibilite' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <p className="text-xs text-gray-500">
                  Activé quand le visiteur clique <strong>Vérifier une disponibilité</strong>. L&apos;assistant collecte les dates et le matériel, recherche le catalogue, et indique que la disponibilité réelle sera confirmée par Filme.
                </p>
                <ResetButton onClick={() => set('chat_system_prompt_disponibilite', DEFAULT_SYSTEM_PROMPT_DISPONIBILITE)} />
              </div>
              <textarea
                value={s.chat_system_prompt_disponibilite}
                onChange={e => set('chat_system_prompt_disponibilite', e.target.value)}
                rows={22}
                spellCheck={false}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-black resize-y"
              />
              <p className="text-[11px] text-gray-400">{s.chat_system_prompt_disponibilite.length.toLocaleString('fr-FR')} caractères</p>
            </div>
          )}

          {/* ── Tab Technique ─────────────────────────────────────────────── */}
          {tab === 'technique' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <p className="text-xs text-gray-500">
                  Activé quand le visiteur clique <strong>Question technique</strong>. L&apos;assistant répond via la base de connaissances FAQ et peut proposer de passer en mode devis.
                </p>
                <ResetButton onClick={() => set('chat_system_prompt_technique', DEFAULT_SYSTEM_PROMPT_TECHNIQUE)} />
              </div>
              <textarea
                value={s.chat_system_prompt_technique}
                onChange={e => set('chat_system_prompt_technique', e.target.value)}
                rows={22}
                spellCheck={false}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-black resize-y"
              />
              <p className="text-[11px] text-gray-400">{s.chat_system_prompt_technique.length.toLocaleString('fr-FR')} caractères</p>
            </div>
          )}

          {/* ── Tab Avancé ────────────────────────────────────────────────── */}
          {tab === 'avance' && (
            <div className="space-y-6">
              <p className="text-xs text-gray-500">
                Prompts backend utilisés pour interpréter les listes matériel. Doivent conserver une sortie JSON valide.
              </p>
              <div>
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Extraction liste</label>
                    <p className="text-xs text-gray-500 mt-0.5">Transforme un message client en lignes produit structurées, avec quantités, ordre et sections.</p>
                  </div>
                  <ResetButton onClick={() => set('quote_extraction_prompt', DEFAULT_QUOTE_EXTRACTION_PROMPT)} />
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
                    <label className="block text-sm font-medium text-gray-700">Reranking catalogue</label>
                    <p className="text-xs text-gray-500 mt-0.5">Choisit le meilleur produit parmi les candidats du moteur hybride, sans inventer.</p>
                  </div>
                  <ResetButton onClick={() => set('quote_rerank_prompt', DEFAULT_QUOTE_RERANK_PROMPT)} />
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
          )}

        </div>
      </div>

      {/* Garde-fous */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Garde-fous</h2>
          <p className="text-xs text-gray-500 mt-0.5">Une règle par ligne, injectée dans les 3 prompts au moment de répondre.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Règles et sujets à éviter</label>
          <textarea
            value={topicsToText(s.forbidden_topics)}
            onChange={e => set('forbidden_topics', textToTopics(e.target.value))}
            rows={6}
            placeholder={"ex:\npolitique\nconcurrents directs\nne jamais promettre une disponibilité sans vérification\nne pas accorder de remise sans validation humaine"}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-y"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            {s.forbidden_topics.length} règle{s.forbidden_topics.length !== 1 ? 's' : ''} active{s.forbidden_topics.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Erreur : {error}</p>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {saved ? 'Sauvegardé ✓' : saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  )
}
