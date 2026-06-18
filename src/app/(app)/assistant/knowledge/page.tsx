'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

/* ── Types ── */
type FaqItem = { id: string; question: string; answer: string; synced: boolean; updated_at: string }
type KnowledgeUrl = { id: string; url: string; title: string | null; status: string; created_at: string }
type CatalogSignal = {
  id: string
  term: string
  product_name: string
  product_id: string | null
  source: string
  occurrences: number
  approved?: boolean
  updated_at: string
}
type Tab = 'faq' | 'files' | 'webpages' | 'signals'

/* ── Icons ── */
function IconRefresh({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}
function IconPencil({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  )
}
function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}
function IconUpload({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  )
}
function IconFile({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}
function IconLink({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  )
}
function IconSparkle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  )
}

/* ── StatusBadge ── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    done:     { label: 'Synchronisé',  cls: 'bg-green-50 text-green-700 border-green-200' },
    pending:  { label: 'En attente',   cls: 'bg-gray-50 text-gray-500 border-gray-200' },
    crawling: { label: 'En cours…',    cls: 'bg-blue-50 text-blue-600 border-blue-200' },
    error:    { label: 'Erreur',       cls: 'bg-red-50 text-red-600 border-red-200' },
  }
  const s = map[status] ?? map.pending
  return <span className={`shrink-0 text-xs border rounded-full px-2 py-0.5 ${s.cls}`}>{s.label}</span>
}

/* ════════════════════════════════════════════════════════ */
export default function AssistantKnowledgePage() {
  const [activeTab, setActiveTab] = useState<Tab>('faq')

  /* ── FAQ state ── */
  const [faq, setFaq] = useState<FaqItem[]>([])
  const [faqLoading, setFaqLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editQ, setEditQ] = useState('')
  const [editA, setEditA] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newQ, setNewQ] = useState('')
  const [newA, setNewA] = useState('')
  const [faqSaving, setFaqSaving] = useState(false)

  /* ── Generate from site state ── */
  type GeneratedPair = { question: string; answer: string; selected: boolean }
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateUrl, setGenerateUrl] = useState('https://www.filme.fr')
  const [generateLoading, setGenerateLoading] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [generated, setGenerated] = useState<GeneratedPair[]>([])
  const [importingGenerated, setImportingGenerated] = useState(false)

  /* ── URLs state ── */
  const [urls, setUrls] = useState<KnowledgeUrl[]>([])
  const [urlsLoading, setUrlsLoading] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [urlSaving, setUrlSaving] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState(false)

  /* ── Files state ── */
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /* ── Signals state ── */
  const [signals, setSignals] = useState<CatalogSignal[]>([])
  const [signalsLoading, setSignalsLoading] = useState(true)
  const [signalTerm, setSignalTerm] = useState('')
  const [signalProduct, setSignalProduct] = useState('')
  const [signalSaving, setSignalSaving] = useState(false)
  const [signalError, setSignalError] = useState('')
  const [signalSaved, setSignalSaved] = useState(false)
  const [editingSignalId, setEditingSignalId] = useState<string | null>(null)
  const [editSignalTerm, setEditSignalTerm] = useState('')
  const [editSignalProduct, setEditSignalProduct] = useState('')
  const [signalEditSaving, setSignalEditSaving] = useState(false)

  /* ── Load FAQ ── */
  const loadFaq = useCallback(async () => {
    setFaqLoading(true)
    try {
      const res = await fetch('/api/faq')
      const data = await res.json() as { items?: FaqItem[] }
      setFaq(data.items ?? [])
    } finally {
      setFaqLoading(false)
    }
  }, [])

  /* ── Load URLs ── */
  const loadUrls = useCallback(async () => {
    setUrlsLoading(true)
    try {
      const res = await fetch('/api/knowledge-urls')
      const data = await res.json() as { urls?: KnowledgeUrl[] }
      setUrls(data.urls ?? [])
    } finally {
      setUrlsLoading(false)
    }
  }, [])

  /* ── Load Signals ── */
  const loadSignals = useCallback(async () => {
    setSignalsLoading(true)
    setSignalError('')
    try {
      const res = await fetch('/api/catalog-signals')
      const data = await res.json() as { signals?: CatalogSignal[]; error?: string }
      if (!res.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`)
      setSignals(data.signals ?? [])
    } catch (err) {
      setSignalError(err instanceof Error ? err.message : 'Impossible de charger les signaux.')
    } finally {
      setSignalsLoading(false)
    }
  }, [])

  useEffect(() => { void loadFaq() }, [loadFaq])
  useEffect(() => { void loadUrls() }, [loadUrls])
  useEffect(() => { void loadSignals() }, [loadSignals])

  /* ── FAQ CRUD ── */
  async function addFaq() {
    if (!newQ.trim()) return
    setFaqSaving(true)
    try {
      const res = await fetch('/api/faq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: newQ, answer: newA }),
      })
      const data = await res.json() as { item?: FaqItem }
      if (data.item) { setFaq(p => [...p, data.item!]); setNewQ(''); setNewA(''); setShowAdd(false) }
    } finally { setFaqSaving(false) }
  }

  async function runGenerate() {
    if (!generateUrl.trim()) return
    setGenerateLoading(true)
    setGenerateError('')
    setGenerated([])
    try {
      const res = await fetch('/api/generate-faq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: generateUrl }),
      })
      const data = await res.json() as { faqs?: { question: string; answer: string }[]; error?: string }
      if (!res.ok || data.error) { setGenerateError(data.error ?? 'Erreur'); return }
      setGenerated((data.faqs ?? []).map(f => ({ ...f, selected: true })))
    } catch { setGenerateError('Erreur réseau.') }
    finally { setGenerateLoading(false) }
  }

  async function importGenerated() {
    const toImport = generated.filter(g => g.selected)
    if (!toImport.length) return
    setImportingGenerated(true)
    try {
      const results = await Promise.all(
        toImport.map(g =>
          fetch('/api/faq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: g.question, answer: g.answer }),
          }).then(r => r.json() as Promise<{ item?: FaqItem }>)
        )
      )
      const newItems = results.flatMap(r => r.item ? [r.item] : [])
      setFaq(p => [...p, ...newItems])
      setShowGenerate(false)
      setGenerated([])
    } finally { setImportingGenerated(false) }
  }

  function startEdit(item: FaqItem) {
    setEditing(item.id)
    setEditQ(item.question)
    setEditA(item.answer)
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/faq/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: editQ, answer: editA }),
    })
    const data = await res.json() as { item?: FaqItem }
    if (data.item) setFaq(p => p.map(f => f.id === id ? data.item! : f))
    setEditing(null)
  }

  async function deleteFaq(id: string) {
    if (!confirm('Supprimer cette entrée ?')) return
    await fetch(`/api/faq/${id}`, { method: 'DELETE' })
    setFaq(p => p.filter(f => f.id !== id))
  }

  /* ── URLs CRUD ── */
  async function addUrl() {
    if (!urlInput.trim()) return
    setUrlSaving(true)
    try {
      const res = await fetch('/api/knowledge-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput }),
      })
      const data = await res.json() as { url?: KnowledgeUrl }
      if (data.url) { setUrls(p => [data.url!, ...p]); setUrlInput(''); setShowUrlInput(false) }
    } finally { setUrlSaving(false) }
  }

  async function deleteUrl(id: string) {
    await fetch(`/api/knowledge-urls/${id}`, { method: 'DELETE' })
    setUrls(p => p.filter(u => u.id !== id))
  }

  /* ── Signals CRUD ── */
  async function addSignal() {
    if (!signalTerm.trim() || !signalProduct.trim()) return
    setSignalSaving(true)
    setSignalError('')
    setSignalSaved(false)
    try {
      const res = await fetch('/api/catalog-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: signalTerm,
          productName: signalProduct,
          source: 'knowledge_manual',
        }),
      })
      const text = await res.text()
      let data: { signal?: CatalogSignal; error?: string } = {}
      try {
        data = JSON.parse(text) as { signal?: CatalogSignal; error?: string }
      } catch {
        throw new Error(`Réponse non JSON de /api/catalog-signals (${res.status}) : ${text.slice(0, 180)}`)
      }

      if (!res.ok || data.error) throw new Error(data.error || `Erreur HTTP ${res.status}`)
      if (!data.signal) throw new Error('Aucun signal retourné par l’API.')

      setSignals(prev => [data.signal!, ...prev.filter(signal => signal.id !== data.signal!.id)])
      setSignalTerm('')
      setSignalProduct('')
      setSignalSaved(true)
      setTimeout(() => setSignalSaved(false), 1800)
    } catch (err) {
      setSignalError(err instanceof Error ? err.message : 'Impossible d’ajouter cet alias.')
    } finally {
      setSignalSaving(false)
    }
  }

  function startEditSignal(signal: CatalogSignal) {
    setEditingSignalId(signal.id)
    setEditSignalTerm(signal.term)
    setEditSignalProduct(signal.product_name)
    setSignalError('')
  }

  function cancelEditSignal() {
    setEditingSignalId(null)
    setEditSignalTerm('')
    setEditSignalProduct('')
  }

  async function saveSignalEdit(id: string) {
    if (!editSignalTerm.trim() || !editSignalProduct.trim()) return
    setSignalEditSaving(true)
    setSignalError('')
    try {
      const res = await fetch(`/api/catalog-signals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: editSignalTerm,
          productName: editSignalProduct,
          approved: true,
        }),
      })
      const data = await res.json() as { signal?: CatalogSignal; error?: string }
      if (!res.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`)
      if (data.signal) setSignals(prev => prev.map(signal => signal.id === id ? data.signal! : signal))
      cancelEditSignal()
    } catch (err) {
      setSignalError(err instanceof Error ? err.message : 'Modification impossible.')
    } finally {
      setSignalEditSaving(false)
    }
  }

  async function deleteSignal(id: string) {
    if (!confirm('Supprimer cette association apprise ?')) return
    setSignalError('')
    try {
      const res = await fetch(`/api/catalog-signals/${id}`, { method: 'DELETE' })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`)
      setSignals(prev => prev.filter(signal => signal.id !== id))
    } catch (err) {
      setSignalError(err instanceof Error ? err.message : 'Suppression impossible.')
    }
  }

  async function approveSignal(id: string) {
    setSignalError('')
    try {
      const res = await fetch(`/api/catalog-signals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      })
      const data = await res.json() as { signal?: CatalogSignal; error?: string }
      if (!res.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`)
      if (data.signal) setSignals(prev => prev.map(signal => signal.id === id ? data.signal! : signal))
    } catch (err) {
      setSignalError(err instanceof Error ? err.message : 'Validation impossible.')
    }
  }

  /* ── Tabs ── */
  const tabs: { key: Tab; label: string }[] = [
    { key: 'faq',      label: 'FAQ' },
    { key: 'files',    label: 'Fichiers' },
    { key: 'webpages', label: 'Pages web' },
    { key: 'signals',  label: 'Signaux' },
  ]

  return (
    <div className="space-y-5">

      {/* ══ Modal IA Générer depuis mon site ══ */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <IconSparkle className="w-4 h-4 text-gray-600" />
                <p className="text-sm font-semibold text-gray-900">Générer depuis mon site</p>
              </div>
              <button onClick={() => setShowGenerate(false)} className="text-gray-400 hover:text-gray-700">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* URL input */}
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Entrez l&apos;URL d&apos;une page de votre site (FAQ, CGV, À propos…)</p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={generateUrl}
                  onChange={e => setGenerateUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void runGenerate() }}
                  placeholder="https://www.filme.fr"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <button
                  onClick={() => void runGenerate()}
                  disabled={generateLoading || !generateUrl.trim()}
                  className="flex items-center gap-1.5 bg-gray-900 text-white text-xs rounded-lg px-4 py-2 hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {generateLoading ? (
                    <><svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9" /></svg>Génération…</>
                  ) : (
                    <><IconSparkle className="w-3.5 h-3.5" />Générer</>
                  )}
                </button>
              </div>
              {generateError && <p className="text-xs text-red-500 mt-2">{generateError}</p>}
            </div>

            {/* Results */}
            {generated.length > 0 && (
              <>
                <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                  {generated.map((g, i) => (
                    <label key={i} className="flex items-start gap-3 px-6 py-3 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={g.selected}
                        onChange={e => setGenerated(p => p.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))}
                        className="mt-1 rounded border-gray-300 accent-gray-900"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{g.question}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{g.answer}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500">{generated.filter(g => g.selected).length} sélectionnées sur {generated.length}</p>
                  <div className="flex gap-2">
                    <button onClick={() => setGenerated(p => p.map(g => ({ ...g, selected: true })))} className="text-xs text-gray-500 hover:text-gray-900">Tout sélectionner</button>
                    <button
                      onClick={() => void importGenerated()}
                      disabled={importingGenerated || generated.filter(g => g.selected).length === 0}
                      className="bg-gray-900 text-white text-xs rounded-lg px-4 py-1.5 hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {importingGenerated ? 'Import…' : 'Importer la sélection'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {!generateLoading && generated.length === 0 && !generateError && (
              <div className="px-6 py-10 text-center text-xs text-gray-400">
                Entrez une URL et cliquez sur Générer pour obtenir des suggestions de FAQ.
              </div>
            )}
          </div>
        </div>
      )}


      {/* ── Header ── */}
      <div>
        <h1 className="text-base font-semibold text-gray-900">Base de connaissances</h1>
        <p className="text-xs text-gray-500 mt-0.5">Tout ce que le bot doit savoir, de la source la plus fiable à la moins fiable.</p>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors -mb-px ${
              activeTab === t.key
                ? 'border-b-2 border-gray-900 text-gray-900'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════ FAQ tab ══════════════════════ */}
      {activeTab === 'faq' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <p className="text-sm font-semibold text-gray-900">FAQ manuelle</p>
              <p className="text-xs text-gray-500 mt-0.5">Vos réponses prioritaires. Le bot s&apos;en sert en premier.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowGenerate(true); setGenerated([]); setGenerateError('') }}
                className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
              >
                <IconSparkle className="w-3.5 h-3.5" />
                Générer depuis mon site
              </button>
              <button
                onClick={() => { setShowAdd(true); setEditing(null) }}
                className="flex items-center gap-1 text-xs bg-gray-900 text-white rounded-lg px-3 py-1.5 hover:bg-gray-700 transition-colors"
              >
                + Ajouter
              </button>
            </div>
          </div>

          {/* Add form */}
          {showAdd && (
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 space-y-3">
              <input
                autoFocus
                value={newQ}
                onChange={e => setNewQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void addFaq() }}
                placeholder="Question *"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              />
              <textarea
                value={newA}
                onChange={e => setNewA(e.target.value)}
                placeholder="Réponse"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void addFaq()}
                  disabled={faqSaving || !newQ.trim()}
                  className="bg-gray-900 text-white text-xs rounded-lg px-3 py-1.5 hover:bg-gray-700 disabled:opacity-50"
                >
                  {faqSaving ? 'Ajout…' : 'Ajouter'}
                </button>
                <button
                  onClick={() => { setShowAdd(false); setNewQ(''); setNewA('') }}
                  className="text-xs text-gray-500 hover:text-gray-900"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* FAQ list */}
          <div className="divide-y divide-gray-50">
            {faqLoading ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400">Chargement…</div>
            ) : faq.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-gray-500">Aucune question. Cliquez sur <strong>+ Ajouter</strong> pour commencer.</p>
              </div>
            ) : faq.map(item => (
              <div key={item.id} className="px-6 py-4">
                {editing === item.id ? (
                  <div className="space-y-2">
                    <input
                      value={editQ}
                      onChange={e => setEditQ(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <textarea
                      value={editA}
                      onChange={e => setEditA(e.target.value)}
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                    />
                    <div className="flex gap-3">
                      <button onClick={() => void saveEdit(item.id)} className="text-xs bg-gray-900 text-white rounded-lg px-3 py-1.5 hover:bg-gray-700">Sauvegarder</button>
                      <button onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:text-gray-900">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{item.question}</p>
                        <StatusBadge status={item.synced ? 'done' : 'pending'} />
                      </div>
                      {item.answer && <p className="text-xs text-gray-500 line-clamp-2">{item.answer}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => void loadFaq()}
                        title="Resynchroniser"
                        className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <IconRefresh className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => startEdit(item)}
                        title="Modifier"
                        className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <IconPencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void deleteFaq(item.id)}
                        title="Supprimer"
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <IconTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════ Fichiers tab ══════════════════════ */}
      {activeTab === 'files' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Fichiers</p>
            <p className="text-xs text-gray-500 mt-0.5">Importez vos documents (PDF, DOCX, TXT, MD). Ré-importer un même nom de fichier crée une nouvelle version.</p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false) }}
            onClick={() => fileRef.current?.click()}
            className={`mx-6 mt-4 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-10 cursor-pointer transition-colors ${
              dragging ? 'border-gray-400 bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.txt,.md" />
            <IconUpload className="w-8 h-8 text-gray-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Glissez vos fichiers ici ou cliquez pour parcourir</p>
              <p className="text-xs text-gray-400 mt-0.5">PDF, DOCX, TXT, MD · 15 Mo max</p>
            </div>
          </div>

          {/* Empty state */}
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <IconFile className="w-8 h-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">Aucun fichier importé</p>
            <p className="text-xs text-gray-400">Vos documents apparaîtront ici avec leur statut d&apos;ingestion.</p>
          </div>
        </div>
      )}

      {/* ══════════════════════ Pages web tab ══════════════════════ */}
      {activeTab === 'webpages' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <p className="text-sm font-semibold text-gray-900">Pages web (crawl ciblé)</p>
              <p className="text-xs text-gray-500 mt-0.5">Le bot explore ces pages pour enrichir ses réponses (CGV, FAQ en ligne…).</p>
            </div>
            <button
              onClick={() => setShowUrlInput(true)}
              className="flex items-center gap-1 text-xs bg-gray-900 text-white rounded-lg px-3 py-1.5 hover:bg-gray-700 transition-colors"
            >
              + Ajouter
            </button>
          </div>

          {/* Add URL form */}
          {showUrlInput && (
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 space-y-3">
              <input
                autoFocus
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void addUrl() }}
                placeholder="https://votre-site.fr/cgv"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void addUrl()}
                  disabled={urlSaving || !urlInput.trim()}
                  className="bg-gray-900 text-white text-xs rounded-lg px-3 py-1.5 hover:bg-gray-700 disabled:opacity-50"
                >
                  {urlSaving ? 'Ajout…' : 'Ajouter'}
                </button>
                <button
                  onClick={() => { setShowUrlInput(false); setUrlInput('') }}
                  className="text-xs text-gray-500 hover:text-gray-900"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* URL list or empty state */}
          {urlsLoading ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">Chargement…</div>
          ) : urls.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14">
              <IconLink className="w-8 h-8 text-gray-300" />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Aucune page configurée</p>
                <p className="text-xs text-gray-400 mt-0.5">Ajoutez l&apos;URL d&apos;une page (CGV, FAQ…) pour que le bot l&apos;explore.</p>
              </div>
              <button
                onClick={() => setShowUrlInput(true)}
                className="flex items-center gap-1 text-xs bg-gray-900 text-white rounded-lg px-3 py-2 hover:bg-gray-700 transition-colors mt-1"
              >
                + Ajouter une URL
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {urls.map(u => (
                <div key={u.id} className="flex items-center justify-between px-6 py-3 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <IconLink className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      {u.title && <p className="text-sm font-medium text-gray-900 truncate">{u.title}</p>}
                      <p className="text-xs text-gray-400 truncate">{u.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={u.status} />
                    <button
                      onClick={() => void deleteUrl(u.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <IconTrash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ Signaux tab ══════════════════════ */}
      {activeTab === 'signals' && (
        <div className="space-y-4">

          {/* Termes non résolus */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Termes non résolus</p>
              <p className="text-xs text-gray-500 mt-0.5">Ce que vos visiteurs demandent et que le bot n&apos;a pas su relier à votre catalogue (30 derniers jours).</p>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">Aucun terme non résolu pour l&apos;instant.</p>
              <p className="text-xs text-gray-400">Les termes apparaissent dès que le bot reçoit des demandes.</p>
            </div>
          </div>

          {/* Alias appris */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Alias / associations catalogue</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Ces signaux alimentent le glossaire d’extraction : “terme client” → “produit catalogue”. Les corrections manuelles dans les devis l’enrichissent automatiquement.
                </p>
              </div>
              <button
                onClick={() => void loadSignals()}
                className="flex items-center gap-1 text-xs border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
              >
                <IconRefresh className="w-3.5 h-3.5" /> Rafraîchir
              </button>
            </div>

            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="grid md:grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  value={signalTerm}
                  onChange={e => setSignalTerm(e.target.value)}
                  placeholder="Terme client : ex. indie 5"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                />
                <input
                  value={signalProduct}
                  onChange={e => setSignalProduct(e.target.value)}
                  placeholder="Produit catalogue : ex. Atomos Shogun Indie 5"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                />
                <button
                  onClick={() => void addSignal()}
                  disabled={signalSaving || !signalTerm.trim() || !signalProduct.trim()}
                  className="text-xs bg-gray-900 text-white rounded-lg px-3 py-2 hover:bg-gray-700 transition-colors disabled:opacity-40"
                >
                  {signalSaving ? 'Ajout…' : '+ Ajouter'}
                </button>
              </div>
              {signalError && (
                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  Erreur : {signalError}
                  {signalError.includes('catalog_signals') && (
                    <span className="block mt-1">
                      Vérifiez que la migration <code>016_catalog_signals.sql</code> a bien été lancée dans Supabase.
                    </span>
                  )}
                </p>
              )}
              {signalSaved && (
                <p className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  Alias ajouté au glossaire ✓
                </p>
              )}
            </div>

            {signalsLoading ? (
              <div className="px-6 py-10 text-sm text-gray-400">Chargement des signaux…</div>
            ) : signals.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <IconSparkle className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-sm text-gray-500">Aucun alias appris pour l&apos;instant.</p>
                <p className="text-xs text-gray-400">Ils apparaîtront dès qu’un produit sera corrigé manuellement.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {signals.map(signal => (
                  <div key={signal.id} className="px-6 py-3 flex items-center justify-between gap-4">
                    {editingSignalId === signal.id ? (
                      <div className="flex-1 grid md:grid-cols-[1fr_1fr_auto] gap-2">
                        <input
                          value={editSignalTerm}
                          onChange={e => setEditSignalTerm(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                          placeholder="Terme client"
                        />
                        <input
                          value={editSignalProduct}
                          onChange={e => setEditSignalProduct(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                          placeholder="Produit catalogue"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => void saveSignalEdit(signal.id)}
                            disabled={signalEditSaving || !editSignalTerm.trim() || !editSignalProduct.trim()}
                            className="text-xs bg-gray-900 text-white rounded-lg px-3 py-2 hover:bg-gray-700 disabled:opacity-40"
                          >
                            {signalEditSaving ? 'Sauvegarde…' : 'Sauver'}
                          </button>
                          <button
                            onClick={cancelEditSignal}
                            className="text-xs border border-gray-200 rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-50"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900">
                            <span className="font-semibold">“{signal.term}”</span>
                            <span className="text-gray-400 mx-2">→</span>
                            <span>{signal.product_name}</span>
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {signal.source || 'manual'} · {signal.occurrences || 1} occurrence{(signal.occurrences || 1) > 1 ? 's' : ''}
                            {signal.approved === false && <span className="ml-2 text-amber-600 font-medium">à valider</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {signal.approved === false && (
                            <button
                              onClick={() => void approveSignal(signal.id)}
                              className="text-xs border border-amber-200 bg-amber-50 text-amber-700 rounded-lg px-2 py-1 hover:bg-amber-100"
                            >
                              Valider
                            </button>
                          )}
                        <button
                          onClick={() => startEditSignal(signal)}
                          className="p-1.5 text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition-colors"
                          title="Modifier l'association"
                        >
                          <IconPencil className="w-4 h-4" />
                        </button>
                          <button
                            onClick={() => void deleteSignal(signal.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                            title="Supprimer l'association"
                          >
                            <IconTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>


        </div>
      )}

    </div>
  )
}
