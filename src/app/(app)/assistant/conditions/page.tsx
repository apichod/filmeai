'use client'
import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type DayKey = 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi' | 'dimanche'

type DaySchedule = {
  enabled: boolean
  open: string
  close: string
}

type OpeningHours = Record<DayKey, DaySchedule>

type Settings = {
  delivery_enabled: boolean
  delivery_pricing: string
  delivery_fee: number
  delivery_fee_return: number
  delivery_zones: string[]
  booking_delay_days: number
  payment_methods: string[]
  opening_hours: OpeningHours
  default_pickup_time: string
  default_return_time: string
}

type ApiSettings = {
  delivery_enabled?: boolean
  delivery_pricing?: string
  delivery_fee?: number
  delivery_fee_return?: number
  delivery_zones?: string[]
  booking_delay?: string
  payment_methods?: string[]
  opening_hours?: OpeningHours | null
  default_pickup_time?: string
  default_return_time?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'lundi',    label: 'Lundi' },
  { key: 'mardi',    label: 'Mardi' },
  { key: 'mercredi', label: 'Mercredi' },
  { key: 'jeudi',    label: 'Jeudi' },
  { key: 'vendredi', label: 'Vendredi' },
  { key: 'samedi',   label: 'Samedi' },
  { key: 'dimanche', label: 'Dimanche' },
]

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = String(i).padStart(2, '0')
  return [`${h}:00`, `${h}:30`]
}).flat()

const PRESET_PAYMENTS = ['Carte bancaire', 'Espèces', 'Virement', 'Chèque', 'PayPal', 'Lydia']

const DEFAULT_OPENING_HOURS: OpeningHours = {
  lundi:    { enabled: true,  open: '09:00', close: '19:00' },
  mardi:    { enabled: true,  open: '09:00', close: '19:00' },
  mercredi: { enabled: true,  open: '09:00', close: '19:00' },
  jeudi:    { enabled: true,  open: '09:00', close: '19:00' },
  vendredi: { enabled: true,  open: '09:00', close: '19:00' },
  samedi:   { enabled: false, open: '09:00', close: '19:00' },
  dimanche: { enabled: false, open: '09:00', close: '19:00' },
}

const PRICE_TIERS = [
  { days: 1,  mul: 1.00 }, { days: 2,  mul: 1.50 }, { days: 3,  mul: 2.00 },
  { days: 4,  mul: 2.50 }, { days: 5,  mul: 2.95 }, { days: 6,  mul: 3.40 },
  { days: 7,  mul: 3.85 }, { days: 8,  mul: 4.30 }, { days: 9,  mul: 4.75 },
  { days: 10, mul: 5.15 }, { days: 11, mul: 5.55 }, { days: 12, mul: 5.95 },
  { days: 13, mul: 6.35 }, { days: 14, mul: 6.75 }, { days: 15, mul: 7.10 },
  { days: 16, mul: 7.45 }, { days: 17, mul: 7.80 }, { days: 18, mul: 8.15 },
  { days: 19, mul: 8.50 }, { days: 20, mul: 8.80 }, { days: 21, mul: 9.10 },
  { days: 22, mul: 9.40 }, { days: 23, mul: 9.70 }, { days: 24, mul: 10.00 },
]

const defaults: Settings = {
  delivery_enabled: false,
  delivery_pricing: 'fixed',
  delivery_fee: 0,
  delivery_fee_return: 0,
  delivery_zones: [],
  booking_delay_days: 1,
  payment_methods: [],
  opening_hours: DEFAULT_OPENING_HOURS,
  default_pickup_time: '14:00',
  default_return_time: '13:00',
}

// Convert legacy booking_delay string to days
function parseLegacyDelay(val: string | undefined): number {
  if (!val) return 1
  if (/^\d+$/.test(val)) return parseInt(val, 10)
  if (val === '0')   return 0
  if (val === '2h')  return 0
  if (val === '12h') return 0
  if (val === '24h') return 1
  if (val === '48h') return 2
  if (val === '72h') return 3
  if (val === '1w')  return 7
  return 1
}

// ── Small components ──────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${value ? 'bg-gray-900' : 'bg-gray-200'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  )
}

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white">
      {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
    </select>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AssistantConditionsPage() {
  const [s, setS] = useState<Settings>(defaults)
  const [customPayment, setCustomPayment] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Bulk hours tool
  const [bulkFrom, setBulkFrom] = useState<DayKey>('lundi')
  const [bulkTo, setBulkTo]     = useState<DayKey>('vendredi')
  const [bulkOpen, setBulkOpen]   = useState('09:00')
  const [bulkClose, setBulkClose] = useState('18:00')

  const load = useCallback(() => {
    fetch('/api/assistant-settings')
      .then(r => r.json())
      .then((d: { settings?: ApiSettings }) => {
        if (!d.settings) return
        const api = d.settings
        setS(prev => ({
          ...prev,
          delivery_enabled:    api.delivery_enabled    ?? prev.delivery_enabled,
          delivery_pricing:    api.delivery_pricing    ?? prev.delivery_pricing,
          delivery_fee:        api.delivery_fee        ?? prev.delivery_fee,
          delivery_fee_return: api.delivery_fee_return ?? prev.delivery_fee_return,
          delivery_zones:      Array.isArray(api.delivery_zones) ? api.delivery_zones : prev.delivery_zones,
          booking_delay_days:  parseLegacyDelay(api.booking_delay),
          payment_methods:     Array.isArray(api.payment_methods) ? api.payment_methods : prev.payment_methods,
          opening_hours:       api.opening_hours ?? prev.opening_hours,
          default_pickup_time: api.default_pickup_time ?? prev.default_pickup_time,
          default_return_time: api.default_return_time ?? prev.default_return_time,
        }))
      })
  }, [])

  useEffect(() => { load() }, [load])

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setS(prev => ({ ...prev, [key]: val }))
  }

  // Payment methods
  function togglePayment(val: string) {
    if (s.payment_methods.includes(val)) {
      set('payment_methods', s.payment_methods.filter(p => p !== val))
    } else {
      set('payment_methods', [...s.payment_methods, val])
    }
  }

  function addCustomPayment() {
    const v = customPayment.trim()
    if (!v || s.payment_methods.includes(v)) return
    set('payment_methods', [...s.payment_methods, v])
    setCustomPayment('')
  }

  function removeCustomPayment(val: string) {
    if (PRESET_PAYMENTS.includes(val)) return
    set('payment_methods', s.payment_methods.filter(p => p !== val))
  }

  // Opening hours
  function setDay(day: DayKey, patch: Partial<DaySchedule>) {
    setS(prev => ({
      ...prev,
      opening_hours: {
        ...prev.opening_hours,
        [day]: { ...prev.opening_hours[day], ...patch },
      },
    }))
  }

  function applyBulk() {
    const fromIdx = DAYS.findIndex(d => d.key === bulkFrom)
    const toIdx   = DAYS.findIndex(d => d.key === bulkTo)
    if (fromIdx === -1 || toIdx === -1) return
    const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
    const next = { ...s.opening_hours }
    for (let i = start; i <= end; i++) {
      next[DAYS[i].key] = { enabled: true, open: bulkOpen, close: bulkClose }
    }
    set('opening_hours', next)
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const res = await fetch('/api/assistant-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_enabled:    s.delivery_enabled,
          delivery_pricing:    s.delivery_pricing,
          delivery_fee:        s.delivery_fee,
          delivery_fee_return: s.delivery_fee_return,
          delivery_zones:      s.delivery_zones,
          booking_delay:       String(s.booking_delay_days),
          payment_methods:     s.payment_methods,
          opening_hours:       s.opening_hours,
          default_pickup_time: s.default_pickup_time,
          default_return_time: s.default_return_time,
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Sauvegarde impossible.')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sauvegarde impossible.')
    } finally {
      setSaving(false)
    }
  }

  // Custom payments = those in payment_methods not in PRESET_PAYMENTS
  const customMethods = s.payment_methods.filter(p => !PRESET_PAYMENTS.includes(p))

  return (
    <div className="max-w-2xl space-y-5">

      {/* ── Livraison ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
            <h2 className="text-sm font-semibold text-gray-900">Livraison</h2>
          </div>
          <p className="text-xs text-gray-500">Indiquez si vous livrez et comment le tarif est calculé : le bot demandera l&apos;adresse pour estimer les frais.</p>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Livraison proposée</p>
          <Toggle value={s.delivery_enabled} onChange={v => set('delivery_enabled', v)} />
        </div>

        <div className="space-y-4 pt-1 border-t border-gray-100">
          <div className="pt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tarification</label>
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

          {s.delivery_pricing === 'fixed' && (
            <div className="flex gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tarif livraison (aller)</label>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tarif retour</label>
                <div className="relative w-36">
                  <input
                    type="number"
                    value={s.delivery_fee_return}
                    onChange={e => set('delivery_fee_return', Number(e.target.value))}
                    min={0}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Zones desservies <span className="font-normal text-gray-400">(indicatif)</span></label>
            <input
              value={s.delivery_zones.join(', ')}
              onChange={e => set('delivery_zones', e.target.value.split(',').map(z => z.trim()).filter(Boolean))}
              placeholder="Paris, 92, Lyon… (séparées par des virgules)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>
        </div>
      </div>

      {/* ── Conditions ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
            </svg>
            <h2 className="text-sm font-semibold text-gray-900">Conditions</h2>
          </div>
          <p className="text-xs text-gray-500">Délai de réservation et moyens de paiement acceptés. La caution dépend du matériel (devis ou conditions de location).</p>
        </div>

        {/* Booking delay */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Délai de réservation minimum</label>
          <div className="relative w-40">
            <input
              type="number"
              value={s.booking_delay_days}
              onChange={e => set('booking_delay_days', Math.max(0, Number(e.target.value)))}
              min={0}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">jours</span>
          </div>
        </div>

        {/* Payment methods */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2.5">Moyens de paiement</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESET_PAYMENTS.map(p => {
              const active = s.payment_methods.includes(p)
              return (
                <button key={p} type="button"
                  onClick={() => togglePayment(p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}>
                  {p}
                </button>
              )
            })}
            {customMethods.map(p => (
              <span key={p} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border bg-gray-900 text-white border-gray-900">
                {p}
                <button type="button" onClick={() => removeCustomPayment(p)} className="ml-0.5 hover:opacity-70">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={customPayment}
              onChange={e => setCustomPayment(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomPayment()}
              placeholder="Autre moyen (ex. : Apple Pay)"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <button type="button" onClick={addCustomPayment}
              className="flex items-center gap-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap">
              + Ajouter
            </button>
          </div>
        </div>
      </div>

      {/* ── Horaires d'ouverture ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <h2 className="text-sm font-semibold text-gray-900">Horaires d&apos;ouverture</h2>
          </div>
          <p className="text-xs text-gray-500">Activez les jours d&apos;ouverture et choisissez les heures. Un jour désactivé est considéré comme fermé.</p>
        </div>

        {/* Bulk apply */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-gray-600">Régler plusieurs jours d&apos;un coup</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <span className="text-xs text-gray-500">Du</span>
            <select value={bulkFrom} onChange={e => setBulkFrom(e.target.value as DayKey)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white">
              {DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <span className="text-xs text-gray-500">au</span>
            <select value={bulkTo} onChange={e => setBulkTo(e.target.value as DayKey)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white">
              {DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <TimeSelect value={bulkOpen}  onChange={setBulkOpen} />
            <span className="text-gray-400">→</span>
            <TimeSelect value={bulkClose} onChange={setBulkClose} />
            <button type="button" onClick={applyBulk}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white hover:bg-gray-100 transition-colors">
              Appliquer
            </button>
          </div>
          <p className="text-[11px] text-gray-400">Appliquez une plage (ex. du lundi au vendredi), puis ajustez les jours particuliers ci-dessous.</p>
        </div>

        {/* Per-day rows */}
        <div className="divide-y divide-gray-100">
          {DAYS.map(({ key, label }) => {
            const day = s.opening_hours[key]
            return (
              <div key={key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="w-20 text-sm font-medium text-gray-700 shrink-0">{label}</span>
                <Toggle value={day.enabled} onChange={v => setDay(key, { enabled: v })} />
                {day.enabled ? (
                  <div className="flex items-center gap-2 ml-1">
                    <TimeSelect value={day.open}  onChange={v => setDay(key, { open: v })} />
                    <span className="text-gray-400 text-sm">→</span>
                    <TimeSelect value={day.close} onChange={v => setDay(key, { close: v })} />
                  </div>
                ) : (
                  <span className="ml-1 text-sm text-gray-400">Fermé</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Heures par défaut ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <h2 className="text-sm font-semibold text-gray-900">Heures par défaut</h2>
          </div>
          <p className="text-xs text-gray-500">Heures utilisées quand le client ne précise pas d&apos;horaire. Doit correspondre aux réglages Booqable → Rental period → Default order times.</p>
        </div>
        <div className="flex gap-8">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Retrait (pick up)</label>
            <TimeSelect value={s.default_pickup_time} onChange={v => set('default_pickup_time', v)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Retour (return)</label>
            <TimeSelect value={s.default_return_time} onChange={v => set('default_return_time', v)} />
          </div>
        </div>
      </div>

      {/* ── Structure tarifaire ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 mb-0.5">
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h1.5m-1.5 0h-1.5m-9 0H3m1.5 0H3m12 3h1.5m-1.5 0h-1.5m-9 0H3m1.5 0H3" />
              </svg>
              <h2 className="text-sm font-semibold text-gray-900">Structure tarifaire</h2>
            </div>
            <a href="https://filme.booqable.com/price_structures/340124cc-8142-4fbd-9c1b-323373bb0896/edit" target="_blank" rel="noreferrer"
              className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2">
              Modifier dans Booqable ↗
            </a>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Paliers de prix HT appliqués selon la durée de location (multiplicateur du tarif journalier de base).</p>
        </div>
        <div className="grid grid-cols-6 gap-1.5 text-xs">
          {PRICE_TIERS.map(({ days, mul }) => {
            const pct = Math.round((1 - mul / days) * 100)
            return (
              <div key={days} className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5 text-center">
                <p className="font-semibold text-gray-900">{days}j</p>
                <p className="text-gray-500">×{mul}</p>
                {pct > 0 && <p className="text-emerald-600 text-[10px]">−{pct}%/j</p>}
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-gray-400">Ex. pour un produit à 100€/j : 3 jours = 200€ HT, 7 jours = 385€ HT, 14 jours = 675€ HT</p>
      </div>

      {/* ── Règles de facturation jours ────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <h2 className="text-sm font-semibold text-gray-900">Règles de facturation des jours</h2>
          </div>
          <a href="https://filme.booqable.com/price_rulesets/b8aed3e9-1194-4081-9236-c99a046e7721/edit" target="_blank" rel="noreferrer"
            className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2">
            Modifier dans Booqable ↗
          </a>
        </div>
        <div className="space-y-2 text-sm">
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Jour de retrait</p>
            <div className="flex gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-800">
                <span className="font-semibold">Avant 13h45</span> → jour facturé
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-emerald-800">
                <span className="font-semibold">Après 13h45</span> → jour non facturé
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Jour de retour</p>
            <div className="flex gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-emerald-800">
                <span className="font-semibold">Avant 13h15</span> → jour non facturé
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-800">
                <span className="font-semibold">Après 13h15</span> → jour facturé
              </span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 pt-1">
            Avec les heures par défaut (retrait 14h00, retour 13h00) : ni le jour de retrait ni le jour de retour ne sont facturés.
            Une location du lundi 14h au mercredi 13h = 2 jours de location.
          </p>
        </div>
      </div>

      {/* Save */}
      <div className="space-y-2">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Erreur : {error}</p>
        )}
        <button onClick={save} disabled={saving}
          className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
          {saved ? 'Sauvegardé ✓' : saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>

    </div>
  )
}
