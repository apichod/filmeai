'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type QuoteItem = {
  type?: string
  title?: string
  name?: string
  requestedName?: string
  quantity?: number
}

interface RequestRow {
  id: string
  contact_name: string | null
  contact_email: string | null
  quote_status: string | null
  starts_at: string | null
  stops_at: string | null
  expires_at: string | null
  quote_items: QuoteItem[] | null
  quote_total: number | null
  booqable_order_id: string | null
  booqable_order_url: string | null
  created_at: string
  updated_at: string
  last_message: { content: string; role: string; created_at: string } | null
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
}

function displayName(row: RequestRow): string {
  return row.contact_name || row.contact_email || 'Visiteur anonyme'
}

function itemsSummary(items: QuoteItem[] | null | undefined): string {
  const realItems = (items || []).filter(item => item.type !== 'section')
  if (realItems.length === 0) return '—'
  return realItems
    .slice(0, 3)
    .map(item => `${item.quantity || 1}× ${item.name || item.title || item.requestedName || 'Article'}`)
    .join(', ') + (realItems.length > 3 ? '…' : '')
}

function statusLabel(status: string | null | undefined): string {
  if (status === 'closed') return 'Archivée'
  if (status === 'accepted') return 'Acceptée'
  if (status === 'sent') return 'Envoyée'
  return 'Envoyée'
}

function statusClass(status: string | null | undefined): string {
  if (status === 'closed') return 'bg-gray-100 text-gray-600'
  if (status === 'accepted') return 'bg-green-50 text-green-700'
  if (status === 'sent') return 'bg-blue-50 text-blue-700'
  return 'bg-amber-50 text-amber-700'
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed' | 'all'>('open')

  useEffect(() => {
    fetch('/api/conversations')
      .then(r => r.json())
      .then((data: RequestRow[]) => {
        if (!Array.isArray(data)) { setRequests([]); return }
        setRequests(data.filter(c => c.booqable_order_id || (c.quote_items || []).length > 0))
      })
      .catch(() => setRequests([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return requests
    if (statusFilter === 'closed') return requests.filter(r => r.quote_status === 'closed')
    return requests.filter(r => r.quote_status !== 'closed')
  }, [requests, statusFilter])

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Demandes &amp; devis</h1>
          <p className="text-sm text-gray-500 mt-1">Les demandes qualifiées et devis générés par votre assistant.</p>
        </div>
        <Link
          href="/requests/new"
          className="bg-gray-950 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-800 transition-colors"
        >
          + Nouvelle demande
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="space-y-3">
          <div className="inline-flex rounded-lg bg-gray-100 p-1 text-sm font-medium text-gray-500">
            <button className="px-3 py-1.5 rounded-md bg-white text-gray-900 shadow-sm">Devis</button>
            <button className="px-3 py-1.5 rounded-md">Hors catalogue</button>
          </div>
          <div className="inline-flex rounded-lg bg-gray-100 p-1 text-sm font-medium text-gray-500">
            <button
              onClick={() => setStatusFilter('open')}
              className={`px-3 py-1.5 rounded-md ${statusFilter === 'open' ? 'bg-white text-gray-900 shadow-sm' : ''}`}
            >
              Ouvertes
            </button>
            <button
              onClick={() => setStatusFilter('closed')}
              className={`px-3 py-1.5 rounded-md ${statusFilter === 'closed' ? 'bg-white text-gray-900 shadow-sm' : ''}`}
            >
              Archivées
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-md ${statusFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : ''}`}
            >
              Toutes
            </button>
          </div>
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'open' | 'closed' | 'all')}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:border-gray-800"
        >
          <option value="all">Tous les statuts</option>
          <option value="open">Ouvertes</option>
          <option value="closed">Archivées</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-200 bg-white">
              <th className="text-left px-4 py-3 font-semibold">Client</th>
              <th className="text-left px-4 py-3 font-semibold">Articles</th>
              <th className="text-left px-4 py-3 font-semibold">Location</th>
              <th className="text-right px-4 py-3 font-semibold">Montant</th>
              <th className="text-left px-4 py-3 font-semibold">Statut</th>
              <th className="text-left px-4 py-3 font-semibold">Créée le</th>
              <th className="text-left px-4 py-3 font-semibold">Expiration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse w-24" /></td>
                  <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse w-80" /></td>
                  <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse w-40" /></td>
                  <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse w-20 ml-auto" /></td>
                  <td className="px-4 py-4"><div className="h-6 bg-gray-100 rounded-full animate-pulse w-36" /></td>
                  <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse w-24" /></td>
                  <td className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse w-24" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center text-sm text-gray-400">
                  Aucun devis pour le moment.
                </td>
              </tr>
            ) : (
              filtered.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => { window.location.href = `/requests/${row.id}` }}>
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{displayName(row)}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[420px] truncate">{itemsSummary(row.quote_items)}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(row.starts_at)} → {formatDate(row.stops_at)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{formatMoney(row.quote_total)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusClass(row.quote_status)}`}>
                      {statusLabel(row.quote_status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(row.expires_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
