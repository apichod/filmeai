'use client'

import { useEffect, useRef, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; name: string }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'done'; caseId: string | null }
  | { type: 'error'; message: string }

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: { name: string; result?: string }[]
}

type ReturnCase = {
  id: string
  case_number: number
  origin_order: string
  sav_order_id: string | null
  problem_type: string
  problem_description: string
  status: 'open' | 'in_progress' | 'resolved'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function statusLabel(s: string) {
  if (s === 'open')        return 'Ouvert'
  if (s === 'in_progress') return 'En cours'
  if (s === 'resolved')    return 'Résolu'
  return s
}

function statusClass(s: string) {
  if (s === 'open')        return 'bg-red-50 text-red-700'
  if (s === 'in_progress') return 'bg-amber-50 text-amber-700'
  if (s === 'resolved')    return 'bg-green-50 text-green-700'
  return 'bg-gray-100 text-gray-600'
}

function typeLabel(t: string) {
  if (t === 'manquant') return 'Manquant'
  if (t === 'casse')    return 'Cassé'
  return t
}

function toolLabel(name: string) {
  const labels: Record<string, string> = {
    fetch_order:       'Récupération de l\'order',
    add_internal_note: 'Note interne ajoutée',
    create_sav_order:  'Création de la SAV order',
    add_tag:           'Tag ajouté',
    add_sav_comment:   'Commentaire SAV',
    log_case:          'Cas enregistré',
  }
  return labels[name] || name
}

// ── Composant Chat ─────────────────────────────────────────────────────────────

function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Bonjour ! Je suis l\'assistant retours. Donnez-moi le numéro d\'order et décrivez le problème.',
    },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [caseId, setCaseId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])

    const assistantId = `a-${Date.now()}`
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', toolCalls: [] }])
    setSending(true)

    try {
      const apiMessages = [...messages, userMsg]
        .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/returns/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, caseId }),
      })

      if (!res.body) throw new Error('No body')

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += dec.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6)
          if (!json) continue

          try {
            const event = JSON.parse(json) as StreamEvent

            if (event.type === 'text') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: m.content + event.content }
                  : m
              ))
            }

            if (event.type === 'tool_call') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, toolCalls: [...(m.toolCalls || []), { name: event.name }] }
                  : m
              ))
            }

            if (event.type === 'tool_result') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: (m.toolCalls || []).map((tc, i) =>
                        i === (m.toolCalls?.length ?? 1) - 1 && tc.name === event.name
                          ? { ...tc, result: event.result }
                          : tc
                      ),
                    }
                  : m
              ))
            }

            if (event.type === 'done' && event.caseId) {
              setCaseId(event.caseId)
            }

            if (event.type === 'error') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: m.content || `Erreur : ${event.message}` }
                  : m
              ))
            }
          } catch { /* ligne invalide */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: `Erreur : ${msg}` } : m
      ))
    } finally {
      setSending(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function reset() {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: 'Bonjour ! Je suis l\'assistant retours. Donnez-moi le numéro d\'order et décrivez le problème.',
    }])
    setCaseId(null)
    setInput('')
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Assistant retours</h2>
          {caseId && (
            <p className="text-xs text-green-600 mt-0.5">Cas actif en cours de traitement</p>
          )}
        </div>
        <button
          onClick={reset}
          className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          Nouveau cas
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] space-y-1.5`}>
              {/* Tool calls */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="space-y-1">
                  {msg.toolCalls.map((tc, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
                      <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                      </svg>
                      <span>{toolLabel(tc.name)}</span>
                      {tc.result && tc.result.startsWith('✓') && (
                        <span className="text-green-500">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Message text */}
              {(msg.content || msg.role === 'assistant') && (
                <div className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-black text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {msg.content || (
                    <span className="inline-flex gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-end gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Numéro d'order et description du problème…"
            rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none text-gray-800 placeholder-gray-400 max-h-32"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="shrink-0 w-7 h-7 bg-black text-white rounded-lg flex items-center justify-center disabled:opacity-30 transition-opacity"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5 px-1">Entrée pour envoyer · Shift+Entrée pour nouvelle ligne</p>
      </div>
    </div>
  )
}

// ── Composant Table des cas ────────────────────────────────────────────────────

function CasesTable() {
  const [cases, setCases] = useState<ReturnCase[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all')

  useEffect(() => {
    setLoading(true)
    const url = filter === 'all' ? '/api/returns/cases' : `/api/returns/cases?status=${filter}`
    fetch(url)
      .then(r => r.json())
      .then(d => { setCases(d.cases || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filter])

  async function updateStatus(id: string, status: string) {
    await fetch('/api/returns/cases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setCases(prev => prev.map(c => c.id === id ? { ...c, status: status as ReturnCase['status'] } : c))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header + filtres */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Historique des cas</h2>
        <div className="flex gap-1">
          {(['all', 'open', 'in_progress', 'resolved'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {f === 'all' ? 'Tous' : f === 'open' ? 'Ouverts' : f === 'in_progress' ? 'En cours' : 'Résolus'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-gray-400">Chargement…</div>
      ) : cases.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">Aucun cas trouvé</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">#</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">Order</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">Type</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">Problème</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">Statut</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">Date</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cases.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3 text-gray-400 font-mono text-xs">{c.case_number}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{c.origin_order}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      {typeLabel(c.problem_type)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600 max-w-xs truncate">{c.problem_description}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(c.status)}`}>
                      {statusLabel(c.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{formatDate(c.created_at)}</td>
                  <td className="px-5 py-3">
                    <select
                      value={c.status}
                      onChange={e => updateStatus(c.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
                    >
                      <option value="open">Ouvert</option>
                      <option value="in_progress">En cours</option>
                      <option value="resolved">Résolu</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function ReturnsPage() {
  const [tab, setTab] = useState<'chat' | 'cases'>('chat')

  return (
    <div className="flex flex-col h-full gap-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Assistant retours</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestion des anomalies de retour matériel</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setTab('chat')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'chat' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Nouveau cas
          </button>
          <button
            onClick={() => setTab('cases')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'cases' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Historique
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {tab === 'chat' ? (
          <div className="h-full" style={{ minHeight: '600px' }}>
            <ChatPanel />
          </div>
        ) : (
          <CasesTable />
        )}
      </div>
    </div>
  )
}
