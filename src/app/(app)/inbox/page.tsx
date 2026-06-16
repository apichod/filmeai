import Link from 'next/link'

const conversations = [
  { id: '1', contact: 'Julien Martin', email: 'julien@produnjour.com', preview: 'Bonjour, je souhaite louer un Sony FX3 pour un tournage de 3 jours…', date: 'Aujourd\'hui 14:32', unread: true, amount: '598 €' },
  { id: '2', contact: 'Emma Salomon', email: 'emma.salomon96@gmail.com', preview: 'Merci pour le devis ! Est-ce que le trépied est inclus dans le pack ?', date: 'Hier 09:15', unread: true, amount: '842 €' },
  { id: '3', contact: 'Naoual Dahou', email: 'naoual@revolvr.fr', preview: 'Je voudrais louer le pack cinéma DZOFilm Arles pour une semaine complète.', date: '14/06', unread: false, amount: '2 241 €' },
  { id: '4', contact: 'Jonathan Leroux', email: 'jonathan@lightyshare.com', preview: 'Le Sony FX6 est-il disponible le weekend du 20 juin ?', date: '13/06', unread: false, amount: '1 180 €' },
  { id: '5', contact: 'Marie Fontaine', email: 'marie.fontaine@cineproduction.fr', preview: 'Avez-vous des cartes CFexpress en stock ? J\'en aurais besoin pour vendredi.', date: '12/06', unread: false, amount: '120 €' },
]

export default function InboxPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inbox</h1>
          <p className="text-sm text-gray-500 mt-0.5">2 messages non lus</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {conversations.map(c => (
          <Link key={c.id} href={`/inbox/${c.id}`} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
            <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center text-sm font-medium shrink-0 mt-0.5">
              {c.contact[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={`text-sm ${c.unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{c.contact}</span>
                <span className="text-xs text-gray-400 ml-4 shrink-0">{c.date}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{c.email}</p>
              <p className="text-sm text-gray-600 mt-1 truncate">{c.preview}</p>
            </div>
            {c.amount && (
              <span className="text-sm font-medium text-gray-900 shrink-0 mt-1">{c.amount}</span>
            )}
            {c.unread && <div className="w-2 h-2 bg-black rounded-full mt-2 shrink-0" />}
          </Link>
        ))}
      </div>
    </div>
  )
}
