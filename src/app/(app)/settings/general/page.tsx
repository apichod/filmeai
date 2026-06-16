'use client'
import { useState } from 'react'

export default function SettingsGeneralPage() {
  const [name, setName] = useState('Aurelien')
  const [email] = useState('aurelien@filme.fr')
  const [company, setCompany] = useState('Filme')
  const [website, setWebsite] = useState('https://filme.fr')

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900">Informations du compte</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            value={email}
            readOnly
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">L&apos;email ne peut pas être modifié ici.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Entreprise</label>
          <input
            value={company}
            onChange={e => setCompany(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Site web</label>
          <input
            value={website}
            onChange={e => setWebsite(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder="https://exemple.fr"
          />
        </div>

        <button className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors">
          Sauvegarder
        </button>
      </div>
    </div>
  )
}
