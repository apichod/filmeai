'use client'
import { useState, useEffect } from 'react'

type Settings = {
  primary_color: string
  bubble_icon: string
  position: string
  size: string
  assistant_name: string
  show_teaser: boolean
  teaser_text: string
  teaser_delay: number
  attract_attention: boolean
  show_branding: boolean
}

const ICONS = [
  { value: 'bubble', label: 'Bulle' },
  { value: 'message', label: 'Message' },
  { value: 'sparkles', label: 'Étincelles' },
  { value: 'support', label: 'Support' },
  { value: 'quote', label: 'Devis' },
  { value: 'media', label: 'Photo/Vidéo' },
  { value: 'robot', label: 'Robot' },
  { value: 'question', label: 'Question' },
]

const ICON_PATHS: Record<string, string> = {
  bubble: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  message: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  sparkles: 'M5 3v4M3 5h4M6.343 17.657l-2.829 2.829M17.657 6.343l2.829-2.828M19 11v4m2-2h-4',
  support: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z',
  quote: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  media: 'M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  robot: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  question: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${value ? 'bg-black' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  )
}

function IconPreview({ icon, className = 'w-5 h-5' }: { icon: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={ICON_PATHS[icon] ?? ICON_PATHS.bubble} />
    </svg>
  )
}

const defaults: Settings = {
  primary_color: '#000000',
  bubble_icon: 'bubble',
  position: 'right',
  size: 'standard',
  assistant_name: 'FilmeAI',
  show_teaser: false,
  teaser_text: '',
  teaser_delay: 2,
  attract_attention: false,
  show_branding: true,
}

export default function AssistantAppearancePage() {
  const [s, setS] = useState<Settings>(defaults)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/assistant-settings')
      .then(r => r.json())
      .then((d: { settings?: Settings }) => { if (d.settings) setS(prev => ({ ...prev, ...d.settings })) })
  }, [])

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setS(prev => ({ ...prev, [key]: val }))
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

      {/* Couleur primaire */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Couleur primaire</h2>
          <p className="text-xs text-gray-500 mt-0.5">Couleur principale du widget et du bouton de chat.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="relative cursor-pointer">
            <input type="color" value={s.primary_color} onChange={e => set('primary_color', e.target.value)} className="sr-only" />
            <div className="w-10 h-10 rounded-lg border border-gray-200 shadow-sm" style={{ backgroundColor: s.primary_color }} />
          </label>
          <input
            value={s.primary_color}
            onChange={e => set('primary_color', e.target.value)}
            maxLength={7}
            className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
      </div>

      {/* Icône bulle */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Icône bulle</h2>
          <p className="text-xs text-gray-500 mt-0.5">L&apos;icône affichée dans le bouton flottant de votre widget.</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {ICONS.map(icon => (
            <button
              key={icon.value}
              type="button"
              onClick={() => set('bubble_icon', icon.value)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs transition-all ${
                s.bubble_icon === icon.value
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <IconPreview icon={icon.value} />
              {icon.label}
            </button>
          ))}
        </div>
      </div>

      {/* Position + Taille */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Position</h2>
          <div className="flex gap-2">
            {(['right', 'left'] as const).map(pos => (
              <button key={pos} type="button" onClick={() => set('position', pos)}
                className={`flex-1 py-2 text-sm rounded-lg border transition-all ${s.position === pos ? 'border-black bg-black text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {pos === 'right' ? 'Droite' : 'Gauche'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Taille</h2>
          <div className="flex gap-2">
            {([['standard', 'Standard'], ['large', 'Grande']] as [string, string][]).map(([val, label]) => (
              <button key={val} type="button" onClick={() => set('size', val)}
                className={`flex-1 py-2 text-sm rounded-lg border transition-all ${s.size === val ? 'border-black bg-black text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Nom de l'assistant */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Nom de l&apos;assistant</h2>
          <p className="text-xs text-gray-500 mt-0.5">Affiché en haut du widget et dans les messages.</p>
        </div>
        <input
          value={s.assistant_name}
          onChange={e => set('assistant_name', e.target.value)}
          maxLength={40}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      {/* Bulle d'accroche */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Bulle d&apos;accroche</h2>
            <p className="text-xs text-gray-500 mt-0.5">Un message qui apparaît au-dessus du bouton pour attirer l&apos;attention.</p>
          </div>
          <Toggle value={s.show_teaser} onChange={v => set('show_teaser', v)} />
        </div>

        {s.show_teaser && (
          <div className="space-y-4 pt-1 border-t border-gray-100">
            <div className="pt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">Texte</label>
                <span className="text-xs text-gray-400">{s.teaser_text.length}/60</span>
              </div>
              <input
                value={s.teaser_text}
                onChange={e => set('teaser_text', e.target.value.slice(0, 60))}
                placeholder="Besoin d'un devis ? Je suis là 👋"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Délai d&apos;apparition</label>
              <select
                value={s.teaser_delay}
                onChange={e => set('teaser_delay', Number(e.target.value))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
              >
                {[2, 4, 8, 15].map(d => <option key={d} value={d}>{d} secondes</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Attirer l&apos;attention</p>
                <p className="text-xs text-gray-500">Animation légère sur le bouton pour capter l&apos;œil.</p>
              </div>
              <Toggle value={s.attract_attention} onChange={v => set('attract_attention', v)} />
            </div>
          </div>
        )}
      </div>

      {/* Marque FilmeAI */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Marque FilmeAI</h2>
            <p className="text-xs text-gray-500 mt-0.5">Afficher « Propulsé par FilmeAI » dans le widget.</p>
          </div>
          <Toggle value={s.show_branding} onChange={v => set('show_branding', v)} />
        </div>
      </div>

      {/* Aperçu */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Aperçu</h2>
        <div className={`flex ${s.position === 'right' ? 'justify-end' : 'justify-start'}`}>
          <div className="relative">
            {s.show_teaser && s.teaser_text && (
              <div className="absolute bottom-16 right-0 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 shadow-lg whitespace-nowrap">
                {s.teaser_text}
              </div>
            )}
            <button
              className={`flex items-center justify-center rounded-full shadow-lg text-white ${s.size === 'large' ? 'w-16 h-16' : 'w-14 h-14'}`}
              style={{ backgroundColor: s.primary_color }}
            >
              <IconPreview icon={s.bubble_icon} className="w-6 h-6" />
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
