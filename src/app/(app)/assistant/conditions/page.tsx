'use client'
import { useState } from 'react'

export default function AssistantConditionsPage() {
  const [minDays, setMinDays] = useState('1')
  const [maxDays, setMaxDays] = useState('30')
  const [deposit, setDeposit] = useState('30')
  const [cancellation, setCancellation] = useState('48h avant la date de début')

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900">Conditions de location</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Durée minimale (jours)</label>
            <input
              type="number"
              value={minDays}
              onChange={e => setMinDays(e.target.value)}
              min="1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Durée maximale (jours)</label>
            <input
              type="number"
              value={maxDays}
              onChange={e => setMaxDays(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Acompte requis (%)</label>
          <input
            type="number"
            value={deposit}
            onChange={e => setDeposit(e.target.value)}
            min="0"
            max="100"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Politique d&apos;annulation</label>
          <input
            value={cancellation}
            onChange={e => setCancellation(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Zones de livraison</h2>
        {['Paris intramuros', 'Île-de-France', 'France entière (frais de port)'].map(zone => (
          <label key={zone} className="flex items-center gap-3 text-sm text-gray-700">
            <input type="checkbox" defaultChecked={zone !== 'France entière (frais de port)'} className="rounded border-gray-300 accent-black" />
            {zone}
          </label>
        ))}
      </div>

      <button className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors">
        Sauvegarder
      </button>
    </div>
  )
}
