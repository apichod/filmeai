export default function SettingsConnectionPage() {
  const integrations = [
    { name: 'Booqable', desc: 'Synchronisation catalogue & disponibilités', status: 'connected', since: '01/03/2026' },
    { name: 'Google Calendar', desc: 'Synchronisation des réservations', status: 'disconnected', since: null },
    { name: 'Stripe', desc: 'Paiement en ligne des acomptes', status: 'disconnected', since: null },
    { name: 'Slack', desc: 'Notifications des nouvelles demandes', status: 'disconnected', since: null },
  ]

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {integrations.map(int => (
          <div key={int.name} className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="text-sm font-medium text-gray-900">{int.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{int.desc}</p>
              {int.since && <p className="text-xs text-gray-400 mt-0.5">Connecté depuis le {int.since}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                int.status === 'connected'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-gray-50 text-gray-500 border-gray-200'
              }`}>
                {int.status === 'connected' ? 'Connecté' : 'Non connecté'}
              </span>
              <button className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                int.status === 'connected'
                  ? 'border-red-200 text-red-600 hover:bg-red-50'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}>
                {int.status === 'connected' ? 'Déconnecter' : 'Connecter'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
