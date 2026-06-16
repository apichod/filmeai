export default function SettingsSubscriptionPage() {
  const plans = [
    { name: 'Starter', price: '49 €/mois', features: ['500 conversations/mois', '1 assistant', 'Support email'], current: false },
    { name: 'Pro', price: '99 €/mois', features: ['2 000 conversations/mois', '3 assistants', 'Intégration Booqable', 'Support prioritaire'], current: true },
    { name: 'Enterprise', price: 'Sur devis', features: ['Conversations illimitées', 'Assistants illimités', 'API complète', 'Account manager dédié'], current: false },
  ]

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Plan actuel</h2>
            <p className="text-2xl font-semibold text-gray-900 mt-1">Pro <span className="text-base font-normal text-gray-500">— 99 €/mois</span></p>
            <p className="text-xs text-gray-500 mt-1">Renouvellement le 01/07/2026 · 1 847 conversations utilisées sur 2 000</p>
          </div>
          <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">Actif</span>
        </div>
        <div className="mt-4 bg-gray-100 rounded-full h-2">
          <div className="bg-black h-2 rounded-full" style={{ width: '92%' }} />
        </div>
        <p className="text-xs text-gray-500 mt-1">92% utilisé — <span className="text-orange-600 font-medium">153 conversations restantes</span></p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {plans.map(plan => (
          <div
            key={plan.name}
            className={`bg-white rounded-xl border shadow-sm p-5 ${plan.current ? 'border-black ring-1 ring-black' : 'border-gray-100'}`}
          >
            {plan.current && (
              <span className="text-xs bg-black text-white px-2 py-0.5 rounded-full">Plan actuel</span>
            )}
            <h3 className={`text-sm font-semibold text-gray-900 ${plan.current ? 'mt-2' : ''}`}>{plan.name}</h3>
            <p className="text-lg font-semibold text-gray-900 mt-1">{plan.price}</p>
            <ul className="mt-3 space-y-1.5">
              {plan.features.map(f => (
                <li key={f} className="text-xs text-gray-600 flex items-center gap-1.5">
                  <span className="text-green-500">✓</span> {f}
                </li>
              ))}
            </ul>
            {!plan.current && (
              <button className="mt-4 w-full border border-gray-200 rounded-lg py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                {plan.name === 'Enterprise' ? 'Nous contacter' : 'Changer de plan'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
