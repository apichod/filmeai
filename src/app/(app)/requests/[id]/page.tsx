'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type QuoteItem = {
  uid?: string
  position?: number
  type?: 'product' | 'custom_charge' | 'section' | string
  section?: string | null
  productId?: string | null
  title?: string
  requestedName?: string
  name?: string
  quantity?: number
  unitPrice?: number
  deposit?: number
  lineTotal?: number
  lineDeposit?: number
}

type RequestDetail = {
  id: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  quote_status: string | null
  starts_at: string | null
  stops_at: string | null
  expires_at: string | null
  request_context: string | null
  quote_items: QuoteItem[] | null
  quote_total: number | null
  quote_deposit: number | null
  quote_days: number | null
  booqable_order_id: string | null
  booqable_order_url: string | null
  booqable_customer_id?: string | null
  contact_meta?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  messages?: { id: string; role: string; content: string; created_at: string }[]
}

function dateInputValue(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

function isoFromDateInput(value: string, hour = '09:00:00') {
  return value ? new Date(`${value}T${hour}`).toISOString() : null
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatLongDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
}

function statusLabel(status: string | null | undefined) {
  if (status === 'draft') return 'Brouillon'
  if (status === 'closed') return 'Archivée'
  if (status === 'accepted') return 'Acceptée'
  if (status === 'sent') return 'Envoyée'
  return 'Envoyée'
}

function statusClass(status: string | null | undefined) {
  if (status === 'draft') return 'bg-amber-50 text-amber-700'
  if (status === 'closed') return 'bg-gray-100 text-gray-600'
  if (status === 'accepted') return 'bg-green-50 text-green-700'
  if (status === 'sent') return 'bg-blue-50 text-blue-700'
  return 'bg-amber-50 text-amber-700'
}

function recalcLine(item: QuoteItem, days: number): QuoteItem {
  const type = item.type || 'custom_charge'
  const quantity = type === 'section' ? 1 : Math.max(1, Math.round(Number(item.quantity) || 1))
  const unitPrice = Number(item.unitPrice || 0)
  const deposit = Number(item.deposit || 0)
  return {
    ...item,
    quantity,
    unitPrice,
    deposit,
    lineTotal: type === 'product' ? unitPrice * quantity * days : 0,
    lineDeposit: type === 'product' ? deposit * quantity : 0,
  }
}

function daysBetween(start: string, stop: string) {
  if (!start || !stop) return 1
  return Math.max(1, Math.round((new Date(stop).getTime() - new Date(start).getTime()) / 86400000))
}

export default function RequestDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [request, setRequest] = useState<RequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [context, setContext] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [stopsAt, setStopsAt] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([])

  useEffect(() => {
    fetch(`/api/conversations/${params.id}`)
      .then(r => r.json())
      .then((data: RequestDetail) => {
        setRequest(data)
        setContactName(data.contact_name || '')
        setContactEmail(data.contact_email || '')
        setContactPhone(data.contact_phone || '')
        setContext(data.request_context || '')
        setStartsAt(dateInputValue(data.starts_at))
        setStopsAt(dateInputValue(data.stops_at))
        setItems((data.quote_items || []).map((item, index) => ({ ...item, uid: item.uid || `${index}` })))
      })
      .catch(() => setError('Impossible de charger la demande'))
      .finally(() => setLoading(false))
  }, [params.id])

  const days = useMemo(() => daysBetween(startsAt, stopsAt), [startsAt, stopsAt])
  const recalculated = useMemo(() => items.map(item => recalcLine(item, days)), [items, days])
  const total = recalculated.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0)
  const deposit = recalculated.reduce((sum, item) => sum + Number(item.lineDeposit || 0), 0)

  function updateItem(index: number, patch: Partial<QuoteItem>) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  function addCustomLine() {
    setItems(prev => [...prev, {
      uid: crypto.randomUUID(),
      type: 'custom_charge',
      title: 'Produit à vérifier',
      name: 'Produit à vérifier',
      requestedName: 'Produit à vérifier',
      quantity: 1,
      unitPrice: 0,
      deposit: 0,
    }])
  }

  function addSection() {
    setItems(prev => [...prev, {
      uid: crypto.randomUUID(),
      type: 'section',
      title: 'NOUVELLE SECTION',
      name: 'NOUVELLE SECTION',
      quantity: 1,
      unitPrice: 0,
      deposit: 0,
    }])
  }

  async function save(patchStatus?: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/conversations/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_name: contactName,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          starts_at: isoFromDateInput(startsAt, '09:00:00'),
          stops_at: isoFromDateInput(stopsAt, '18:00:00'),
          request_context: context,
          quote_status: patchStatus || request?.quote_status || 'pending_validation',
          quote_items: recalculated,
          close: patchStatus === 'closed',
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok || data.error) throw new Error(data.error || 'Erreur sauvegarde')
      setEditing(false)
      const fresh = await fetch(`/api/conversations/${params.id}`).then(r => r.json()) as RequestDetail
      setRequest(fresh)
      setItems((fresh.quote_items || []).map((item, index) => ({ ...item, uid: item.uid || `${index}` })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-sm text-gray-400">Chargement…</div>
  if (!request) return <div className="text-sm text-red-500">Demande introuvable.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Demande de devis</h1>
          <p className="text-sm text-gray-500 mt-1">Détail du devis, coordonnées client et actions.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => save('closed')}
            disabled={saving}
            className="border border-gray-200 bg-white rounded-lg px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            Archiver la demande
          </button>
          <button
            onClick={() => router.push('/requests')}
            className="border border-gray-200 bg-white rounded-lg px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            ← Retour aux demandes
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-xl">🗓️</div>
            <div>
              <p className="text-xs font-semibold uppercase text-gray-400">Départ</p>
              {editing ? (
                <input type="date" value={startsAt} onChange={e => setStartsAt(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              ) : (
                <p className="text-xl font-semibold text-gray-900">{formatLongDate(request.starts_at)}</p>
              )}
            </div>
          </div>
          <span className="text-2xl text-gray-400">→</span>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-xl">🗓️</div>
            <div>
              <p className="text-xs font-semibold uppercase text-gray-400">Retour</p>
              {editing ? (
                <input type="date" value={stopsAt} onChange={e => setStopsAt(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              ) : (
                <p className="text-xl font-semibold text-gray-900">{formatLongDate(request.stops_at)}</p>
              )}
            </div>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">{days} jour{days > 1 ? 's' : ''}</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">❞ Contexte de la demande</h2>
          {editing ? (
            <textarea value={context} onChange={e => setContext(e.target.value)} rows={5} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          ) : (
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{request.request_context || '—'}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Devis</h2>
              <p className="text-sm text-gray-500 mt-1">{formatDate(request.starts_at)} → {formatDate(request.stops_at)} · {days} jour{days > 1 ? 's' : ''}</p>
            </div>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusClass(request.quote_status)}`}>
              {statusLabel(request.quote_status)}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="text-left py-3 font-semibold">Désignation</th>
                <th className="text-right py-3 font-semibold w-20">Qté</th>
                <th className="text-right py-3 font-semibold w-28">PU</th>
                <th className="text-right py-3 font-semibold w-28">Total</th>
                {editing && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {recalculated.map((item, index) => item.type === 'section' ? (
                <tr key={item.uid || index} className="bg-gray-50">
                  <td colSpan={editing ? 5 : 4} className="py-2 px-3 text-xs font-bold uppercase tracking-wide text-gray-500">
                    {editing ? (
                      <input value={item.title || ''} onChange={e => updateItem(index, { title: e.target.value, name: e.target.value })} className="border border-gray-200 rounded px-2 py-1 text-xs w-full" />
                    ) : item.title}
                  </td>
                </tr>
              ) : (
                <tr key={item.uid || index} className="border-b border-gray-100">
                  <td className="py-3 pr-3 font-semibold text-gray-900">
                    {editing ? (
                      <input value={item.name || item.title || ''} onChange={e => updateItem(index, { name: e.target.value, title: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
                    ) : item.name || item.title || item.requestedName}
                    {item.type === 'custom_charge' && <span className="ml-2 text-[11px] text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">custom</span>}
                  </td>
                  <td className="py-3 text-right">
                    {editing ? (
                      <input type="number" min={1} value={item.quantity || 1} onChange={e => updateItem(index, { quantity: Number(e.target.value) })} className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-16 text-right" />
                    ) : item.quantity || 1}
                  </td>
                  <td className="py-3 text-right text-gray-500">
                    {editing ? (
                      <input type="number" step="0.01" value={item.unitPrice || 0} onChange={e => updateItem(index, { unitPrice: Number(e.target.value) })} className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-24 text-right" />
                    ) : money(item.unitPrice)}
                  </td>
                  <td className="py-3 text-right font-semibold text-gray-900">{money(item.lineTotal)}</td>
                  {editing && (
                    <td className="py-3 text-right">
                      <button onClick={() => removeItem(index)} className="text-gray-300 hover:text-red-500">×</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {editing && (
            <div className="flex gap-2 mt-4">
              <button onClick={addSection} className="border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium hover:bg-gray-50">+ Section</button>
              <button onClick={addCustomLine} className="border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium hover:bg-gray-50">+ Ligne custom</button>
            </div>
          )}

          <div className="border-t border-gray-200 mt-6 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-500"><span>Sous-total</span><span>{money(total)}</span></div>
            <div className="flex justify-between text-gray-500"><span>Caution</span><span>{money(deposit)}</span></div>
            <div className="flex justify-between text-lg font-bold text-gray-900"><span>Total</span><span>{money(total)}</span></div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Actions</h2>
              {request.quote_status === 'draft' && !request.booqable_order_id && (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Brouillon</span>
              )}
            </div>
            {editing ? (
              <>
                <button onClick={() => save()} disabled={saving} className="w-full bg-gray-950 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">{saving ? 'Sauvegarde…' : 'Sauvegarder'}</button>
                <button onClick={() => setEditing(false)} className="w-full border border-gray-200 rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-50">Annuler</button>
              </>
            ) : (
              <>
                {!request.booqable_order_id && request.quote_status === 'draft' && (
                  <button
                    onClick={async () => {
                      setPushing(true)
                      setError(null)
                      try {
                        const res = await fetch('/api/push-to-booqable', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ conversationId: params.id }),
                        })
                        const data = await res.json() as { orderId?: string; orderUrl?: string; customerWarning?: string | null; error?: string }
                        if (!res.ok || data.error) throw new Error(data.error || `Erreur HTTP ${res.status}`)
                        setRequest(prev => prev ? {
                          ...prev,
                          booqable_order_id: data.orderId || null,
                          booqable_order_url: data.orderUrl || null,
                          quote_status: 'pending_validation',
                        } : prev)
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Erreur lors du push Booqable')
                      } finally {
                        setPushing(false)
                      }
                    }}
                    disabled={pushing}
                    className="w-full bg-gray-950 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-gray-800"
                  >
                    {pushing ? 'Push en cours…' : 'Pousser vers Booqable'}
                  </button>
                )}
                {request.booqable_order_url && (
                  <a href={request.booqable_order_url} target="_blank" rel="noopener noreferrer" className="block w-full text-center border border-gray-200 rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-50">Ouvrir la commande dans Booqable</a>
                )}
              </>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Client</h2>
            {editing ? (
              <div className="space-y-3">
                <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nom" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="Email" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="Téléphone" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div><p className="text-xs text-gray-400">Nom</p><p className="font-semibold text-gray-900">{request.contact_name || '—'}</p></div>
                <div><p className="text-xs text-gray-400">Email</p><p className="font-semibold text-gray-900">{request.contact_email || '—'}</p></div>
                {request.contact_phone && <div><p className="text-xs text-gray-400">Téléphone</p><p className="font-semibold text-gray-900">{request.contact_phone}</p></div>}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Conversation source</h2>
            <a href={`/inbox/${request.id}`} className="text-sm font-semibold text-gray-800 hover:underline">Ouvrir la conversation</a>
          </div>
        </div>
      </div>
    </div>
  )
}
