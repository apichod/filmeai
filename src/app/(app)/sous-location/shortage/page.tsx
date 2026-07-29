'use client'

import { useCallback, useEffect, useState } from 'react'

type ShortageItem = {
  planning_id:     string
  order_id:        string
  order_number:    number
  customer_name:   string
  item_name:       string
  product_id:      string
  location_id:     string
  quantity:        number
  shortage_amount: number
  starts_at:       string
  stops_at:        string
  order_url:       string
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ShortageTable() {
  const [items, setItems]           = useState<ShortageItem[]>([])
  const [loading, setLoading]       = useState(false)
  const [synced, setSynced]         = useState(false)
  const [syncedAt, setSyncedAt]     = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [creating, setCreating]     = useState(false)
  const [createMsg, setCreateMsg]   = useState<string | null>(null)
  const [notes, setNotes]           = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)

  const STORAGE_KEY = 'bq_shortage_v2'

  const sync = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCreateMsg(null)
    try {
      const data = await fetch('/api/sous-location/shortage').then(r => r.json()) as { items?: ShortageItem[]; error?: string }
      if (data.error) { setError(data.error); return }
      const now = new Date().toISOString()
      setItems(data.items ?? [])
      setSyncedAt(now)
      setSynced(true)
      setSelected(new Set())
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: data.items ?? [], syncedAt: now }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Cache localStorage affiché immédiatement pendant le fetch
    let lastSyncedAt: string | null = null
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as { items: ShortageItem[]; syncedAt: string }
        setItems(parsed.items)
        setSyncedAt(parsed.syncedAt)
        setSynced(true)
        lastSyncedAt = parsed.syncedAt
      }
    } catch { /* ignore */ }
    fetch('/api/sous-location/product-notes')
      .then(r => r.json())
      .then((d: { notes?: Record<string, string> }) => { if (d.notes) setNotes(d.notes) })
      .catch(() => { /* silencieux */ })
    // Auto-sync sauf si dernière sync < 2 minutes
    const tooRecent = lastSyncedAt && (Date.now() - new Date(lastSyncedAt).getTime()) < 2 * 60 * 1000
    if (!tooRecent) void sync()
  }, [sync])

  async function saveNote(productId: string, note: string) {
    setSavingNote(productId)
    try {
      await fetch('/api/sous-location/product-notes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ product_id: productId, note }),
      })
    } finally {
      setSavingNote(null)
    }
  }


  async function createTemporaires() {
    if (selected.size === 0) return
    setCreating(true)
    setCreateMsg(null)
    setError(null)
    const toCreate = items
      .filter(i => selected.has(i.planning_id))
      .map(i => ({
        product_id:  i.product_id,
        location_id: i.location_id,
        quantity:    i.shortage_amount,
        starts_at:   i.starts_at,
        stops_at:    i.stops_at,
      }))
    try {
      const res  = await fetch('/api/sous-location/create-temporaire', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: toCreate }),
      })
      const data = await res.json() as { created?: number; failed?: number; error?: string }
      if (!res.ok || data.error) { setError(data.error ?? 'Erreur inconnue'); return }
      setCreateMsg(`✅ ${data.created} stock${(data.created ?? 0) > 1 ? 's' : ''} temporaire${(data.created ?? 0) > 1 ? 's' : ''} créé${(data.created ?? 0) > 1 ? 's' : ''}${data.failed ? ` (${data.failed} échoué${data.failed > 1 ? 's' : ''})` : ''}`)
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setCreating(false)
    }
  }

  function toggleRow(id: string) {
    setSelected(prev => { const s = new Set(prev); if (s.has(id)) { s.delete(id) } else { s.add(id) } return s })
  }
  function toggleAll() {
    setSelected(selected.size === items.length ? new Set() : new Set(items.map(i => i.planning_id)))
  }

  const orderCount = new Set(items.map(i => i.order_id)).size

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {synced && syncedAt && (
            <span className="text-sm text-gray-500">
              Sync : {new Date(syncedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {synced && items.length > 0 && (
            <span className="text-sm font-semibold text-red-600">
              {items.length} article{items.length > 1 ? 's' : ''} en pénurie sur {orderCount} commande{orderCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => void createTemporaires()}
              disabled={creating}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {creating ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : '+'} {creating ? 'Création…' : `Créer temporaire${selected.size > 1 ? 's' : ''} (${selected.size})`}
            </button>
          )}
          <button
            onClick={() => void sync()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {loading ? 'Synchronisation…' : 'Synchroniser'}
          </button>
        </div>
      </div>

      {error     && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {createMsg && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{createMsg}</div>}

      {!synced && !loading && (
        <div className="p-10 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
          Cliquez sur <strong>Synchroniser</strong> pour charger les articles en pénurie.
        </div>
      )}

      {synced && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-8">
                  {items.length > 0 && (
                    <input type="checkbox" checked={selected.size === items.length && items.length > 0}
                      onChange={toggleAll} className="rounded border-gray-300 accent-gray-900 cursor-pointer" />
                  )}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Article</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Pénurie</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Réservé</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Commande</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Client</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Début</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Fin</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Source sous-location</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-14 text-center text-gray-400">
                    Aucun article en pénurie. 🎉
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.planning_id}
                    className={`hover:bg-red-50/30 transition-colors cursor-pointer ${selected.has(item.planning_id) ? 'bg-emerald-50/40' : ''}`}
                    onClick={() => toggleRow(item.planning_id)}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(item.planning_id)}
                        onChange={() => toggleRow(item.planning_id)}
                        className="rounded border-gray-300 accent-gray-900 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{item.item_name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-700 font-bold text-sm">
                        -{item.shortage_amount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{item.quantity}</td>
                    <td className="px-4 py-3 font-semibold text-gray-700">#{item.order_number}</td>
                    <td className="px-4 py-3 text-gray-500">{item.customer_name}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(item.starts_at)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(item.stops_at)}</td>
                    <td className="px-4 py-3 min-w-[180px]" onClick={e => e.stopPropagation()}>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Chez…"
                          value={notes[item.product_id] ?? ''}
                          onChange={e => setNotes(prev => ({ ...prev, [item.product_id]: e.target.value }))}
                          onBlur={e => { void saveNote(item.product_id, e.target.value) }}
                          className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-gray-400 bg-white placeholder-gray-300"
                        />
                        {savingNote === item.product_id && (
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">⏳</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <a href={item.order_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-medium text-gray-500 hover:text-black border border-gray-200 rounded px-2.5 py-1 hover:border-gray-400 transition-colors">
                        Voir ↗
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
