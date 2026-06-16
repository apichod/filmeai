import Link from 'next/link'

const requests = [
  { id: '1', contact: 'Julien Martin', email: 'julien@produnjour.com', subject: 'Pack reportage 3 jours', amount: '598 €', status: 'En attente', date: '16/06/2026' },
  { id: '2', contact: 'Emma Salomon', email: 'emma.salomon96@gmail.com', subject: 'Sony FX3 + trépied', amount: '842 €', status: 'Accepté', date: '15/06/2026' },
  { id: '3', contact: 'Naoual Dahou', email: 'naoual@revolvr.fr', subject: 'Pack cinéma DZOFilm Arles', amount: '2 241 €', status: 'En cours', date: '14/06/2026' },
  { id: '4', contact: 'Jonathan Leroux', email: 'jonathan@lightyshare.com', subject: 'Sony FX6 weekend', amount: '1 180 €', status: 'Accepté', date: '13/06/2026' },
  { id: '5', contact: 'Marie Fontaine', email: 'marie.fontaine@cineproduction.fr', subject: 'Cartes CFexpress ×2', amount: '120 €', status: 'Refusé', date: '12/06/2026' },
]

const statusStyle: Record<string, string> = {
  'En attente': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  'Accepté': 'bg-green-50 text-green-700 border border-green-200',
  'En cours': 'bg-blue-50 text-blue-700 border border-blue-200',
  'Refusé': 'bg-red-50 text-red-700 border border-red-200',
}

export default function RequestsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Demandes & devis</h1>
        <p className="text-sm text-gray-500 mt-0.5">{requests.length} demandes ce mois</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium">Contact</th>
              <th className="text-left px-6 py-3 font-medium">Objet</th>
              <th className="text-left px-6 py-3 font-medium">Montant</th>
              <th className="text-left px-6 py-3 font-medium">Statut</th>
              <th className="text-left px-6 py-3 font-medium">Date</th>
              <th className="text-left px-6 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {requests.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3">
                  <p className="text-sm font-medium text-gray-900">{r.contact}</p>
                  <p className="text-xs text-gray-500">{r.email}</p>
                </td>
                <td className="px-6 py-3 text-sm text-gray-600">{r.subject}</td>
                <td className="px-6 py-3 text-sm font-semibold text-gray-900">{r.amount}</td>
                <td className="px-6 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyle[r.status]}`}>{r.status}</span>
                </td>
                <td className="px-6 py-3 text-sm text-gray-500">{r.date}</td>
                <td className="px-6 py-3">
                  <Link href={`/requests/${r.id}`} className="text-xs text-gray-500 hover:text-gray-900 underline">Voir</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
