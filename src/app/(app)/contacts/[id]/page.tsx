import Link from 'next/link'

const contacts: Record<string, {
  name: string; email: string; company: string; phone: string
  history: { date: string; subject: string; amount: string; status: string }[]
}> = {
  '1': {
    name: 'Julien Martin', email: 'julien@produnjour.com', company: 'Prod Un Jour', phone: '+33 6 12 34 56 78',
    history: [
      { date: '16/06/2026', subject: 'Pack reportage 3 jours', amount: '598 €', status: 'En attente' },
      { date: '02/06/2026', subject: 'Sony FX3 weekend', amount: '420 €', status: 'Accepté' },
      { date: '18/05/2026', subject: 'Trépied + accessoires', amount: '150 €', status: 'Accepté' },
    ],
  },
  '2': {
    name: 'Emma Salomon', email: 'emma.salomon96@gmail.com', company: 'Indépendante', phone: '+33 7 89 01 23 45',
    history: [
      { date: '15/06/2026', subject: 'Sony FX3 + trépied', amount: '842 €', status: 'Accepté' },
    ],
  },
  '3': {
    name: 'Naoual Dahou', email: 'naoual@revolvr.fr', company: 'Revolvr Studio', phone: '+33 1 23 45 67 89',
    history: [
      { date: '14/06/2026', subject: 'Pack cinéma DZOFilm', amount: '2 241 €', status: 'En cours' },
      { date: '05/05/2026', subject: 'Sony FX6 1 semaine', amount: '2 800 €', status: 'Accepté' },
    ],
  },
  '4': {
    name: 'Jonathan Leroux', email: 'jonathan@lightyshare.com', company: 'LightyShare', phone: '+33 6 55 44 33 22',
    history: [
      { date: '13/06/2026', subject: 'Sony FX6 weekend', amount: '1 180 €', status: 'Accepté' },
    ],
  },
}

export default function ContactDetailPage({ params }: { params: { id: string } }) {
  const c = contacts[params.id] ?? contacts['1']

  const statusStyle: Record<string, string> = {
    'En attente': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    'Accepté': 'bg-green-50 text-green-700 border border-green-200',
    'En cours': 'bg-blue-50 text-blue-700 border border-blue-200',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/contacts" className="text-sm text-gray-500 hover:text-gray-900">← Contacts</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900">{c.name}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-black text-white flex items-center justify-center text-xl font-medium">
            {c.name[0]}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{c.name}</h1>
            <p className="text-sm text-gray-500">{c.company}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Email</p>
            <p className="font-medium text-gray-900">{c.email}</p>
          </div>
          <div>
            <p className="text-gray-500">Téléphone</p>
            <p className="font-medium text-gray-900">{c.phone}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Historique des demandes</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium">Date</th>
              <th className="text-left px-6 py-3 font-medium">Objet</th>
              <th className="text-left px-6 py-3 font-medium">Montant</th>
              <th className="text-left px-6 py-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {c.history.map((h, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3 text-sm text-gray-500">{h.date}</td>
                <td className="px-6 py-3 text-sm text-gray-700">{h.subject}</td>
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{h.amount}</td>
                <td className="px-6 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyle[h.status]}`}>{h.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
