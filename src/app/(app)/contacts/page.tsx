import Link from 'next/link'

const contacts = [
  { id: '1', name: 'Julien Martin', email: 'julien@produnjour.com', company: 'Prod Un Jour', conversations: 4, totalAmount: '2 340 €', lastContact: '16/06/2026' },
  { id: '2', name: 'Emma Salomon', email: 'emma.salomon96@gmail.com', company: 'Indépendante', conversations: 2, totalAmount: '842 €', lastContact: '15/06/2026' },
  { id: '3', name: 'Naoual Dahou', email: 'naoual@revolvr.fr', company: 'Revolvr Studio', conversations: 6, totalAmount: '7 820 €', lastContact: '14/06/2026' },
  { id: '4', name: 'Jonathan Leroux', email: 'jonathan@lightyshare.com', company: 'LightyShare', conversations: 3, totalAmount: '3 540 €', lastContact: '13/06/2026' },
  { id: '5', name: 'Marie Fontaine', email: 'marie.fontaine@cineproduction.fr', company: 'CinéProduction', conversations: 1, totalAmount: '120 €', lastContact: '12/06/2026' },
]

export default function ContactsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{contacts.length} contacts</p>
        </div>
        <button className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors">
          + Ajouter
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium">Contact</th>
              <th className="text-left px-6 py-3 font-medium">Entreprise</th>
              <th className="text-left px-6 py-3 font-medium">Conversations</th>
              <th className="text-left px-6 py-3 font-medium">Total devis</th>
              <th className="text-left px-6 py-3 font-medium">Dernier contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {contacts.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3">
                  <Link href={`/contacts/${c.id}`} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm font-medium shrink-0">
                      {c.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 hover:underline">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.email}</p>
                    </div>
                  </Link>
                </td>
                <td className="px-6 py-3 text-sm text-gray-600">{c.company}</td>
                <td className="px-6 py-3 text-sm text-gray-600">{c.conversations}</td>
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{c.totalAmount}</td>
                <td className="px-6 py-3 text-sm text-gray-500">{c.lastContact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
