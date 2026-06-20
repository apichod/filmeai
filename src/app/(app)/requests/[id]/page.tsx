'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { type MatchDebug, formatDiagnosticForCopy, rootCauseSummary } from '@/lib/diagnostic-format'

// ── Types ─────────────────────────────────────────────────────────────────────

type Product = {
  id: string
  name: string
  price_per_day: number | null
  deposit?: number | null
  description?: string | null
}

type QuoteItem = {
  uid: string
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
  confidence?: number
  reason?: string | null
  debug?: unknown
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  if (status === 'pending_validation') return 'Poussée'
  if (status === 'closed') return 'Archivée'
  if (status === 'accepted') return 'Acceptée'
  if (status === 'sent') return 'Envoyée'
  return 'Envoyée'
}

function statusClass(status: string | null | undefined) {
  if (status === 'draft') return 'bg-amber-50 text-amber-700'
  if (status === 'pending_validation') return 'bg-green-50 text-green-700'
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

function matchPercent(confidence?: number | null) {
  return Math.max(0, Math.min(100, Math.round((confidence || 0) * 100)))
}
function matchColor(percent: number) {
  return `hsl(${Math.round(percent * 1.2)} 78% 42%)`
}
function matchLabel(percent: number, type: string | undefined) {
  if (type === 'custom_charge') return 'À vérifier'
  if (percent >= 85) return 'Match fort'
  if (percent >= 70) return 'Bon match'
  if (percent >= 50) return 'Proposition à vérifier'
  return 'Match faible'
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}
function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}
function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>
  )
}
function IconDrag() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
      <circle cx="3" cy="3" r="1.5"/>
      <circle cx="9" cy="3" r="1.5"/>
      <circle cx="3" cy="8" r="1.5"/>
      <circle cx="9" cy="8" r="1.5"/>
      <circle cx="3" cy="13" r="1.5"/>
      <circle cx="9" cy="13" r="1.5"/>
    </svg>
  )
}
function Spinner({ size = 16, white = false }: { size?: number; white?: boolean }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`border-2 ${white ? 'border-white/30 border-t-white' : 'border-gray-200 border-t-gray-600'} rounded-full animate-spin flex-shrink-0`}
    />
  )
}
function MatchGauge({ confidence, type, requestedName }: { confidence?: number; type?: string; requestedName?: string }) {
  if (!confidence || type === 'section') return null
  const percent = matchPercent(confidence)
  const color = matchColor(percent)
  return (
    <div className="mt-1.5 flex items-center gap-2" title={`${matchLabel(percent, type)} — ${percent}%`}>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] font-medium tabular-nums" style={{ color }}>{percent}%</span>
      <span className="text-[11px] text-gray-400">
        {matchLabel(percent, type)}
        {requestedName && <span className="text-gray-400"> ({requestedName})</span>}
      </span>
    </div>
  )
}

function MatchDiagnosticSaved({ debug }: { debug: unknown }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const parsed = (debug && typeof debug === 'object' && 'requestedName' in (debug as object))
    ? debug as MatchDebug
    : null
  if (!parsed) return null

  const rootCause = rootCauseSummary(parsed)
  const success = Boolean(parsed.finalChoice)

  async function copy() {
    await navigator.clipboard.writeText(formatDiagnosticForCopy(parsed!))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-[11px] text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
      >
        {open ? 'Masquer le diagnostic IA' : 'Afficher le diagnostic IA'}
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-[11px] font-medium ${success ? 'text-emerald-700' : 'text-red-600'}`}>{rootCause}</p>
            <button
              onClick={copy}
              className="shrink-0 rounded bg-white px-2 py-0.5 text-[10px] border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
            >
              {copied ? 'Copié ✓' : 'Copier log'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Product search dropdown ───────────────────────────────────────────────────

function ProductSearchDropdown({
  placeholder,
  onSelect,
  autoFocus = false,
}: {
  placeholder: string
  onSelect: (p: Product) => void
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const timeout = useRef<NodeJS.Timeout | null>(null)

  function handleChange(q: string) {
    setQuery(q)
    if (timeout.current) clearTimeout(timeout.current)
    if (q.trim().length < 2) { setResults([]); return }
    timeout.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/catalog-search?q=${encodeURIComponent(q.trim())}`)
        setResults(await res.json())
      } finally {
        setLoading(false)
      }
    }, 280)
  }

  function select(p: Product) {
    setQuery('')
    setResults([])
    onSelect(p)
  }

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <span className="absolute left-2.5 text-gray-400 pointer-events-none"><IconSearch /></span>
        <input
          type="text"
          autoFocus={autoFocus}
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-gray-800"
        />
        {loading && <span className="absolute right-2.5"><Spinner size={14} /></span>}
      </div>
      {results.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-52 overflow-y-auto">
          {results.map(p => (
            <button
              key={p.id}
              onMouseDown={() => select(p)}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900">{p.name}</span>
              {p.price_per_day != null && (
                <span className="text-xs text-gray-400 ml-2">{p.price_per_day}€/j</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RequestDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const [editingUid, setEditingUid] = useState<string | null>(null)

  // Drag & drop
  const dragItem = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

  useEffect(() => {
    fetch(`/api/conversations/${params.id}`)
      .then(r => r.json())
      .then((data: RequestDetail) => {
        setRequest(data)
        if (searchParams.get('autoEdit') === '1') {
          setEditing(true)
          router.replace(`/requests/${params.id}`)
        }
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
  const depositTotal = recalculated.reduce((sum, item) => sum + Number(item.lineDeposit || 0), 0)
  const billableCount = items.filter(i => i.type !== 'section').length

  // ── Item mutations ────────────────────────────────────────────────────────

  function removeItemByUid(uid: string) {
    setItems(prev => prev.filter(i => i.uid !== uid))
  }

  function setQuantityByUid(uid: string, delta: number) {
    setItems(prev => prev.map(i => {
      if (i.uid !== uid) return i
      return { ...i, quantity: Math.max(1, (i.quantity || 1) + delta) }
    }))
  }

  function updateItemTitle(uid: string, value: string) {
    setItems(prev => prev.map(i => i.uid !== uid ? i : { ...i, title: value, name: value }))
  }

  function addProduct(p: Product) {
    setItems(prev => [...prev, {
      uid: crypto.randomUUID(),
      type: 'product',
      name: p.name,
      title: p.name,
      requestedName: p.name,
      productId: p.id,
      quantity: 1,
      unitPrice: p.price_per_day || 0,
      deposit: p.deposit || 0,
    }])
  }

  function replaceProduct(uid: string, p: Product) {
    setItems(prev => prev.map(i => {
      if (i.uid !== uid) return i
      return {
        ...i,
        type: 'product',
        name: p.name,
        title: p.name,
        requestedName: p.name,
        productId: p.id,
        unitPrice: p.price_per_day || 0,
        deposit: p.deposit || 0,
      }
    }))
    setEditingUid(null)
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

  // ── Drag & drop ───────────────────────────────────────────────────────────

  function onDragStart(index: number) {
    dragItem.current = index
  }
  function onDragEnter(index: number) {
    dragOver.current = index
  }
  function onDragEnd() {
    if (dragItem.current === null || dragOver.current === null) return
    if (dragItem.current === dragOver.current) { dragItem.current = null; dragOver.current = null; return }
    const next = [...items]
    const [moved] = next.splice(dragItem.current, 1)
    next.splice(dragOver.current, 0, moved)
    setItems(next)
    dragItem.current = null
    dragOver.current = null
  }

  // ── Save ──────────────────────────────────────────────────────────────────

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
      setEditingUid(null)
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
      {/* Header */}
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

      {/* Dates + Context */}
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

      {/* Quote + Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">

        {/* Quote card */}
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

          {/* Product search (edit mode only) */}
          {editing && (
            <div className="mb-4">
              <ProductSearchDropdown
                placeholder="Ajouter un produit du catalogue…"
                onSelect={addProduct}
              />
            </div>
          )}

          {/* Items */}
          <div className="space-y-1.5">
            {items.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-8">Aucun produit dans ce devis.</p>
            )}
            {items.map((item, index) => (
              <div
                key={item.uid}
                draggable={editing && editingUid !== item.uid}
                onDragStart={() => onDragStart(index)}
                onDragEnter={() => onDragEnter(index)}
                onDragEnd={onDragEnd}
                onDragOver={e => e.preventDefault()}
              >
                {item.type === 'section' ? (
                  /* ── Section pill ── */
                  <div className="flex items-center gap-2 py-2 group cursor-grab active:cursor-grabbing">
                    {editing && (
                      <span className="text-gray-300 group-hover:text-gray-400 transition-colors select-none flex-shrink-0">
                        <IconDrag />
                      </span>
                    )}
                    <div className="flex-1 border-t border-gray-200" />
                    {editing ? (
                      <input
                        value={item.title || ''}
                        onChange={e => updateItemTitle(item.uid, e.target.value)}
                        className="text-[11px] uppercase tracking-[0.18em] font-semibold text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-3 py-1 text-center focus:outline-none focus:border-gray-400 w-40"
                      />
                    ) : (
                      <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
                        {item.title}
                      </span>
                    )}
                    <div className="flex-1 border-t border-gray-200" />
                    {editing && (
                      <button
                        onClick={() => removeItemByUid(item.uid)}
                        className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                        title="Supprimer la section"
                      >
                        <IconTrash />
                      </button>
                    )}
                  </div>
                ) : editing && editingUid === item.uid ? (
                  /* ── Inline edit panel ── */
                  <div className="border border-gray-300 rounded-xl p-3 bg-gray-50 space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Nom de la ligne :</p>
                      <input
                        value={item.name || item.title || ''}
                        onChange={e => updateItemTitle(item.uid, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-800"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Ou remplacer par un produit catalogue :</p>
                      <ProductSearchDropdown
                        placeholder="Rechercher un produit…"
                        onSelect={p => replaceProduct(item.uid, p)}
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={() => setEditingUid(null)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Fermer
                    </button>
                  </div>
                ) : (
                  /* ── Normal card ── */
                  <div className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 group transition-colors ${editing ? 'cursor-grab active:cursor-grabbing' : ''} ${item.type === 'custom_charge' ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300' : 'border-gray-100 hover:border-gray-200'}`}>
                    {/* Drag handle (edit only) */}
                    {editing && (
                      <span className="text-gray-300 group-hover:text-gray-400 transition-colors select-none flex-shrink-0">
                        <IconDrag />
                      </span>
                    )}
                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 leading-snug">
                        {item.name || item.title || item.requestedName || '—'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.type === 'product'
                          ? (item.unitPrice && item.unitPrice > 0 ? `${item.unitPrice}€/jour` : 'Prix après dates')
                          : 'Ligne custom Booqable — à vérifier'}
                      </p>
                      {item.confidence != null && (
                        <MatchGauge confidence={item.confidence} type={item.type} requestedName={item.requestedName} />
                      )}
                      {item.debug != null && (
                        <MatchDiagnosticSaved debug={item.debug} />
                      )}
                      {item.type === 'custom_charge' && (
                        <p className="text-[11px] font-semibold text-amber-700 mt-0.5">Intervention humaine requise</p>
                      )}
                      {item.type === 'custom_charge' && item.reason && (
                        <p className="text-[11px] text-amber-700/80 mt-0.5 line-clamp-2">{item.reason}</p>
                      )}
                    </div>
                    {/* Total (read mode) */}
                    {!editing && item.type === 'product' && (
                      <span className="text-sm font-semibold text-gray-900 flex-shrink-0 tabular-nums">
                        {money(item.lineTotal)}
                      </span>
                    )}
                    {/* Quantity controls (edit mode) */}
                    {editing && item.type !== 'section' && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setQuantityByUid(item.uid, -1)}
                          className="w-5 h-5 flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-medium transition-colors bg-white"
                        >
                          −
                        </button>
                        <span className="text-sm font-medium w-4 text-center tabular-nums">{item.quantity || 1}</span>
                        <button
                          onClick={() => setQuantityByUid(item.uid, +1)}
                          className="w-5 h-5 flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-medium transition-colors bg-white"
                        >
                          +
                        </button>
                      </div>
                    )}
                    {/* Edit icon */}
                    {editing && (
                      <button
                        onClick={() => setEditingUid(item.uid)}
                        className="text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0"
                        title="Modifier la ligne"
                      >
                        <IconEdit />
                      </button>
                    )}
                    {/* Delete icon */}
                    {editing && (
                      <button
                        onClick={() => removeItemByUid(item.uid)}
                        className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                        title="Supprimer"
                      >
                        <IconTrash />
                      </button>
                    )}
                    {/* Quantity badge (read mode) */}
                    {!editing && item.type !== 'section' && (
                      <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">×{item.quantity || 1}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add buttons (edit mode) */}
          {editing && (
            <div className="flex gap-2 mt-4">
              <button onClick={addSection} className="border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium hover:bg-gray-50">+ Section</button>
              <button onClick={addCustomLine} className="border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium hover:bg-gray-50">+ Ligne custom</button>
            </div>
          )}

          {/* Totals */}
          {billableCount > 0 && (
            <div className="border-t border-gray-200 mt-6 pt-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>{days} jour{days > 1 ? 's' : ''} de location</span>
                <span className="tabular-nums">{money(total / days)}/jour</span>
              </div>
              {depositTotal > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Caution</span>
                  <span className="tabular-nums">{money(depositTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-gray-900">
                <span>Total estimé</span>
                <span className="tabular-nums">{money(total)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Actions</h2>
              {request.quote_status === 'draft' && !request.booqable_order_id && (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Brouillon</span>
              )}
            </div>
            {editing ? (
              <>
                <button
                  onClick={() => save()}
                  disabled={saving}
                  className="w-full bg-gray-950 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <><Spinner size={14} white /> Sauvegarde…</> : 'Sauvegarder'}
                </button>
                <button
                  onClick={() => { setEditing(false); setEditingUid(null) }}
                  className="w-full border border-gray-200 rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-50"
                >
                  Annuler
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="w-full border border-gray-200 rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-50"
                >
                  ✏️ Modifier le devis
                </button>
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
                    className="w-full bg-gray-950 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-gray-800 flex items-center justify-center gap-2"
                  >
                    {pushing ? <><Spinner size={14} white /> Push en cours…</> : 'Pousser vers Booqable'}
                  </button>
                )}
                {request.booqable_order_url && (
                  <a
                    href={request.booqable_order_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center border border-gray-200 rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-50"
                  >
                    Ouvrir dans Booqable
                  </a>
                )}
              </>
            )}
          </div>

          {/* Client */}
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

          {/* Conversation source */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Conversation source</h2>
            <a href={`/inbox/${request.id}`} className="text-sm font-semibold text-gray-800 hover:underline">Ouvrir la conversation</a>
          </div>
        </div>
      </div>
    </div>
  )
}
