'use client'
import { useState } from 'react'

export default function AssistantAppearancePage() {
  const [name, setName] = useState('FilmeAI')
  const [greeting, setGreeting] = useState('Bonjour ! Je suis FilmeAI, l\'assistant de Filme. Comment puis-je vous aider pour votre location de matériel audiovisuel ?')
  const [color, setColor] = useState('#000000')

  return (
    <div className="max-w-xl space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900">Identité du widget</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l&apos;assistant</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message d&apos;accueil</label>
          <textarea
            value={greeting}
            onChange={e => setGreeting(e.target.value)}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Couleur principale</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
            />
            <span className="text-sm text-gray-600 font-mono">{color}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Aperçu du widget</h2>
        <div className="flex justify-end">
          <div className="w-72 border border-gray-200 rounded-xl overflow-hidden shadow-lg">
            <div className="p-3 text-white text-sm font-medium" style={{ backgroundColor: color }}>
              {name}
            </div>
            <div className="p-3 bg-gray-50">
              <div className="bg-white rounded-lg p-2.5 text-xs text-gray-700 border border-gray-100">
                {greeting}
              </div>
            </div>
          </div>
        </div>
      </div>

      <button className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors">
        Sauvegarder
      </button>
    </div>
  )
}
