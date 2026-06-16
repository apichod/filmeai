export default function StatisticsPage() {
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin']
  const conversationsData = [12, 18, 14, 22, 30, 47]
  const quotesData = [5, 9, 7, 11, 16, 23]
  const maxConv = Math.max(...conversationsData)

  const topProducts = [
    { name: 'Sony FX3', count: 18, revenue: '7 200 €' },
    { name: 'Sony FX6', count: 11, revenue: '8 800 €' },
    { name: 'DZOFilm Arles', count: 7, revenue: '4 480 €' },
    { name: 'Trépied Manfrotto', count: 14, revenue: '980 €' },
    { name: 'Carte CFexpress', count: 22, revenue: '1 276 €' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Statistiques</h1>
        <p className="text-sm text-gray-500 mt-0.5">Activité des 6 derniers mois</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Conversations totales</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">143</p>
          <p className="text-xs text-green-600 mt-1">+57% vs période précédente</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Devis générés</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">71</p>
          <p className="text-xs text-green-600 mt-1">Taux de conversion : 49%</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Valeur devis totale</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">48 420 €</p>
          <p className="text-xs text-green-600 mt-1">+38% vs période précédente</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Conversations & devis par mois</h2>
        <div className="flex items-end gap-4 h-40">
          {months.map((m, i) => (
            <div key={m} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex gap-1 items-end" style={{ height: '120px' }}>
                <div
                  className="flex-1 bg-black rounded-sm"
                  style={{ height: `${(conversationsData[i] / maxConv) * 100}%` }}
                  title={`${conversationsData[i]} conversations`}
                />
                <div
                  className="flex-1 bg-gray-200 rounded-sm"
                  style={{ height: `${(quotesData[i] / maxConv) * 100}%` }}
                  title={`${quotesData[i]} devis`}
                />
              </div>
              <span className="text-xs text-gray-500">{m}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-600"><div className="w-3 h-3 bg-black rounded-sm" /> Conversations</div>
          <div className="flex items-center gap-1.5 text-xs text-gray-600"><div className="w-3 h-3 bg-gray-200 rounded-sm" /> Devis</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Produits les plus demandés</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium">Produit</th>
              <th className="text-left px-6 py-3 font-medium">Demandes</th>
              <th className="text-left px-6 py-3 font-medium">Revenu généré</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {topProducts.map((p, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{p.name}</td>
                <td className="px-6 py-3 text-sm text-gray-600">{p.count}</td>
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{p.revenue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
