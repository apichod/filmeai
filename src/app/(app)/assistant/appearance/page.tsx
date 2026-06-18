'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

type Settings = {
  primary_color: string
  bubble_icon: string
  position: string
  size: string
  assistant_name: string
  show_teaser: boolean
  teaser_text: string
  teaser_delay: number
  attract_attention: boolean
  show_branding: boolean
  organization_id?: string
}

const ICONS = [
  { value: 'bubble', label: 'Bulle' },
  { value: 'message', label: 'Message' },
  { value: 'sparkles', label: 'Étincelles' },
  { value: 'support', label: 'Support' },
  { value: 'quote', label: 'Devis' },
  { value: 'media', label: 'Photo/Vidéo' },
  { value: 'robot', label: 'Robot' },
  { value: 'question', label: 'Question' },
]

const ICON_PATHS: Record<string, string> = {
  bubble: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  message: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  sparkles: 'M5 3v4M3 5h4M6.343 17.657l-2.829 2.829M17.657 6.343l2.829-2.828M19 11v4m2-2h-4',
  support: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z',
  quote: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  media: 'M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  robot: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  question: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
}

const COLOR_PRESETS = [
  { label: 'Filme', value: '#000000' },
  { label: 'Anthracite', value: '#111827' },
  { label: 'Ardoise', value: '#334155' },
  { label: 'Bleu', value: '#2563eb' },
  { label: 'Vert', value: '#16a34a' },
  { label: 'Orange', value: '#ea580c' },
]

const TEASER_SUGGESTIONS = [
  'Besoin d’un devis ? Je suis là 👋',
  'Collez votre liste matériel ici',
  'Je peux vous aider à choisir le bon kit',
]

const defaults: Settings = {
  primary_color: '#000000',
  bubble_icon: 'bubble',
  position: 'right',
  size: 'standard',
  assistant_name: 'FilmeAI',
  show_teaser: false,
  teaser_text: '',
  teaser_delay: 2,
  attract_attention: false,
  show_branding: true,
}

type PreviewDevice = 'desktop' | 'mobile'

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function safeColor(value: string) {
  return isHexColor(value) ? value : defaults.primary_color
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastWithWhite(hex: string) {
  const lum = relativeLuminance(hex)
  return (1.05 / (lum + 0.05))
}

function clampWidth(value: number) {
  return Math.min(620, Math.max(340, value))
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${value ? 'bg-black' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  )
}

function SvgIcon({ icon, className = 'w-5 h-5' }: { icon: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={ICON_PATHS[icon] ?? ICON_PATHS.bubble} />
    </svg>
  )
}

function SegmentedButton<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-1">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ── Types for chat ────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  products?: Product[]
  quoteMatches?: QuoteMatch[]
}

type Product = {
  id: string
  name: string
  description: string | null
  price_per_day: number | null
  is_bundle?: boolean
  bundle_items?: string[]
}

type QuoteMatch = {
  requestedName: string
  section: string | null
  quantity: number
  matched: Product | null
  confidence: number
  alternatives: Product[]
}

// ── Interactive chat widget ───────────────────────────────────────────────────

function ChatWidget({ s, height = 480, onClose }: { s: Settings; height?: number; onClose?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [pendingProducts, setPendingProducts] = useState<Product[]>([])
  const [streamQuoteMatches, setStreamQuoteMatches] = useState<QuoteMatch[]>([])
  const [editingPreviewKeys, setEditingPreviewKeys] = useState<Record<string, boolean>>({})
  const [selectedPreviewProducts, setSelectedPreviewProducts] = useState<Record<string, Product>>({})
  const [leaveToFilmeKeys, setLeaveToFilmeKeys] = useState<Record<string, boolean>>({})
  const [manualOpenKeys, setManualOpenKeys] = useState<Record<string, boolean>>({})
  const [manualQueries, setManualQueries] = useState<Record<string, string>>({})
  const [manualResults, setManualResults] = useState<Record<string, Product[]>>({})
  const [manualLoadingKeys, setManualLoadingKeys] = useState<Record<string, boolean>>({})
  const [removedPreviewKeys, setRemovedPreviewKeys] = useState<Record<string, boolean>>({})
  const [sessionData, setSessionData] = useState<{ selectedProductIds: string[]; conversationId: string | null }>({ selectedProductIds: [], conversationId: null })
  const [showDevisChoice, setShowDevisChoice] = useState(false)
  const [showDevisForm, setShowDevisForm] = useState(false)
  const [devisForm, setDevisForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [devisFormStatus, setDevisFormStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [devisFormError, setDevisFormError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const manualSearchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const color = safeColor(s.primary_color)

  const chips = ['Faire un devis', 'Disponibilité ?', 'Question technique']

  function scrollBottom() {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, 50)
  }

  function reset() {
    setMessages([])
    setInput('')
    setStreamText('')
    setPendingProducts([])
    setStreamQuoteMatches([])
    setEditingPreviewKeys({})
    setSelectedPreviewProducts({})
    setLeaveToFilmeKeys({})
    setManualOpenKeys({})
    setManualQueries({})
    setManualResults({})
    setManualLoadingKeys({})
    setRemovedPreviewKeys({})
    setLoading(false)
    setSessionData({ selectedProductIds: [], conversationId: null })
    setShowDevisChoice(false)
    setShowDevisForm(false)
    setDevisForm({ name: '', email: '', phone: '', message: '' })
    setDevisFormStatus('idle')
    setDevisFormError('')
  }

  const send = useCallback(async (text: string) => {
    const t = text.trim()
    if (!t || loading) return
    setInput('')

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: t }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setStreamText('')
    setPendingProducts([])
    setStreamQuoteMatches([])
    setEditingPreviewKeys({})
    setSelectedPreviewProducts({})
    setLeaveToFilmeKeys({})
    setManualOpenKeys({})
    setManualQueries({})
    setManualResults({})
    setManualLoadingKeys({})
    setRemovedPreviewKeys({})
    scrollBottom()

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, sessionData }),
      })

      if (!res.body) throw new Error('No stream')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let localProducts: Product[] = []
      let localQuoteMatches: QuoteMatch[] = []

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type: string
              content?: string
              message?: string
              products?: Product[]
              items?: QuoteMatch[]
              item?: QuoteMatch
              index?: number
              total?: number
              conversationId?: string
            }

            if (evt.type === 'delta' && evt.content) {
              accumulated += evt.content
              setStreamText(accumulated)
              scrollBottom()
            } else if (evt.type === 'progress' && evt.message && !accumulated) {
              setStreamText(evt.message)
              scrollBottom()
            } else if (evt.type === 'selected_products' && evt.products) {
              localProducts = evt.products
              setPendingProducts(evt.products)
              setSessionData(prev => ({ ...prev, selectedProductIds: evt.products?.map(p => p.id) || prev.selectedProductIds }))
            } else if (evt.type === 'quote_match_item' && evt.item) {
              localQuoteMatches = [...localQuoteMatches, evt.item]
              setStreamQuoteMatches(localQuoteMatches)
              const selectedIds = localQuoteMatches
                .filter(item => item.matched && item.confidence >= 0.8)
                .map(item => item.matched!.id)
              setSessionData(prev => ({ ...prev, selectedProductIds: selectedIds }))
              scrollBottom()
            } else if (evt.type === 'quote_matches' && evt.items) {
              localQuoteMatches = evt.items as QuoteMatch[]
              const selectedIds = localQuoteMatches
                .filter(item => item.matched && item.confidence >= 0.8)
                .map(item => item.matched!.id)
              setSessionData(prev => ({ ...prev, selectedProductIds: selectedIds }))
              setStreamQuoteMatches(localQuoteMatches)
            } else if (evt.type === 'conversation_saved' && evt.conversationId) {
              setSessionData(prev => ({ ...prev, conversationId: evt.conversationId as string }))
            } else if (evt.type === 'done') {
              const assistantMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: accumulated,
                products: localProducts.length > 0 ? localProducts : undefined,
                quoteMatches: localQuoteMatches.length > 0 ? localQuoteMatches : undefined,
              }
              setMessages(prev => [...prev, assistantMsg])
              setStreamText('')
              setPendingProducts([])
              setStreamQuoteMatches([])
              localProducts = []
              localQuoteMatches = []
              scrollBottom()
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      console.error(err)
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'Désolé, une erreur est survenue. Vérifiez votre connexion.' }])
    } finally {
      setLoading(false)
      setStreamText('')
      setStreamQuoteMatches([])
      inputRef.current?.focus()
    }
  }, [loading, messages, sessionData])

  function displayProductName(product: Product) {
    return product.name
      // Sécurité UI : React peut rendre un 0 quand une condition utilise length.
      // On nettoie aussi ici pour éviter les noms visuels type "FX60" / "RX 7500".
      .replace(/\bFX([369])0\b/g, 'FX$1')
      .replace(/\b(RX\s*750)0\b/gi, '$1')
      .replace(/\b(RX\s*1500)0\b/gi, '$1')
  }

  function hasBundleLabel(product?: Product | null) {
    return Boolean(product?.is_bundle || (product?.bundle_items?.length || 0) > 0)
  }

  function choosePreviewProduct(product: Product, cardKey?: string) {
    setSessionData(prev => ({
      ...prev,
      selectedProductIds: Array.from(new Set([...prev.selectedProductIds, product.id])),
    }))
    if (cardKey) {
      setSelectedPreviewProducts(prev => ({ ...prev, [cardKey]: product }))
      setLeaveToFilmeKeys(prev => ({ ...prev, [cardKey]: false }))
      setEditingPreviewKeys(prev => ({ ...prev, [cardKey]: false }))
      setManualOpenKeys(prev => ({ ...prev, [cardKey]: false }))
    }
  }

  function removePreviewProduct(productId: string) {
    setSessionData(prev => ({
      ...prev,
      selectedProductIds: prev.selectedProductIds.filter(id => id !== productId),
    }))
  }

  function removePreviewCard(key: string, product?: Product | null) {
    if (product) removePreviewProduct(product.id)
    setRemovedPreviewKeys(prev => ({ ...prev, [key]: true }))
  }

  function togglePreviewEdit(key: string) {
    setEditingPreviewKeys(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function leavePreviewToFilme(key: string, product?: Product | null) {
    setLeaveToFilmeKeys(prev => ({ ...prev, [key]: true }))
    setEditingPreviewKeys(prev => ({ ...prev, [key]: false }))
    setManualOpenKeys(prev => ({ ...prev, [key]: false }))
    setSelectedPreviewProducts(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    if (product) removePreviewProduct(product.id)
  }

  function toggleManualSearch(key: string) {
    setManualOpenKeys(prev => {
      const nextOpen = !prev[key]
      if (nextOpen) {
        setManualQueries(q => ({ ...q, [key]: '' }))
        setManualResults(r => ({ ...r, [key]: [] }))
        setManualLoadingKeys(l => ({ ...l, [key]: false }))
      }
      return { ...prev, [key]: nextOpen }
    })
  }

  function searchPreviewCatalog(key: string, query: string) {
    setManualQueries(prev => ({ ...prev, [key]: query }))
    if (manualSearchTimers.current[key]) clearTimeout(manualSearchTimers.current[key])
    if (query.trim().length < 2) {
      setManualResults(prev => ({ ...prev, [key]: [] }))
      setManualLoadingKeys(prev => ({ ...prev, [key]: false }))
      return
    }

    setManualLoadingKeys(prev => ({ ...prev, [key]: true }))
    manualSearchTimers.current[key] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalog-search?q=${encodeURIComponent(query.trim())}`)
        const data = res.ok ? await res.json() as Product[] : []
        setManualResults(prev => ({ ...prev, [key]: Array.isArray(data) ? data.slice(0, 5) : [] }))
      } finally {
        setManualLoadingKeys(prev => ({ ...prev, [key]: false }))
      }
    }, 280)
  }

  function renderContent(content: string) {
    return content.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      return <span key={i}>{part}</span>
    })
  }

  function renderQuoteMatchCard(item: QuoteMatch, cardKey: string) {
    if (removedPreviewKeys[cardKey]) return null

    const autoProduct = item.matched && item.confidence >= 0.8 ? item.matched : null
    const selectedProduct = leaveToFilmeKeys[cardKey] ? null : selectedPreviewProducts[cardKey] || autoProduct
    const isResolved = Boolean(selectedProduct && !leaveToFilmeKeys[cardKey])
    const editing = Boolean(editingPreviewKeys[cardKey])
    const manualOpen = Boolean(manualOpenKeys[cardKey])
    const choices = [item.matched, ...(item.alternatives || [])].filter(Boolean) as Product[]
    const uniqueChoices = choices
      .filter((p, i, arr) => arr.findIndex(x => x.id === p.id || x.name.trim().toLowerCase() === p.name.trim().toLowerCase()) === i)
      .slice(0, 3)
    const manualChoices = manualResults[cardKey] || []
    const cardIsGreen = isResolved

    return (
      <div key={cardKey} className={`rounded-xl border p-2.5 text-xs shadow-sm ${cardIsGreen ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500">{item.section ? `${item.section} · ` : ''}{item.quantity}× demandé : {item.requestedName}</p>
            {selectedProduct ? (
              <>
                <p className="font-semibold text-gray-900">
                  {displayProductName(selectedProduct)}
                  {hasBundleLabel(selectedProduct) && <span className="ml-1 rounded-full bg-black px-1.5 py-0.5 text-[9px] font-bold text-white">PACK</span>}
                </p>
                {selectedProduct.bundle_items && selectedProduct.bundle_items.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-gray-500">Contenu : {selectedProduct.bundle_items.slice(0, 4).join(', ')}{selectedProduct.bundle_items.length > 4 ? '…' : ''}</p>
                )}
              </>
            ) : leaveToFilmeKeys[cardKey] ? (
              <>
                <p className="font-semibold text-gray-900">L’équipe Filme me fera une proposition</p>
                <p className="mt-0.5 text-[11px] font-semibold text-amber-700">Intervention humaine demandée</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-gray-900">Correspondance catalogue à vérifier</p>
                <p className="mt-0.5 text-[11px] font-semibold text-amber-700">Intervention humaine requise</p>
              </>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <button onClick={() => removePreviewCard(cardKey, selectedProduct)} className="rounded-md border border-gray-200 bg-white px-1.5 text-gray-400 hover:text-gray-900">×</button>
            <button onClick={() => togglePreviewEdit(cardKey)} className="rounded-md border border-gray-200 bg-white px-1.5 text-gray-400 hover:text-gray-900" title="Modifier">✎</button>
          </div>
        </div>

        {editing && (
          <div className="mt-2 space-y-1">
            {selectedProduct && (
              <button className="block w-full rounded-lg border border-black bg-black px-2 py-1.5 text-left text-white">
                {displayProductName(selectedProduct)}
                {hasBundleLabel(selectedProduct) && <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold text-white">PACK</span>}
              </button>
            )}
            {!selectedProduct && uniqueChoices.map(choice => (
              <button key={choice.id} onClick={() => choosePreviewProduct(choice, cardKey)} className="block w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-left text-gray-800">
                {displayProductName(choice)}
                {hasBundleLabel(choice) && <span className="ml-1 rounded-full bg-gray-900 px-1.5 py-0.5 text-[9px] font-bold text-white">PACK</span>}
              </button>
            ))}
            <button onClick={() => toggleManualSearch(cardKey)} className="block w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-left text-gray-700 hover:border-gray-900">
              Faire une recherche manuelle…
            </button>
            {manualOpen && (
              <div className="space-y-1 rounded-lg border border-gray-200 bg-white p-1.5">
                <input
                  autoFocus
                  value={manualQueries[cardKey] || ''}
                  onChange={e => searchPreviewCatalog(cardKey, e.target.value)}
                  placeholder="Rechercher dans le catalogue Filme…"
                  className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-900"
                />
                {manualLoadingKeys[cardKey] && <p className="px-1 text-[11px] text-gray-400">Recherche…</p>}
                {manualChoices.map(choice => (
                  <button key={choice.id} onClick={() => choosePreviewProduct(choice, cardKey)} className="block w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-left text-gray-800 hover:border-gray-900">
                    {displayProductName(choice)}
                    {hasBundleLabel(choice) && <span className="ml-1 rounded-full bg-gray-900 px-1.5 py-0.5 text-[9px] font-bold text-white">PACK</span>}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => leavePreviewToFilme(cardKey, selectedProduct)} className={`block w-full rounded-lg border px-2 py-1.5 text-left ${leaveToFilmeKeys[cardKey] ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
              Laisser Filme me faire une proposition
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100" style={{ height }}>
      <div className="px-4 py-3 flex items-center gap-3 shrink-0" style={{ backgroundColor: color }}>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white shrink-0">
          <SvgIcon icon={s.bubble_icon} className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-semibold truncate">{s.assistant_name || 'FilmeAI'}</p>
          <p className="text-white/70 text-xs">IA · En ligne</p>
        </div>
        <button onClick={reset} title="Réinitialiser" className="text-white/60 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le chat"
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          >
            ×
          </button>
        )}
      </div>

      {/* ── Écran choix devis ── */}
      {showDevisChoice && !showDevisForm && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 bg-white space-y-4">
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-gray-900">Comment souhaitez-vous procéder ?</p>
            <p className="text-xs text-gray-500">Deux façons d&apos;obtenir votre devis sur liste.</p>
          </div>
          {/* Option 1 — IA */}
          <button
            onClick={() => { setShowDevisChoice(false); void send('Faire un devis') }}
            className="w-full text-left border-2 border-gray-900 rounded-xl p-3.5 space-y-1 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-900 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span className="text-xs font-semibold text-gray-900">Estimation immédiate</span>
              <span className="text-[10px] bg-gray-900 text-white rounded-full px-2 py-0.5 font-medium ml-auto shrink-0">Recommandé</span>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed pl-6">L&apos;assistant rapproche votre liste de notre catalogue, vérifie la disponibilité et chiffre un devis tout de suite.</p>
          </button>
          {/* Option 2 — Formulaire */}
          <button
            onClick={() => { setShowDevisForm(true) }}
            className="w-full text-left border border-gray-200 rounded-xl p-3.5 space-y-1 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <span className="text-xs font-semibold text-gray-800">Envoyer ma liste à l&apos;équipe</span>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed pl-6">Sans chiffrage automatique. Votre liste est transmise et traitée à la main ; réponse par e-mail.</p>
          </button>
          <button onClick={() => setShowDevisChoice(false)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Retour</button>
        </div>
      )}

      {/* ── Formulaire inline ── */}
      {showDevisForm && (
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-white">
          {devisFormStatus === 'success' ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-8">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: color }}>
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-sm font-semibold text-gray-900">Demande envoyée !</p>
              <p className="text-xs text-gray-500">Nous vous recontacterons par e-mail dans les plus brefs délais.</p>
              <button onClick={() => { setShowDevisForm(false); setShowDevisChoice(false) }} className="text-xs text-gray-400 hover:text-gray-600 mt-2">Retour au chat</button>
            </div>
          ) : (
            <form
              onSubmit={async e => {
                e.preventDefault()
                setDevisFormStatus('sending')
                setDevisFormError('')
                try {
                  const fd = new FormData()
                  fd.append('key', s.organization_id ?? '')
                  fd.append('name', devisForm.name)
                  fd.append('email', devisForm.email)
                  fd.append('phone', devisForm.phone)
                  fd.append('message', devisForm.message)
                  fd.append('website', '')
                  const res = await fetch('/api/form-submit', { method: 'POST', body: fd })
                  const data = await res.json() as { ok?: boolean; error?: string }
                  if (!res.ok || !data.ok) { setDevisFormError(data.error ?? 'Erreur'); setDevisFormStatus('error') }
                  else setDevisFormStatus('success')
                } catch { setDevisFormError('Erreur réseau.'); setDevisFormStatus('error') }
              }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <button type="button" onClick={() => setShowDevisForm(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <p className="text-xs font-semibold text-gray-900">Envoyer ma liste</p>
              </div>
              {(['name','email','phone'] as const).map(field => (
                <input key={field} required={field !== 'phone'} type={field === 'email' ? 'email' : 'text'}
                  value={devisForm[field]} onChange={e => setDevisForm(p => ({ ...p, [field]: e.target.value }))}
                  placeholder={field === 'name' ? 'Prénom et Nom *' : field === 'email' ? 'E-mail *' : 'Téléphone'}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 placeholder-gray-400"
                />
              ))}
              <textarea required value={devisForm.message} rows={4}
                onChange={e => setDevisForm(p => ({ ...p, message: e.target.value }))}
                placeholder={"Sony FX3 × 1\nObjectif 24-70mm × 1\n\nDates : du 20 au 22 juillet"}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 placeholder-gray-400 resize-none"
              />
              {devisFormStatus === 'error' && <p className="text-[11px] text-red-500">{devisFormError}</p>}
              <button type="submit" disabled={devisFormStatus === 'sending'}
                className="w-full py-2.5 rounded-xl text-xs font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: color }}>
                {devisFormStatus === 'sending' ? 'Envoi…' : 'Envoyer ma demande'}
              </button>
            </form>
          )}
        </div>
      )}

      <div ref={scrollRef} className={`flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50 ${showDevisChoice || showDevisForm ? 'hidden' : ''}`}>
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center text-center pt-4 pb-2 space-y-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: color }}>
              <SvgIcon icon={s.bubble_icon} className="w-6 h-6 text-white" />
            </div>
            <p className="text-xs font-semibold text-gray-900">Comment puis-je vous aider ?</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {chips.map(chip => (
                <button key={chip}
                  onClick={() => chip === 'Faire un devis' ? setShowDevisChoice(true) : void send(chip)}
                  className="text-xs bg-white border border-gray-200 rounded-full px-2.5 py-1 text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%] space-y-2">
              <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'text-white rounded-br-sm'
                  : 'bg-white text-gray-800 border border-gray-100 shadow-sm rounded-bl-sm'
              }`} style={msg.role === 'user' ? { backgroundColor: color } : {}}>
                {renderContent(msg.content)}
              </div>
              {msg.products && msg.products.length > 0 && (
                <div className="space-y-1.5">
                  {msg.products.slice(0, 3).map(p => (
                    <div key={p.id} className="bg-white border border-gray-100 rounded-xl p-2.5 shadow-sm">
                      <p className="text-xs font-medium text-gray-900 leading-tight">{p.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Produit catalogue — prix après dates</p>
                    </div>
                  ))}
                </div>
              )}
              {msg.quoteMatches && msg.quoteMatches.length > 0 && (
                <div className="space-y-2">
                  {msg.quoteMatches.map((item, idx) => renderQuoteMatchCard(item, `final-${msg.id}-${idx}`))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[85%]">
              {streamText ? (
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 text-xs text-gray-800 leading-relaxed shadow-sm whitespace-pre-wrap">
                  {renderContent(streamText)}
                  <span className="inline-block w-1.5 h-3 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />
                </div>
              ) : (
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm flex gap-1 items-center">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              )}
              {pendingProducts.length > 0 && (
                <p className="text-xs text-gray-400 mt-1 pl-1">Recherche en cours…</p>
              )}
              {streamQuoteMatches.length > 0 && (
                <div className="mt-2 space-y-2">
                  {streamQuoteMatches.map((item, idx) => renderQuoteMatchCard(item, `stream-${idx}`))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!showDevisChoice && !showDevisForm && (
        <div className="px-3 py-2.5 border-t border-gray-100 bg-white flex items-center gap-2 shrink-0">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) } }}
            placeholder="Écrivez votre message…"
            disabled={loading}
            className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400 disabled:opacity-50"
          />
          <button
            onClick={() => void send(input)}
            disabled={loading || !input.trim()}
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-opacity disabled:opacity-40"
            style={{ backgroundColor: color }}
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      )}

      {s.show_branding && (
        <div className="px-3 py-1.5 text-center border-t border-gray-50 bg-white shrink-0">
          <span className="text-xs text-gray-400">Propulsé par <span className="font-medium text-gray-600">FilmeAI</span></span>
        </div>
      )}
    </div>
  )
}

function BubbleButton({ s, onClick }: { s: Settings; onClick?: () => void }) {
  const color = safeColor(s.primary_color)
  const isLarge = s.size === 'large'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ouvrir le chat"
      className={`rounded-full shadow-2xl text-white flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${s.attract_attention ? 'animate-pulse' : ''}`}
      style={{ width: isLarge ? 64 : 56, height: isLarge ? 64 : 56, backgroundColor: color }}
    >
      <SvgIcon icon={s.bubble_icon} className={isLarge ? 'w-7 h-7' : 'w-6 h-6'} />
    </button>
  )
}

function VisualWidgetPreview({ s, device, teaserPreviewNonce }: { s: Settings; device: PreviewDevice; teaserPreviewNonce: number }) {
  const [open, setOpen] = useState(false)
  const [forceTeaser, setForceTeaser] = useState(false)
  const isMobile = device === 'mobile'
  const teaser = s.teaser_text || 'Besoin d’un devis ? Je suis là 👋'
  const sideClass = s.position === 'left' ? 'left-5 items-start' : 'right-5 items-end'
  const chatWidth = isMobile ? 'calc(100% - 32px)' : s.size === 'large' ? 380 : 340
  const chatHeight = isMobile ? 430 : s.size === 'large' ? 500 : 455
  const showTeaser = !open && (s.show_teaser || forceTeaser)

  useEffect(() => {
    if (teaserPreviewNonce === 0) return
    setOpen(false)
    setForceTeaser(true)
    const timer = window.setTimeout(() => setForceTeaser(false), 3500)
    return () => window.clearTimeout(timer)
  }, [teaserPreviewNonce])

  return (
    <div className={`relative overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 ${isMobile ? 'mx-auto h-[560px] max-w-[330px]' : 'h-[560px]'}`}>
      <div className="absolute inset-x-0 top-0 border-b border-gray-200 bg-white/90 px-5 py-4">
        <div className="h-3 w-24 rounded-full bg-gray-900" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="h-2 rounded-full bg-gray-200" />
          <div className="h-2 rounded-full bg-gray-200" />
          <div className="h-2 rounded-full bg-gray-200" />
        </div>
      </div>
      <div className="absolute left-6 right-6 top-28 space-y-3">
        <div className="h-20 rounded-2xl bg-white shadow-sm" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 rounded-2xl bg-white shadow-sm" />
          <div className="h-28 rounded-2xl bg-white shadow-sm" />
        </div>
        <div className="h-24 rounded-2xl bg-white shadow-sm" />
      </div>

      <div className={`absolute bottom-5 flex flex-col gap-3 ${sideClass}`}>
        {showTeaser && (
          <div className="max-w-[240px] rounded-2xl bg-white px-4 py-3 text-sm font-medium text-gray-800 shadow-xl border border-gray-100">
            {teaser}
          </div>
        )}
        {open && (
          <div style={{ width: chatWidth }}>
            <ChatWidget s={s} height={chatHeight} onClose={() => setOpen(false)} />
          </div>
        )}
        {!open && <BubbleButton s={s} onClick={() => setOpen(true)} />}
      </div>
    </div>
  )
}

export default function AssistantAppearancePage() {
  const [s, setS] = useState<Settings>(defaults)
  const [initialSettings, setInitialSettings] = useState<Settings>(defaults)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')
  const [teaserPreviewNonce, setTeaserPreviewNonce] = useState(0)
  const [previewWidth, setPreviewWidth] = useState(() => {
    if (typeof window === 'undefined') return 430
    const savedWidth = Number(window.localStorage.getItem('filmeai-appearance-preview-width'))
    return Number.isFinite(savedWidth) ? clampWidth(savedWidth) : 430
  })

  const colorValid = isHexColor(s.primary_color)
  const color = safeColor(s.primary_color)
  const contrast = colorValid ? contrastWithWhite(color) : 0
  const contrastIsWeak = colorValid && contrast < 4.5
  const dirty = JSON.stringify(s) !== JSON.stringify(initialSettings)
  const previewSettings = { ...s, primary_color: color }

  useEffect(() => {
    fetch('/api/assistant-settings', { cache: 'no-store' })
      .then(async r => {
        const d = await r.json() as { settings?: Partial<Settings>; error?: string }
        if (!r.ok || d.error) throw new Error(d.error || 'Impossible de charger les réglages')
        return d
      })
      .then(d => {
        if (d.settings) {
          const next = { ...defaults, ...d.settings }
          setS(next)
          setInitialSettings(next)
        }
      })
      .catch(err => setSaveError(err instanceof Error ? err.message : 'Impossible de charger les réglages'))
  }, [])

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setSaveError(null)
    setS(prev => ({ ...prev, [key]: val }))
  }

  function resetChanges() {
    setS(initialSettings)
  }

  function startPreviewResize(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = previewWidth

    function onMove(ev: MouseEvent) {
      const next = clampWidth(startWidth - (ev.clientX - startX))
      setPreviewWidth(next)
      window.localStorage.setItem('filmeai-appearance-preview-width', String(Math.round(next)))
    }

    function onUp() {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  async function save() {
    if (!colorValid) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/assistant-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(s),
      })
      const data = await res.json().catch(() => null) as { settings?: Partial<Settings>; error?: string } | null
      if (!res.ok || data?.error) throw new Error(data?.error || `Erreur sauvegarde HTTP ${res.status}`)
      if (!data?.settings) throw new Error('Sauvegarde non confirmée par le serveur')

      const savedSettings = { ...defaults, ...data.settings }
      setInitialSettings(savedSettings)
      setS(savedSettings)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-180px)] gap-0 items-start">

      {/* ── Left: settings ── */}
      <div className="flex-1 min-w-[520px] space-y-5 pr-5 pb-24">

        {saveError && !dirty && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        {dirty && (
          <div className="sticky top-0 z-20 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 shadow-sm backdrop-blur">
            <div>
              <p className="text-sm font-semibold text-amber-900">Modifications non sauvegardées</p>
              <p className="text-xs text-amber-700">Pensez à sauvegarder avant de quitter cette page.</p>
              {saveError && <p className="mt-1 text-xs text-red-600">Erreur : {saveError}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={resetChanges} className="rounded-lg px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100">Annuler</button>
              <button onClick={save} disabled={saving || !colorValid}
                className="rounded-lg bg-black px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40">
                {saving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        )}

        {/* Couleur primaire */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Couleur primaire</h2>
            <p className="text-xs text-gray-500 mt-0.5">Couleur principale du widget et du bouton de chat.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer">
              <input type="color" value={color} onChange={e => set('primary_color', e.target.value)} className="sr-only" />
              <div className="w-10 h-10 rounded-lg border border-gray-200 shadow-sm" style={{ backgroundColor: color }} />
            </label>
            <input value={s.primary_color} onChange={e => set('primary_color', e.target.value)} maxLength={7}
              className={`w-28 border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black ${colorValid ? 'border-gray-200' : 'border-red-300 bg-red-50 text-red-700'}`} />
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map(preset => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => set('primary_color', preset.value)}
                  className={`h-8 rounded-full border px-2.5 text-xs font-medium transition-colors ${s.primary_color.toLowerCase() === preset.value ? 'border-black bg-gray-50 text-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                >
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: preset.value }} />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          {!colorValid && <p className="text-xs text-red-600">La couleur doit être au format hexadécimal, par exemple #000000.</p>}
          {contrastIsWeak && <p className="text-xs text-amber-700">Contraste faible avec le texte blanc. Le widget restera lisible, mais une couleur plus foncée serait plus confortable.</p>}
        </div>

        {/* Icône bulle */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Icône de la bulle</h2>
            <p className="text-xs text-gray-500 mt-0.5">Affichée sur la bulle flottante et dans l&apos;en-tête du chat.</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {ICONS.map(icon => (
              <button key={icon.value} type="button" onClick={() => set('bubble_icon', icon.value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs transition-all ${
                  s.bubble_icon === icon.value ? 'border-black bg-black text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}>
                <SvgIcon icon={icon.value} />
                {icon.label}
              </button>
            ))}
          </div>
        </div>

        {/* Position + Taille */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Position de la bulle</h2>
            <div className="flex gap-2">
              {[['right', 'En bas à droite'], ['left', 'En bas à gauche']].map(([val, label]) => (
                <button key={val} type="button" onClick={() => set('position', val)}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-all ${s.position === val ? 'border-black bg-black text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Taille par défaut</h2>
            <div className="flex gap-2">
              {[['standard', 'Standard'], ['large', 'Grande']].map(([val, label]) => (
                <button key={val} type="button" onClick={() => set('size', val)}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-all ${s.size === val ? 'border-black bg-black text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Nom */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Nom de l&apos;assistant</h2>
            <p className="text-xs text-gray-500 mt-0.5">Affiché en haut du widget et dans les messages.</p>
          </div>
          <input value={s.assistant_name} onChange={e => set('assistant_name', e.target.value)} maxLength={40}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
        </div>

        {/* Bulle d'accroche */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Bulle d&apos;accroche</h2>
              <p className="text-xs text-gray-500 mt-0.5">Un message qui apparaît au-dessus du bouton pour attirer l&apos;attention.</p>
            </div>
            <Toggle value={s.show_teaser} onChange={v => set('show_teaser', v)} label="Afficher la bulle d’accroche" />
          </div>
          {s.show_teaser && (
            <div className="space-y-4 pt-1 border-t border-gray-100">
              <div className="pt-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">Texte</label>
                  <span className="text-xs text-gray-400">{s.teaser_text.length}/60</span>
                </div>
                <input value={s.teaser_text} onChange={e => set('teaser_text', e.target.value.slice(0, 60))}
                  placeholder="Besoin d'un devis ? Je suis là 👋"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TEASER_SUGGESTIONS.map(text => (
                    <button key={text} type="button" onClick={() => set('teaser_text', text)} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:border-gray-300 hover:text-gray-900">
                      {text}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Délai d&apos;apparition</label>
                <select value={s.teaser_delay} onChange={e => set('teaser_delay', Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white">
                  {[2, 4, 8, 15].map(d => <option key={d} value={d}>{d} secondes</option>)}
                </select>
                <button type="button" onClick={() => setTeaserPreviewNonce(n => n + 1)} className="ml-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:border-gray-300 hover:text-gray-900">
                  Tester l’apparition
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Attirer l&apos;attention</p>
                  <p className="text-xs text-gray-500">Animation légère sur le bouton.</p>
                </div>
                <Toggle value={s.attract_attention} onChange={v => set('attract_attention', v)} label="Activer l’animation d’attention" />
              </div>
            </div>
          )}
        </div>

        {/* Marque */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Marque FilmeAI</h2>
              <p className="text-xs text-gray-500 mt-0.5">Afficher « Propulsé par FilmeAI » dans le widget.</p>
            </div>
            <Toggle value={s.show_branding} onChange={v => set('show_branding', v)} label="Afficher la marque FilmeAI" />
          </div>
        </div>

      </div>

      {/* Resize handle */}
      <div
        onMouseDown={startPreviewResize}
        className="sticky top-16 h-[calc(100vh-120px)] w-4 shrink-0 cursor-col-resize flex items-center justify-center group select-none"
        title="Redimensionner l’aperçu"
      >
        <div className="h-20 w-1 rounded-full bg-gray-200 transition-colors group-hover:bg-gray-400" />
      </div>

      {/* ── Right: preview ── */}
      <div className="shrink-0 sticky top-0" style={{ width: previewWidth }}>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="space-y-3 border-b border-gray-100 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-900">Aperçu interactif</span>
              <span className="text-xs border px-2 py-0.5 rounded-full bg-green-50 text-green-700 border-green-200">IA active</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <SegmentedButton<PreviewDevice>
                value={previewDevice}
                onChange={v => setPreviewDevice(v)}
                options={[{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }]}
              />
            </div>
            <p className="text-xs text-gray-400">Cliquez sur la bulle pour ouvrir le chat, puis testez l’IA directement dans l’aperçu.</p>
          </div>
          <div className="p-3">
            <VisualWidgetPreview s={previewSettings} device={previewDevice} teaserPreviewNonce={teaserPreviewNonce} />
          </div>
        </div>
      </div>

    </div>
  )
}
