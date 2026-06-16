import Link from 'next/link'

const data: Record<string, {
  contact: string
  email: string
  messages: { role: 'user' | 'assistant'; text: string; time: string }[]
  quote?: { items: { name: string; qty: number; price: number }[]; total: number; status: string }
}> = {
  '1': {
    contact: 'Julien Martin',
    email: 'julien@produnjour.com',
    messages: [
      { role: 'user', text: 'Bonjour, je souhaite louer un Sony FX3 pour un tournage de 3 jours, du 20 au 22 juin.', time: '14:28' },
      { role: 'assistant', text: 'Bonjour Julien ! Bien sûr, le Sony FX3 est disponible du 20 au 22 juin. Je vous prépare un devis. Souhaitez-vous ajouter un trépied ou des accessoires ?', time: '14:29' },
      { role: 'user', text: 'Oui, un trépied serait parfait. Et si possible une carte CFexpress.', time: '14:31' },
      { role: 'assistant', text: "Parfait ! Voici votre devis pour 3 jours : Sony FX3 × 1 = 450 €, Trépied × 1 = 90 €, Carte CFexpress × 1 = 58 €. Total : 598 €. Souhaitez-vous valider ce devis ?", time: '14:32' },
    ],
    quote: {
      items: [
        { name: 'Sony FX3', qty: 1, price: 450 },
        { name: 'Trépied', qty: 1, price: 90 },
        { name: 'Carte CFexpress', qty: 1, price: 58 },
      ],
      total: 598,
      status: 'En attente',
    },
  },
  '2': {
    contact: 'Emma Salomon',
    email: 'emma.salomon96@gmail.com',
    messages: [
      { role: 'user', text: "Bonjour ! Je voudrais louer un Sony FX3 avec trépied pour un shooting photo le weekend prochain.", time: '09:10' },
      { role: 'assistant', text: 'Bonjour Emma ! Votre devis : Sony FX3 × 1 = 650 €, Trépied × 1 = 90 €, Carte CFexpress × 1 = 102 €. Total : 842 € pour 2 jours. Tout est inclus.', time: '09:12' },
      { role: 'user', text: 'Merci pour le devis ! Est-ce que le trépied est inclus dans le pack ?', time: '09:15' },
    ],
    quote: {
      items: [
        { name: 'Sony FX3', qty: 1, price: 650 },
        { name: 'Trépied', qty: 1, price: 90 },
        { name: 'Carte CFexpress', qty: 2, price: 102 },
      ],
      total: 842,
      status: 'Accepté',
    },
  },
}

export default function InboxDetailPage({ params }: { params: { id: string } }) {
  const conv = data[params.id] ?? data['1']

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center gap-3">
        <Link href="/inbox" className="text-sm text-gray-500 hover:text-gray-900">← Inbox</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900">{conv.contact}</span>
      </div>

      <div className="flex gap-4 flex-1">
        <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm font-medium">
              {conv.contact[0]}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{conv.contact}</p>
              <p className="text-xs text-gray-500">{conv.email}</p>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
            {conv.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'assistant' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                  m.role === 'assistant'
                    ? 'bg-black text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                }`}>
                  {m.text}
                  <div className={`text-xs mt-1 ${m.role === 'assistant' ? 'text-white/50' : 'text-gray-400'}`}>{m.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {conv.quote && (
          <div className="w-64 bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3 h-fit">
            <h3 className="text-sm font-semibold text-gray-900">Devis généré</h3>
            <div className="space-y-1.5">
              {conv.quote.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.name} ×{item.qty}</span>
                  <span className="font-medium text-gray-900">{item.price} €</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{conv.quote.total} €</span>
            </div>
            <div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                conv.quote.status === 'Accepté' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
              }`}>{conv.quote.status}</span>
            </div>
            <button className="w-full bg-black text-white rounded-lg py-2 text-xs font-medium hover:bg-gray-800 transition-colors">
              Envoyer le devis
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
