'use client'
import { useState } from 'react'

export default function AssistantBehaviorPage() {
  const [tone, setTone] = useState('professionnel')
  const [language, setLanguage] = useState('fr')
  const [autoQuote, setAutoQuote] = useState(true)
  const [askAvailability, setAskAvailability] = useState(true)

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900">Personnalité</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ton de l&apos;assistant</label>
          <select
            value={tone}
            onChange={e => setTone(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="professionnel">Professionnel</option>
            <option value="amical">Amical</option>
            <option value="formel">Formel</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Langue principale</label>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Comportements automatiques</h2>

        {[
          { label: 'Générer automatiquement un devis', desc: 'L\'assistant propose un devis dès qu\'il identifie les besoins du client.', value: autoQuote, set: setAutoQuote },
          { label: 'Vérifier la disponibilité', desc: 'Demander les dates souhaitées avant de proposer un devis.', value: askAvailability, set: setAskAvailability },
        ].map(item => (
          <div key={item.label} className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">{item.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
            </div>
            <button
              onClick={() => item.set(!item.value)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 mt-0.5 ${item.value ? 'bg-black' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${item.value ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>
        ))}
      </div>

      <button className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors">
        Sauvegarder
      </button>
    </div>
  )
}
