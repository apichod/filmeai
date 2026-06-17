'use client'
import { useState, useEffect, useCallback } from 'react'

type Settings = {
  delivery_enabled: boolean
  delivery_pricing: string
  round_trip: boolean
  delivery_fee: number
  delivery_zones: string[]
  booking_delay: string
  payment_methods: string[]
}

const defaults: Settings = {
  delivery_enabled: false,
  delivery_pricing: 'fixed',
  round_trip: true,
  delivery_fee: 0,
  delivery_zones: [],
  booking_delay: '24h',
  payment_methods: [],
}

const PAYMENT_OPTIONS = [
  { value: 'card', label: 'Carte bancaire' },
  { value: 'transfer', label: 'Virement bancaire' },
  { value: 'check', label: 'Chèque' },
  { value: 'cash', label: 'Espèces' },
  { value: 'paypal', label: 'PayPal' },
]

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${value ? 'bg-black' : 'bg-gray-200'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  )
}

export default function AssistantConditionsPage() {
  const [s, setS] = useState<Settings>(defaults)
  const [zoneInput, setZoneInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    fetch('/api/assistant-settings')
      .then(r => r.json())
      .then((d: { settings?: Settings }) => { if (d.settings) setS(prev => ({ ...prev, ...d.settings })) })
  }, [])

  useEffect(() => { load() }, [load])

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setS(prev => ({ ...prev, [key]: val }))
  }

  function addZone() {
    const z = zoneInput.trim()
    if (!z || s.delivery_zones.includes(z)) return
    set('delivery_zones', [...s.delivery_zones, z])
    setZoneInput('')
  }

  function removeZone(z: string) {
    set('delivery_zones', s.delivery_zones.filter(d => d !== z))
  }

  function togglePayment(val: string) {
    if (s.payment_methods.includes(val)) {
      set('payment_methods', s.payment_methods.filter(p => p !== val))
    } else {
      set('payment_methods', [...s.payment_methods, val])
    }
  }

  async function save() {
    setSaving(true)
    await fetch('/api/assistant-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl space-y-5">

      {/* Livraison */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Livraison</h2>
            <p className="text-xs text-gray-500 mt-0.5">Proposer la livraison du matériel dans le devis.</p>
          </div>
          <Toggle value={s.delivery_enabled} onChange={v => set('delivery_enabled', v)} />
        </div>

        {s.delivery_enabled && (
          <div className="space-y-4 pt-1 border-t border-gray-100">
            <div className="pt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tarification</label>
              <select
                value={s.delivery_pricing}
                onChange={e => set('delivery_pricing', e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
              >
                <option value="fixed">Forfait fixe</option>
                <option value="distance">Par distance</option>
                <option value="free">Gratuit</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Aller-retour inclus</p>
                <p className="text-xs text-gray-500">Le forfait couvre la livraison et la reprise.</p>
              </div>
              <Toggle value={s.round_trip} onChange={v => set('round_trip', v)} />
            </div>

            {s.delivery_pricing === 'fixed' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Forfait (€)</label>
                <div className="relative w-36">
                  <input
                    type="number"
                    value={s.delivery_fee}
                    onChange={e => set('delivery_fee', Number(e.target.value))}
                    min={0}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Zones desservies</label>
              {s.delivery_zones.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {s.delivery_zones.map(z => (
                    <span key={z} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full">
                      {z}
                      <button onClick={() => removeZone(z)} className="text-gray-400 hover:text-gray-700 leading-none">×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={zoneInput}
                  onChange={e => setZoneInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addZone()}
                  placeholder="ex: Paris, Île-de-France…"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
                <button onClick={addZone} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  + Ajouter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Conditions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900">Conditions</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Délai de réservation minimum</label>
          <p className="text-xs text-gray-500 mb-2">Délai minimum entre la demande et le début de la location.</p>
          <select
            value={s.booking_delay}
            onChange={e => set('booking_delay', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
          >
            <option value="0">Aucun délai</option>
            <option value="2h">2 heures</option>
            <option value="12h">12 heures</option>
            <option value="24h">24 heures</option>
            <option value="48h">48 heures</option>
            <option value="72h">72 heures</option>
            <option value="1w">1 semaine</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Moyens de paiement acceptés</label>
          <div className="space-y-2">
            {PAYMENT_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={s.payment_methods.includes(opt.value)}
                  onChange={() => togglePayment(opt.value)}
                  className="w-4 h-4 rounded border-gray-300 accent-black"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
        {saved ? 'Sauvegardé ✓' : saving ? 'Sauvegarde…' : 'Sauvegarder'}
      </button>
    </div>
  )
}
