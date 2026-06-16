'use client'
import { useState } from 'react'

const initialCollab = [
  { name: 'Aurelien', email: 'aurelien@filme.fr', role: 'Admin', since: '01/01/2026' },
  { name: 'Sophie Renard', email: 'sophie@filme.fr', role: 'Opérateur', since: '15/03/2026' },
]

export default function SettingsCollaboratorsPage() {
  const [collabs, setCollabs] = useState(initialCollab)
  const [inviteEmail, setInviteEmail] = useState('')

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Inviter un collaborateur</h2>
        <div className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="email@entreprise.fr"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
          <button
            onClick={() => {
              if (inviteEmail) {
                setCollabs([...collabs, { name: inviteEmail.split('@')[0], email: inviteEmail, role: 'Opérateur', since: new Date().toLocaleDateString('fr-FR') }])
                setInviteEmail('')
              }
            }}
            className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Inviter
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Membres de l&apos;équipe</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {collabs.map((c, i) => (
            <div key={i} className="flex items-center justify-between px-6 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm font-medium">
                  {c.name[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${c.role === 'Admin' ? 'bg-gray-100 text-gray-700 border-gray-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                  {c.role}
                </span>
                {c.role !== 'Admin' && (
                  <button
                    onClick={() => setCollabs(collabs.filter((_, j) => j !== i))}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Retirer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
