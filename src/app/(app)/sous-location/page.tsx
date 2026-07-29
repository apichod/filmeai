'use client'

import { useCallback, useEffect, useState } from 'react'
import WorkflowChatPanel from '@/components/WorkflowChatPanel'

// ── Types ──────────────────────────────────────────────────────────────────────

type ShortageItem = {
  planning_id:     string
  order_id:        string
  order_number:    number
  customer_name:   string
  item_name:       string
  quantity:        number
  shortage_amount: number
  starts_at:       string
  stops_at:        string
  order_url:       string
}

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

type Tab = 'chat' | 'shortage' | 'temporaire'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }: { status: TemporaireRow['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    in_stock: { label: 'Actif',    cls: 'bg-green-50  text-green-700  border-green-200'  },
    expected: { label: 'À venir',  cls: 'bg-blue-50   text-blue-700   border-blue-200'   },
    expired:  { label: 'Expiré',   cls: 'bg-gray-100  text-gray-500   border-gray-200'   },
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

// ── Table des pénuries ────────────────────────────────────────────────────────

function ShortageTable() {
  const [items, setItems]       = useState<ShortageItem[]>([])
  const [loading, setLoading]   = useState(false)
  const [synced, setSynced]     = useState(false)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const STORAGE_KEY = 'bq_shortage_v2'

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as { items: ShortageItem[]; syncedAt: string }
        setItems(parsed.items)
        setSyncedAt(parsed.syncedAt)
        setSynced(true)
      }
    } catch { /* ignore */ }
  }, [])

  async function sync() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetch('/api/sous-location/shortage').then(r => r.json()) as { items?: ShortageItem[]; error?: string }
      if (data.error) { setError(data.error); return }
      const now = new Date().toISOString()
      setItems(data.items ?? [])
      setSyncedAt(now)
      setSynced(true)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: data.items ?? [], syncedAt: now }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  // Compte de commandes distinctes en shortage
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
        <button
          onClick={sync}
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
          Cliquez sur <strong>Synchroniser</strong> pour charger les articles en pénurie.
        </div>
      )}

      {synced && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Article</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Pénurie</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Réservé</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Commande</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Client</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Début</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Fin</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center text-gray-400">
                    Aucun article en pénurie. 🎉
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.planning_id} className="hover:bg-red-50/30 transition-colors">
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
                    <td className="px-4 py-3 text-right">
                      <a
                        href={item.order_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-gray-500 hover:text-black border border-gray-200 rounded px-2.5 py-1 hover:border-gray-400 transition-colors"
                      >
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

// ── Table des stocks temporaires ──────────────────────────────────────────────

function TemporaireTable() {
  const [rows, setRows]         = useState<TemporaireRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [synced, setSynced]     = useState(false)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'expected' | 'expired'>('all')

  // Confirmation / suppression
  const [confirming, setConfirming]   = useState<string | null>(null) // row.id en cours
  const [deleting, setDeleting]       = useState<Set<string>>(new Set())
  const [deleteError, setDeleteError] = useState<{ id: string; message: string; shortage: boolean } | null>(null)

  const STORAGE_KEY = 'bq_temporaire_v1'

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as { rows: TemporaireRow[]; syncedAt: string }
        setRows(parsed.rows)
        setSyncedAt(parsed.syncedAt)
        setSynced(true)
      }
    } catch { /* ignore */ }
  }, [])

  async function sync() {
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
      // Succès — retire la ligne et met à jour le cache
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

  const displayed = statusFilter === 'all' ? rows : rows.filter(r => r.status === statusFilter)

  const counts = {
    all:      rows.length,
    in_stock: rows.filter(r => r.status === 'in_stock').length,
    expected: rows.filter(r => r.status === 'expected').length,
    expired:  rows.filter(r => r.status === 'expired').length,
  }

  return (
    <div className="space-y-4">
      {/* Barre d'outils */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {synced && syncedAt && (
            <span>Sync : {new Date(syncedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          )}
        </div>
        <button
          onClick={sync}
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
          {/* Filtres statut */}
          <div className="flex gap-1">
            {([
              { id: 'all',      label: `Tous (${counts.all})`           },
              { id: 'in_stock', label: `Actifs (${counts.in_stock})`    },
              { id: 'expected', label: `À venir (${counts.expected})`   },
              { id: 'expired',  label: `Expirés (${counts.expired})`    },
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

          {/* Modal erreur pénurie */}
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

          {/* Table */}
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
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-14 text-center text-gray-400">
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

// ── Page principale ───────────────────────────────────────────────────────────

export default function SousLocationPage() {
  const [tab, setTab] = useState<Tab>('chat')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat',       label: 'Chat' },
    { id: 'shortage',   label: 'Shortage' },
    { id: 'temporaire', label: 'Temporaire' },
  ]

  return (
    <div className="flex flex-col h-full gap-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Assistant sous-location</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestion des stocks temporaires et sous-locations</p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200 -mb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'chat' && (
          <div className="h-full" style={{ minHeight: '540px' }}>
            <WorkflowChatPanel chatType="sous-location" />
          </div>
        )}
        {tab === 'shortage'   && <ShortageTable />}
        {tab === 'temporaire' && <TemporaireTable />}
      </div>
    </div>
  )
}
