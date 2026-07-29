'use client'

import { useCallback, useEffect, useState } from 'react'

type TemporaireRow = {
  id:               string
  product_id:       string
  product_group_id: string
  product_name:     string
  tracking_type:    'trackable' | 'bulk'
  location_id:      string
  location_name:    string
  stock_count:      number
  from:             string | null
  till:             string | null
  status:           'expected' | 'in_stock' | 'expired'
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }: { status: TemporaireRow['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    in_stock: { label: 'Actif',   cls: 'bg-green-50  text-green-700  border-green-200' },
    expected: { label: 'À venir', cls: 'bg-blue-50   text-blue-700   border-blue-200'  },
    expired:  { label: 'Expiré',  cls: 'bg-gray-100  text-gray-500   border-gray-200'  },
  }
  const { label, cls } = map[status] ?? map.in_stock
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  )
}

function TrackingBadge({ type }: { type: TemporaireRow['tracking_type'] }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      type === 'trackable' ? 'bg-purple-50 text-purple-700' : 'bg-amber-50 text-amber-700'
    }`}>
      {type === 'trackable' ? 'Trackable' : 'Bulk'}
    </span>
  )
}

export default function TemporaireTable() {
  const [rows, setRows]         = useState<TemporaireRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [synced, setSynced]     = useState(false)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'expected' | 'expired'>('in_stock')

  const [confirming, setConfirming]   = useState<string | null>(null)
  const [deleting, setDeleting]       = useState<Set<string>>(new Set())
  const [deleteError, setDeleteError] = useState<{ id: string; message: string; shortage: boolean } | null>(null)

  const [notes, setNotes]           = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)

  const STORAGE_KEY = 'bq_temporaire_v1'

  const sync = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetch('/api/sous-location/temporaire').then(r => r.json()) as { rows?: TemporaireRow[]; error?: string }
      if (data.error) { setError(data.error); return }
      const now = new Date().toISOString()
      setRows(data.rows ?? [])
      setSyncedAt(now)
      setSynced(true)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: data.rows ?? [], syncedAt: now }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let lastSyncedAt: string | null = null
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as { rows: TemporaireRow[]; syncedAt: string }
        setRows(parsed.rows)
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
    const tooRecent = lastSyncedAt && (Date.now() - new Date(lastSyncedAt).getTime()) < 5 * 60 * 1000
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

  const cancelRow = useCallback(async (row: TemporaireRow, confirmShortage = false) => {
    setDeleting(prev => new Set(prev).add(row.id))
    setDeleteError(null)
    try {
      const res = await fetch('/api/sous-location/temporaire/cancel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_type:    row.tracking_type,
          product_id:       row.product_id,
          product_group_id: row.product_group_id,
          location_id:      row.location_id,
          stock_count:      row.stock_count,
          from:             row.from,
          till:             row.till,
          confirm_shortage: confirmShortage,
        }),
      })
      const data = await res.json() as { success?: boolean; error?: string; shortage?: boolean }
      if (!res.ok || data.error) {
        setDeleteError({ id: row.id, message: data.error ?? 'Erreur inconnue', shortage: data.shortage ?? false })
        return
      }
      setRows(prev => {
        const updated = prev.filter(r => r.id !== row.id)
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: updated, syncedAt: syncedAt ?? new Date().toISOString() }))
        return updated
      })
      setConfirming(null)
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(row.id); return s })
    }
  }, [syncedAt])

  const STATUS_ORDER: Record<string, number> = { in_stock: 0, expected: 1, expired: 2 }
  const byFromDesc = (a: TemporaireRow, b: TemporaireRow) =>
    (b.from ?? '').localeCompare(a.from ?? '')

  const displayed = (() => {
    if (statusFilter === 'all') {
      return [...rows].sort((a, b) => {
        const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        return byStatus !== 0 ? byStatus : byFromDesc(a, b)
      })
    }
    const filtered = rows.filter(r => r.status === statusFilter)
    if (statusFilter === 'expired' || statusFilter === 'expected') {
      return [...filtered].sort(byFromDesc)
    }
    return filtered
  })()

  const counts = {
    all:      rows.length,
    in_stock: rows.filter(r => r.status === 'in_stock').length,
    expected: rows.filter(r => r.status === 'expected').length,
    expired:  rows.filter(r => r.status === 'expired').length,
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {synced && syncedAt && (
            <span>Sync : {new Date(syncedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          )}
        </div>
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

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {!synced && !loading && (
        <div className="p-10 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
          Cliquez sur <strong>Synchroniser</strong> pour charger les stocks temporaires.
        </div>
      )}

      {synced && (
        <>
          <div className="flex gap-1">
            {([
              { id: 'in_stock', label: `Actifs (${counts.in_stock})`  },
              { id: 'expected', label: `À venir (${counts.expected})` },
              { id: 'expired',  label: `Expirés (${counts.expired})`  },
              { id: 'all',      label: `Tous (${counts.all})`         },
            ] as { id: typeof statusFilter; label: string }[]).map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === f.id ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {deleteError && (
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-sm">
              <p className="font-semibold text-orange-800 mb-1">
                {deleteError.shortage ? 'Pénurie détectée' : 'Erreur lors de la suppression'}
              </p>
              <p className="text-orange-700 mb-3">{deleteError.message}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteError(null)}
                  className="px-3 py-1.5 text-sm border border-orange-300 rounded-lg text-orange-700 hover:bg-orange-100"
                >
                  Annuler
                </button>
                {deleteError.shortage && (
                  <button
                    onClick={() => {
                      const row = rows.find(r => r.id === deleteError.id)
                      if (row) { setDeleteError(null); void cancelRow(row, true) }
                    }}
                    className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                  >
                    Forcer malgré la pénurie
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Produit</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Type</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Qté</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Emplacement</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Début</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Fin</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Source sous-location</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-14 text-center text-gray-400">
                      Aucun stock temporaire pour ce filtre.
                    </td>
                  </tr>
                ) : (
                  displayed.map(row => (
                    <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${row.status === 'expired' ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.product_name}</td>
                      <td className="px-4 py-3"><TrackingBadge type={row.tracking_type} /></td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-900">{row.stock_count}</td>
                      <td className="px-4 py-3 text-gray-500">{row.location_name}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(row.from)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(row.till)}</td>
                      <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                      <td className="px-4 py-3 min-w-[180px]">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Chez…"
                            value={notes[row.product_id] ?? ''}
                            onChange={e => setNotes(prev => ({ ...prev, [row.product_id]: e.target.value }))}
                            onBlur={e => { void saveNote(row.product_id, e.target.value) }}
                            className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-gray-400 bg-white placeholder-gray-300"
                          />
                          {savingNote === row.product_id && (
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">⏳</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {confirming === row.id ? (
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-xs text-gray-500">Confirmer ?</span>
                            <button
                              onClick={() => void cancelRow(row)}
                              disabled={deleting.has(row.id)}
                              className="px-2.5 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {deleting.has(row.id) ? '…' : 'Oui'}
                            </button>
                            <button
                              onClick={() => setConfirming(null)}
                              className="px-2.5 py-1 text-xs font-medium border border-gray-300 rounded text-gray-600 hover:bg-gray-100"
                            >
                              Non
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setConfirming(row.id); setDeleteError(null) }}
                            disabled={deleting.has(row.id)}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            Annuler
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400">
            {displayed.length} stock{displayed.length > 1 ? 's' : ''} temporaire{displayed.length > 1 ? 's' : ''} affiché{displayed.length > 1 ? 's' : ''}.
            Les produits <strong>trackable</strong> sont annulés par archivation du stock item.
            Les produits <strong>bulk</strong> sont annulés par un ajustement inverse.
          </p>
        </>
      )}
    </div>
  )
}
