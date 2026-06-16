'use client'
import { useState } from 'react'

export default function SettingsSecurityPage() {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saved, setSaved] = useState(false)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
  }

  return (
    <div className="max-w-xl space-y-4">
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900">Changer le mot de passe</h2>

        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">
            Mot de passe mis à jour.
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe actuel</label>
          <input
            type="password"
            value={currentPw}
            onChange={e => setCurrentPw(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
          <input
            type="password"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            required
            minLength={8}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer le nouveau mot de passe</label>
          <input
            type="password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Mettre à jour
        </button>
      </form>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Sessions actives</h2>
        {[
          { device: 'MacBook Pro — Chrome', location: 'Paris, France', current: true, date: 'Maintenant' },
          { device: 'iPhone 15 — Safari', location: 'Paris, France', current: false, date: 'Il y a 2h' },
        ].map((s, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-t border-gray-50 first:border-0">
            <div>
              <p className="text-sm font-medium text-gray-900">{s.device}</p>
              <p className="text-xs text-gray-500">{s.location} · {s.date}</p>
            </div>
            {s.current
              ? <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">Cette session</span>
              : <button className="text-xs text-red-500 hover:text-red-700">Révoquer</button>
            }
          </div>
        ))}
      </div>
    </div>
  )
}
