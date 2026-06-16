const logs = [
  { action: 'Connexion', detail: 'Chrome · Paris, France', date: '16/06/2026 14:30', type: 'auth' },
  { action: 'Devis envoyé', detail: 'Julien Martin — Pack reportage · 598 €', date: '16/06/2026 14:35', type: 'quote' },
  { action: 'Assistant modifié', detail: 'Message d\'accueil mis à jour', date: '15/06/2026 11:20', type: 'settings' },
  { action: 'Connexion', detail: 'Safari · Paris, France', date: '15/06/2026 09:00', type: 'auth' },
  { action: 'Devis accepté', detail: 'Emma Salomon — Sony FX3 + trépied · 842 €', date: '15/06/2026 09:45', type: 'quote' },
  { action: 'Nouveau contact', detail: 'Naoual Dahou ajouté automatiquement', date: '14/06/2026 16:10', type: 'contact' },
  { action: 'Collaborateur invité', detail: 'sophie@filme.fr — Opérateur', date: '14/06/2026 10:00', type: 'settings' },
  { action: 'Connexion Booqable', detail: 'Synchronisation catalogue réussie', date: '01/03/2026 09:00', type: 'integration' },
]

const typeColor: Record<string, string> = {
  auth: 'bg-gray-100 text-gray-600',
  quote: 'bg-green-50 text-green-700',
  settings: 'bg-blue-50 text-blue-700',
  contact: 'bg-purple-50 text-purple-700',
  integration: 'bg-yellow-50 text-yellow-700',
}

export default function SettingsActivityPage() {
  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {logs.map((log, i) => (
          <div key={i} className="flex items-start justify-between px-6 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start gap-3">
              <span className={`text-xs px-2 py-0.5 rounded-full mt-0.5 shrink-0 ${typeColor[log.type]}`}>
                {log.action}
              </span>
              <p className="text-sm text-gray-600">{log.detail}</p>
            </div>
            <p className="text-xs text-gray-400 shrink-0 ml-4">{log.date}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
