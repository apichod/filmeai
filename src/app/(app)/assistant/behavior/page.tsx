'use client'
import { useState, useEffect, useCallback } from 'react'

type Settings = {
  language: string
  greeting_message: string
  internal_persona: string
  forbidden_topics: string[]
}

const defaults: Settings = {
  language: 'fr',
  greeting_message: '',
  internal_persona: '',
  forbidden_topics: [],
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${value ? 'bg-black' : 'bg-gray-200'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  )
}

export default function AssistantBehaviorPage() {
  const [s, setS] = useState<Settings>(defaults)
  const [topicInput, setTopicInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    fetch('/api/assistant-settings')
      .then(r => r.json())
      .then((d: { settings?: Settings }) => { if (d.settings) setS(prev => ({ ...prev, ...d.settings })) })
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
    await fetch('/api/assistant-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl space-y-5">

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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Persona interne</label>
          <p className="text-xs text-gray-500 mb-2">Instructions privées sur le ton et le comportement de l&apos;assistant. Non visible par les visiteurs.</p>
          <textarea
            value={s.internal_persona}
            onChange={e => set('internal_persona', e.target.value)}
            rows={4}
            placeholder="Tu es l'assistant de Filme, une société de location de matériel audiovisuel à Paris. Tu es professionnel, concis et à l'écoute. Tu proposes toujours un devis adapté aux besoins."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
          />
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

      <button onClick={save} disabled={saving}
        className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
        {saved ? 'Sauvegardé ✓' : saving ? 'Sauvegarde…' : 'Sauvegarder'}
      </button>
    </div>
  )
}
