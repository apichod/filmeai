'use client'
import { useState } from 'react'

const products = [
  { id: '1', name: 'Sony FX3', category: 'Caméra', priceDay: 150, priceWeek: 750 },
  { id: '2', name: 'Sony FX6', category: 'Caméra', priceDay: 220, priceWeek: 1100 },
  { id: '3', name: 'DZOFilm Arles 1.33x', category: 'Optique', priceDay: 320, priceWeek: 1600 },
  { id: '4', name: 'Trépied Manfrotto 504X', category: 'Accessoire', priceDay: 30, priceWeek: 150 },
  { id: '5', name: 'Carte CFexpress 256 Go', category: 'Accessoire', priceDay: 58, priceWeek: null },
  { id: '6', name: 'Pack reportage', category: 'Pack', priceDay: 199, priceWeek: 995 },
  { id: '7', name: 'Pack cinéma', category: 'Pack', priceDay: 450, priceWeek: 2250 },
]

export default function AssistantQuotesPage() {
  const [items, setItems] = useState(products)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between max-w-2xl">
        <h2 className="text-sm font-semibold text-gray-900">Catalogue produits & tarifs</h2>
        <button className="bg-black text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-gray-800 transition-colors">
          + Ajouter un produit
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm max-w-2xl">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium">Produit</th>
              <th className="text-left px-6 py-3 font-medium">Catégorie</th>
              <th className="text-right px-6 py-3 font-medium">Tarif/jour</th>
              <th className="text-right px-6 py-3 font-medium">Tarif/semaine</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map(item => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                <td className="px-6 py-3">
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{item.category}</span>
                </td>
                <td className="px-6 py-3 text-sm text-gray-900 text-right">{item.priceDay} €</td>
                <td className="px-6 py-3 text-sm text-gray-900 text-right">{item.priceWeek ? `${item.priceWeek} €` : '—'}</td>
                <td className="px-6 py-3 text-right">
                  <button
                    onClick={() => setItems(items.filter(i => i.id !== item.id))}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Suppr.
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
