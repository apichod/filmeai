import Link from 'next/link'

const requests: Record<string, {
  contact: string; email: string; subject: string; date: string; status: string
  items: { name: string; qty: number; unit: number; days: number }[]
  notes: string
}> = {
  '1': {
    contact: 'Julien Martin', email: 'julien@produnjour.com',
    subject: 'Pack reportage 3 jours', date: '16/06/2026', status: 'En attente',
    items: [
      { name: 'Sony FX3', qty: 1, unit: 150, days: 3 },
      { name: 'Trépied Manfrotto', qty: 1, unit: 30, days: 3 },
      { name: 'Carte CFexpress 256 Go', qty: 1, unit: 58, days: 1 },
    ],
    notes: 'Tournage documentaire, besoin d\'un trépied fluide. Disponibilité confirmée du 20 au 22 juin.',
  },
  '2': {
    contact: 'Emma Salomon', email: 'emma.salomon96@gmail.com',
    subject: 'Sony FX3 + trépied', date: '15/06/2026', status: 'Accepté',
    items: [
      { name: 'Sony FX3', qty: 1, unit: 325, days: 2 },
      { name: 'Trépied Manfrotto', qty: 1, unit: 30, days: 3 },
      { name: 'Carte CFexpress 256 Go', qty: 2, unit: 51, days: 1 },
    ],
    notes: 'Shooting photo portrait, weekend.',
  },
  '3': {
    contact: 'Naoual Dahou', email: 'naoual@revolvr.fr',
    subject: 'Pack cinéma DZOFilm Arles', date: '14/06/2026', status: 'En cours',
    items: [
      { name: 'DZOFilm Arles 1.33x Anamorphique', qty: 1, unit: 320, days: 7 },
      { name: 'Sony FX6', qty: 1, unit: 1045, days: 1 },
    ],
    notes: 'Tournage court-métrage, 1 semaine complète.',
  },
}

export default function RequestDetailPage({ params }: { params: { id: string } }) {
  const r = requests[params.id] ?? requests['1']
  const total = r.items.reduce((sum, i) => sum + i.unit, 0)

  const statusStyle: Record<string, string> = {
    'En attente': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    'Accepté': 'bg-green-50 text-green-700 border border-green-200',
    'En cours': 'bg-blue-50 text-blue-700 border border-blue-200',
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/requests" className="text-sm text-gray-500 hover:text-gray-900">← Demandes & devis</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900">{r.subject}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{r.subject}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{r.contact} — {r.email}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyle[r.status]}`}>{r.status}</span>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Lignes du devis</h3>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left pb-2 font-medium">Article</th>
                <th className="text-right pb-2 font-medium">Qté</th>
                <th className="text-right pb-2 font-medium">Prix</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {r.items.map((item, i) => (
                <tr key={i}>
                  <td className="py-2 text-sm text-gray-700">{item.name}</td>
                  <td className="py-2 text-sm text-gray-600 text-right">×{item.qty}</td>
                  <td className="py-2 text-sm font-medium text-gray-900 text-right">{item.unit} €</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td colSpan={2} className="pt-3 text-sm font-semibold text-gray-900">Total</td>
                <td className="pt-3 text-sm font-semibold text-gray-900 text-right">{total} €</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {r.notes && (
          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Notes</h3>
            <p className="text-sm text-gray-600">{r.notes}</p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors">
            Envoyer le devis
          </button>
          <button className="border border-gray-200 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
            Modifier
          </button>
        </div>
      </div>
    </div>
  )
}
