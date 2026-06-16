export default function DashboardPage() {
  const stats = [
    { label: 'Conversations ce mois', value: '47', change: '+12%' },
    { label: 'Devis générés', value: '23', change: '+8%' },
    { label: 'Taux de conversion', value: '48%', change: '+3pts' },
    { label: 'Valeur totale devis', value: '18 420 €', change: '+21%' },
  ]

  const recent = [
    { contact: 'Julien Martin', subject: 'Pack reportage 3 jours', amount: '598 €', status: 'En attente', date: '16/06/2026' },
    { contact: 'Emma Salomon', subject: 'Sony FX3 + trépied', amount: '842 €', status: 'Accepté', date: '15/06/2026' },
    { contact: 'Naoual Dahou', subject: 'Pack cinéma DZOFilm', amount: '2 241 €', status: 'En cours', date: '14/06/2026' },
    { contact: 'Jonathan Leroux', subject: 'Sony FX6 weekend', amount: '1 180 €', status: 'Accepté', date: '13/06/2026' },
  ]

  const statusStyle: Record<string, string> = {
    'En attente': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    'Accepté': 'bg-green-50 text-green-700 border border-green-200',
    'En cours': 'bg-blue-50 text-blue-700 border border-blue-200',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Tableau de bord</h1>
        <p className="text-sm text-gray-500 mt-0.5">Bienvenue, voici l&apos;activité de votre assistant FilmeAI.</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-2">{s.value}</p>
            <p className="text-xs text-green-600 mt-1">{s.change} vs mois dernier</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Demandes récentes</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium">Contact</th>
              <th className="text-left px-6 py-3 font-medium">Objet</th>
              <th className="text-left px-6 py-3 font-medium">Montant</th>
              <th className="text-left px-6 py-3 font-medium">Statut</th>
              <th className="text-left px-6 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {recent.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{r.contact}</td>
                <td className="px-6 py-3 text-sm text-gray-600">{r.subject}</td>
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{r.amount}</td>
                <td className="px-6 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyle[r.status]}`}>{r.status}</span>
                </td>
                <td className="px-6 py-3 text-sm text-gray-500">{r.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
