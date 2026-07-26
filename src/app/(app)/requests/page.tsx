'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NewRequestForm from './new/page'

// ── Types partagés ────────────────────────────────────────────────────────────

type Tab = 'chat' | 'new' | 'history'

type Level1Item = { key: string; label: string }
type SubOption  = { label: string; scenario: string; welcome: string }

type PlanningWorkflow = {
  slug: string
  name: string
  chat_label: string | null
  welcome: string | null
  parent_category: string | null
  category: string
  is_active: boolean
}

// ── Composant Chat Planning ───────────────────────────────────────────────────

function PlanningChatPanel() {
  const router = useRouter()
  const [level1Items, setLevel1Items]       = useState<Level1Item[]>([])
  const [workflows, setWorkflows]           = useState<PlanningWorkflow[]>([])
  const [workflowsLoaded, setWorkflowsLoaded] = useState(false)
  const [level1, setLevel1]                 = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/chat-categories?chat_type=planning').then(r => r.json()),
      fetch('/api/returns/workflows').then(r => r.json()),
    ])
      .then(([cats, wfs]) => {
        const categories = (cats.categories ?? []) as Array<{ key: string; label: string; is_active: boolean }>
        setLevel1Items(categories.filter(c => c.is_active).map(c => ({ key: c.key, label: c.label })))
        const allWfs = (wfs.workflows ?? []) as PlanningWorkflow[]
        setWorkflows(allWfs.filter(w => w.is_active && w.category === 'planning'))
        setWorkflowsLoaded(true)
      })
      .catch(() => setWorkflowsLoaded(true))
  }, [])

  // level2Map : workflows groupés par parent_category
  const level2Map: Record<string, SubOption[]> = {}
  for (const wf of workflows) {
    if (!wf.parent_category) continue
    if (!level2Map[wf.parent_category]) level2Map[wf.parent_category] = []
    level2Map[wf.parent_category].push({
      label:    wf.chat_label || wf.name,
      scenario: wf.slug,
      welcome:  wf.welcome || '',
    })
  }
  const visibleLevel1 = level1Items.filter(i => (level2Map[i.key]?.length ?? 0) > 0)

  function selectSubOption(opt: SubOption) {
    router.push(`/requests/new?scenario=${encodeURIComponent(opt.scenario)}`)
  }

  function selectLevel1(key: string) {
    setLevel1(key)
  }

  // ── Sélecteur niveau 1 ──────────────────────────────────────────────────────
  if (!level1) return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
        <div className="w-14 h-14 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-base font-bold text-gray-900 text-center">Que souhaitez-vous faire&nbsp;?</p>
        {!workflowsLoaded ? (
          <span className="text-xs text-gray-400">Chargement…</span>
        ) : visibleLevel1.length === 0 ? (
          <div className="text-center space-y-2">
            <p className="text-sm text-gray-500">Aucun workflow planning configuré.</p>
            <Link href="/assistant/chat" className="text-xs text-indigo-600 hover:underline">
              Configurer les catégories →
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 justify-center">
            {visibleLevel1.map(item => (
              <button
                key={item.key}
                onClick={() => selectLevel1(item.key)}
                className="px-4 py-2 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-all"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ── Sélecteur niveau 2 ──────────────────────────────────────────────────────
  const l1Label   = level1Items.find(i => i.key === level1)?.label ?? level1
  const subOptions = level2Map[level1] ?? []

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
        <div className="w-14 h-14 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-gray-900">Quelle tâche veux-tu exécuter&nbsp;?</p>
          <p className="text-xs text-gray-400 mt-1">{l1Label}</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          {subOptions.map(opt => (
            <button
              key={opt.scenario}
              onClick={() => selectSubOption(opt)}
              className="px-4 py-2 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-all"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setLevel1(null)}
          className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Retour
        </button>
      </div>
    </div>
  )
}

// ── Types historique ──────────────────────────────────────────────────────────

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
  if (status === 'draft') return 'Brouillon'
  if (status === 'pending_validation') return 'Poussée'
  if (status === 'closed') return 'Archivée'
  if (status === 'accepted') return 'Acceptée'
  if (status === 'sent') return 'Envoyée'
  return 'Envoyée'
}

function statusClass(status: string | null | undefined): string {
  if (status === 'draft') return 'bg-amber-50 text-amber-700'
  if (status === 'pending_validation') return 'bg-green-50 text-green-700'
  if (status === 'closed') return 'bg-gray-100 text-gray-600'
  if (status === 'accepted') return 'bg-green-50 text-green-700'
  if (status === 'sent') return 'bg-blue-50 text-blue-700'
  return 'bg-amber-50 text-amber-700'
}

// ── Composant Historique ──────────────────────────────────────────────────────

function RequestsHistoryPanel() {
  const [requests, setRequests]           = useState<RequestRow[]>([])
  const [loading, setLoading]             = useState(true)
  const [statusFilter, setStatusFilter]   = useState<'open' | 'closed' | 'all'>('open')
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [bulkArchiving, setBulkArchiving] = useState(false)

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

  useEffect(() => { setSelected(new Set()) }, [statusFilter])

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id) } else { n.add(id) }; return n })
  }

  function toggleAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id)))
  }

  async function archiveSelected() {
    if (!selected.size || !confirm(`Archiver ${selected.size} demande${selected.size > 1 ? 's' : ''} ?`)) return
    setBulkArchiving(true)
    try {
      await Promise.all(Array.from(selected).map(id =>
        fetch(`/api/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote_status: 'closed' }) })
      ))
      setRequests(prev => prev.map(r => selected.has(r.id) ? { ...r, quote_status: 'closed' } : r))
      setSelected(new Set())
    } finally { setBulkArchiving(false) }
  }

  async function deleteSelected() {
    if (!selected.size || !confirm(`Supprimer définitivement ${selected.size} demande${selected.size > 1 ? 's' : ''} ? Cette action est irréversible.`)) return
    setBulkArchiving(true)
    try {
      await Promise.all(Array.from(selected).map(id => fetch(`/api/conversations/${id}`, { method: 'DELETE' })))
      setRequests(prev => prev.filter(r => !selected.has(r.id)))
      setSelected(new Set())
    } finally { setBulkArchiving(false) }
  }

  const allSelected  = filtered.length > 0 && selected.size === filtered.length
  const someSelected = selected.size > 0

  return (
    <div className="space-y-4">
      {/* Filtres + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg bg-gray-100 p-1 text-sm font-medium text-gray-500">
            {(['open', 'closed', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-md transition-colors ${statusFilter === f ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-700'}`}
              >
                {f === 'open' ? 'Ouvertes' : f === 'closed' ? 'Archivées' : 'Toutes'}
              </button>
            ))}
          </div>
          {someSelected && (
            <span className="text-sm text-gray-500">{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {someSelected && (statusFilter === 'closed' ? (
            <button onClick={() => void deleteSelected()} disabled={bulkArchiving}
              className="flex items-center gap-1.5 text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors">
              {bulkArchiving ? 'Suppression…' : 'Supprimer'}
            </button>
          ) : (
            <button onClick={() => void archiveSelected()} disabled={bulkArchiving}
              className="flex items-center gap-1.5 text-sm text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors">
              {bulkArchiving ? 'Archivage…' : 'Archiver'}
            </button>
          ))}
          {someSelected && <button onClick={() => setSelected(new Set())} className="text-sm text-gray-500 hover:text-gray-900">Annuler</button>}
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-200 bg-white">
              <th className="px-4 py-3 w-8">
                {!loading && filtered.length > 0 && (
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="rounded border-gray-300 accent-gray-900 cursor-pointer" />
                )}
              </th>
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
                  <td className="px-4 py-4" />
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-14 text-center text-sm text-gray-400">Aucun devis pour le moment.</td></tr>
            ) : (
              filtered.map(row => (
                <tr key={row.id}
                  className={`hover:bg-gray-50 transition-colors cursor-pointer ${selected.has(row.id) ? 'bg-blue-50/40' : ''}`}>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)}
                      className="rounded border-gray-300 accent-gray-900 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap" onClick={() => { window.location.href = `/requests/${row.id}` }}>{displayName(row)}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[420px] truncate"          onClick={() => { window.location.href = `/requests/${row.id}` }}>{itemsSummary(row.quote_items)}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap"               onClick={() => { window.location.href = `/requests/${row.id}` }}>{formatDate(row.starts_at)} → {formatDate(row.stops_at)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap" onClick={() => { window.location.href = `/requests/${row.id}` }}>{formatMoney(row.quote_total)}</td>
                  <td className="px-4 py-3 whitespace-nowrap"                             onClick={() => { window.location.href = `/requests/${row.id}` }}>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusClass(row.quote_status)}`}>{statusLabel(row.quote_status)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap"               onClick={() => { window.location.href = `/requests/${row.id}` }}>{formatDate(row.created_at)}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap"               onClick={() => { window.location.href = `/requests/${row.id}` }}>{formatDate(row.expires_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function RequestsPage() {
  const [tab, setTab] = useState<Tab>('chat')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat',    label: 'Chat' },
    { id: 'new',     label: 'Nouvelle demande' },
    { id: 'history', label: 'Historique' },
  ]

  return (
    <div className="flex flex-col h-full gap-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Assistant planning</h1>
        <p className="text-sm text-gray-500 mt-0.5">Devis et demandes générés par votre assistant</p>
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
        {tab === 'chat'    && (
          <div className="h-full" style={{ minHeight: '540px' }}>
            <PlanningChatPanel />
          </div>
        )}
        {tab === 'new'     && <NewRequestForm />}
        {tab === 'history' && <RequestsHistoryPanel />}
      </div>
    </div>
  )
}
