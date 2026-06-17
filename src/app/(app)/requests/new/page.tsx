'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type BooqableCustomer = {
  id: string
  name: string
  email: string | null
  phone: string | null
}

type Product = {
  id: string
  name: string
  price_per_day: number | null
  description?: string | null
}

type QuoteItem = {
  uid: string
  product: Product
  quantity: number
  requestedName: string
}

type Step = 'client' | 'quote'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function tomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}
function daysBetween(a: string, b: string) {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000))
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

export default function NewRequestPage() {
  const router = useRouter()

  // ── Step
  const [step, setStep] = useState<Step>('client')

  // ── Client
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientBooqableId, setClientBooqableId] = useState<string | null>(null)

  // ── Customer search
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<BooqableCustomer[]>([])
  const [customerSearching, setCustomerSearching] = useState(false)
  const customerTimeout = useRef<NodeJS.Timeout | null>(null)

  // ── Chat / parse
  const [message, setMessage] = useState('')
  const [parsing, setParsing] = useState(false)
  const [chatHistory, setChatHistory] = useState<{ text: string; found: number }[]>([])

  // ── Quote items
  const [items, setItems] = useState<QuoteItem[]>([])

  // ── Dates
  const [startsAt, setStartsAt] = useState(todayStr())
  const [stopsAt, setStopsAt] = useState(tomorrowStr())

  // ── Edit item
  const [editingUid, setEditingUid] = useState<string | null>(null)

  // ── Drag & drop
  const dragItem = useRef<number | null>(null)

  // ── Submit
  const [submitting, setSubmitting] = useState(false)
  const [quoteResult, setQuoteResult] = useState<{ orderId: string; orderUrl: string } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Customer search
  function handleCustomerSearch(q: string) {
    setCustomerQuery(q)
    if (customerTimeout.current) clearTimeout(customerTimeout.current)
    if (q.trim().length < 2) { setCustomerResults([]); return }
    customerTimeout.current = setTimeout(async () => {
      setCustomerSearching(true)
      try {
        const res = await fetch(`/api/customer-search?q=${encodeURIComponent(q.trim())}`)
        setCustomerResults(await res.json())
      } finally {
        setCustomerSearching(false)
      }
    }, 280)
  }

  function selectExistingCustomer(c: BooqableCustomer) {
    setClientName(c.name)
    setClientEmail(c.email || '')
    setClientPhone(c.phone || '')
    setClientBooqableId(c.id)
    setCustomerQuery('')
    setCustomerResults([])
  }

  // ── Step 1 submit
  function handleClientSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientName.trim()) return
    setStep('quote')
  }

  // ── Parse message → products in order
  async function handleSend() {
    const text = message.trim()
    if (!text || parsing) return
    setMessage('')
    setParsing(true)
    try {
      const res = await fetch('/api/parse-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json() as {
        items?: { requestedName: string; matched: Product | null; quantity?: number }[]
        error?: string
      }

      const found = (data.items || []).filter(i => i.matched)
      const newItems: QuoteItem[] = found.map(i => ({
        uid: crypto.randomUUID(),
        product: i.matched!,
        quantity: Math.max(1, i.quantity || 1),
        requestedName: i.requestedName,
      }))

      setItems(prev => [...prev, ...newItems])
      setChatHistory(prev => [...prev, { text, found: found.length }])
    } catch {
      setChatHistory(prev => [...prev, { text, found: 0 }])
    } finally {
      setParsing(false)
    }
  }

  // ── Item operations
  function setQuantity(uid: string, delta: number) {
    setItems(prev => prev.map(item =>
      item.uid === uid ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ))
  }
  function removeItem(uid: string) {
    setItems(prev => prev.filter(item => item.uid !== uid))
    if (editingUid === uid) setEditingUid(null)
  }
  function replaceProduct(uid: string, product: Product) {
    setItems(prev => prev.map(item => item.uid === uid ? { ...item, product } : item))
    setEditingUid(null)
  }
  function addProduct(product: Product) {
    setItems(prev => [...prev, {
      uid: crypto.randomUUID(),
      product,
      quantity: 1,
      requestedName: product.name,
    }])
  }

  // ── Drag & drop (reorder)
  function onDragStart(index: number) {
    dragItem.current = index
  }
  function onDragEnter(index: number) {
    if (dragItem.current === null || dragItem.current === index) return
    setItems(prev => {
      const next = [...prev]
      const [dragged] = next.splice(dragItem.current!, 1)
      next.splice(index, 0, dragged)
      dragItem.current = index
      return next
    })
  }
  function onDragEnd() {
    dragItem.current = null
  }

  // ── Submit quote
  async function handleSubmit() {
    if (items.length === 0 || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/create-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            name: clientName,
            email: clientEmail || undefined,
            phone: clientPhone || undefined,
            booqableId: clientBooqableId || undefined,
          },
          items: items.map(i => ({ productId: i.product.id, quantity: i.quantity })),
          startsAt: new Date(startsAt + 'T09:00:00').toISOString(),
          stopsAt: new Date(stopsAt + 'T18:00:00').toISOString(),
        }),
      })
      const data = await res.json() as { orderId?: string; orderUrl?: string; error?: string }
      if (data.error) throw new Error(data.error)
      if (data.orderUrl) setQuoteResult({ orderId: data.orderId!, orderUrl: data.orderUrl })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erreur lors de la création du devis')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Total
  const totalPerDay = items.reduce((acc, item) =>
    acc + (item.product.price_per_day || 0) * item.quantity, 0
  )
  const days = daysBetween(startsAt, stopsAt)

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1: Client info
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 'client') {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Nouvelle demande</h1>
            <p className="text-sm text-gray-500 mt-0.5">Construisez un devis avec votre client et poussez-le dans Booqable.</p>
          </div>
          <button
            onClick={() => router.push('/requests')}
            className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
          >
            ← Retour
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <span>👤</span> Client
          </h2>
          <p className="text-xs text-gray-500 mb-5">
            Choisissez un client existant (vos contacts Booqable) ou renseignez un nouveau client.
          </p>

          {/* Existing customer search */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">Client existant</label>
            <div className="relative">
              <div className="relative flex items-center">
                <span className="absolute left-2.5 text-gray-400 pointer-events-none"><IconSearch /></span>
                <input
                  type="text"
                  value={customerQuery}
                  onChange={e => handleCustomerSearch(e.target.value)}
                  placeholder="Rechercher par nom, email, téléphone…"
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-gray-800"
                />
                {customerSearching && <span className="absolute right-2.5"><Spinner size={14} /></span>}
              </div>
              {customerResults.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
                  {customerResults.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => selectExistingCustomer(c)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-400">
                        {[c.email, c.phone].filter(Boolean).join(' · ')}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                ou nouveau client
              </span>
            </div>
          </div>

          {/* New client form */}
          <form onSubmit={handleClientSubmit} className="space-y-3">
            {clientBooqableId && (
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                <span>✓ Client Booqable sélectionné : <strong>{clientName}</strong></span>
                <button
                  type="button"
                  onClick={() => { setClientBooqableId(null); setClientName(''); setClientEmail(''); setClientPhone('') }}
                  className="text-gray-400 hover:text-gray-700"
                >
                  ×
                </button>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nom *</label>
              <input
                type="text"
                placeholder="Nom du client"
                value={clientName}
                onChange={e => { setClientName(e.target.value); setClientBooqableId(null) }}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                placeholder="client@exemple.fr"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone</label>
              <input
                type="tel"
                placeholder="06 12 34 56 78"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-800"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors mt-1"
            >
              Démarrer le devis →
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2: Split view
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 96px)' }}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Nouvelle demande</h1>
          <p className="text-sm text-gray-500 mt-0.5">Devis pour {clientName}</p>
        </div>
        <button
          onClick={() => router.push('/requests')}
          className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
        >
          ← Retour aux demandes
        </button>
      </div>

      {/* Split view */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── LEFT: Assistant ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <p className="text-sm font-semibold text-gray-900">Assistant</p>
            <p className="text-xs text-gray-400">Devis pour {clientName}</p>
          </div>

          {/* Chat history */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatHistory.length === 0 && !parsing && (
              <p className="text-sm text-gray-400 text-center mt-8 leading-relaxed">
                Collez la demande reçue (matériel, dates) :<br />
                je remplis le devis à droite.
              </p>
            )}
            {chatHistory.map((entry, i) => (
              <div key={i} className="space-y-1.5">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="max-w-[80%] bg-gray-900 text-white rounded-2xl rounded-br-sm px-3 py-2 text-sm">
                    {entry.text}
                  </div>
                </div>
                {/* Bot response */}
                <div className="flex justify-start">
                  <div className="max-w-[80%] bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
                    {entry.found === 0
                      ? "Aucun produit trouvé dans le catalogue. Précisez le nom du matériel."
                      : `✓ ${entry.found} produit${entry.found > 1 ? 's' : ''} ajouté${entry.found > 1 ? 's' : ''} au devis.`
                    }
                  </div>
                </div>
              </div>
            ))}
            {parsing && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-2">
                  <Spinner size={14} />
                  <span className="text-sm text-gray-500">Analyse en cours…</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3 flex-shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Écrivez un message…"
                rows={2}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-gray-800"
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || parsing}
                className="bg-gray-900 text-white rounded-xl px-3 py-2 flex items-center justify-center hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Quote panel ──────────────────────────────────────────── */}
        <div className="w-[520px] flex-shrink-0 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
            <span>📋</span>
            <p className="text-sm font-semibold text-gray-900">Devis</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Dates */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Début de location</label>
                <input
                  type="date"
                  value={startsAt}
                  onChange={e => setStartsAt(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fin de location</label>
                <input
                  type="date"
                  value={stopsAt}
                  onChange={e => setStopsAt(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-gray-800"
                />
              </div>
            </div>

            {/* Ajouter un produit manuellement */}
            <ProductSearchDropdown
              placeholder="Ajouter un produit au catalogue…"
              onSelect={addProduct}
            />

            {/* Product list */}
            <div>
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8 leading-relaxed">
                  Ajoutez des produits pour chiffrer le devis.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {items.map((item, index) => (
                    <div
                      key={item.uid}
                      draggable={editingUid !== item.uid}
                      onDragStart={() => onDragStart(index)}
                      onDragEnter={() => onDragEnter(index)}
                      onDragEnd={onDragEnd}
                      onDragOver={e => e.preventDefault()}
                    >
                      {editingUid === item.uid ? (
                        /* ── Edit mode ── */
                        <div className="border border-gray-300 rounded-xl p-3 bg-gray-50">
                          <p className="text-xs text-gray-500 mb-2">Remplacer par :</p>
                          <ProductSearchDropdown
                            placeholder="Rechercher un produit…"
                            onSelect={p => replaceProduct(item.uid, p)}
                            autoFocus
                          />
                          <button
                            onClick={() => setEditingUid(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 mt-2"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        /* ── Normal mode ── */
                        <div className="flex items-center gap-2 border border-gray-100 rounded-xl px-3 py-2.5 hover:border-gray-200 group transition-colors cursor-grab active:cursor-grabbing active:shadow-md active:border-gray-300">
                          {/* Drag handle */}
                          <span className="text-gray-300 group-hover:text-gray-400 transition-colors select-none flex-shrink-0">
                            <IconDrag />
                          </span>
                          {/* Product info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 leading-snug">{item.product.name}</p>
                            <p className="text-xs text-gray-400">
                              {item.product.price_per_day != null ? `${item.product.price_per_day}€/jour` : 'Prix sur demande'}
                            </p>
                          </div>
                          {/* Quantity */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => setQuantity(item.uid, -1)}
                              className="w-5 h-5 flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-medium transition-colors"
                            >
                              −
                            </button>
                            <span className="text-sm font-medium w-4 text-center tabular-nums">{item.quantity}</span>
                            <button
                              onClick={() => setQuantity(item.uid, +1)}
                              className="w-5 h-5 flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-medium transition-colors"
                            >
                              +
                            </button>
                          </div>
                          {/* Edit */}
                          <button
                            onClick={() => setEditingUid(item.uid)}
                            className="text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0"
                            title="Modifier le produit"
                          >
                            <IconEdit />
                          </button>
                          {/* Delete */}
                          <button
                            onClick={() => removeItem(item.uid)}
                            className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                            title="Supprimer"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Total */}
            {items.length > 0 && (
              <div className="border-t border-gray-100 pt-3 space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{days} jour{days > 1 ? 's' : ''} × {totalPerDay}€/jour</span>
                  <span>{totalPerDay}€/j</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-gray-900">
                  <span>Total estimé</span>
                  <span>{(totalPerDay * days).toFixed(2)}€</span>
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="border-t border-gray-100 p-4 flex-shrink-0">
            {quoteResult ? (
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-green-600">✅ Devis créé dans Booqable !</p>
                <a
                  href={quoteResult.orderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  Voir le devis →
                </a>
                <button
                  onClick={() => router.push('/requests')}
                  className="block w-full text-xs text-gray-400 hover:text-gray-600 pt-1"
                >
                  Retour aux demandes
                </button>
              </div>
            ) : (
              <>
                {submitError && (
                  <p className="text-xs text-red-500 mb-2 text-center">{submitError}</p>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={items.length === 0 || submitting}
                  className="w-full bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {submitting ? (
                    <><Spinner size={16} white /> Création du devis…</>
                  ) : (
                    '✓ Valider & pousser dans Booqable'
                  )}
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
