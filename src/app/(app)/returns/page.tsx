'use client'

import { useEffect, useRef, useState } from 'react'
import { useUserRole } from '@/lib/user-role-context'

// ── Types ──────────────────────────────────────────────────────────────────────

type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; name: string }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'done'; caseId: string | null }
  | { type: 'error'; message: string }

type ChatMessage = {
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
  messages: ChatMessage[]
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(cents: number | null) {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
    search_products:   'Recherche produit',
    get_stock_items:   'Identification des unités',
    add_internal_note: 'Note interne ajoutée',
    create_sav_order:  'Création de la SAV order',
    add_tag:           'Tag ajouté',
    add_sav_comment:   'Commentaire SAV',
    add_sav_line:      'Ajout ligne SAV',
    log_case:          'Cas enregistré',
    draft_email:       'Rédaction email',
    send_email:        'Envoi email',
  }
  return labels[name] || name
}

function toolStatus(result: string | undefined): 'pending' | 'success' | 'error' {
  if (!result) return 'pending'
  const lower = result.toLowerCase()
  if (lower.startsWith('erreur') || lower.startsWith('impossible') || lower.startsWith('échec')) return 'error'
  return 'success'
}

function toolSummary(name: string, result: string | undefined): string | null {
  if (!result) return null
  try {
    // fetch_order retourne du JSON avec les infos de l'order
    if (name === 'fetch_order') {
      const d = JSON.parse(result) as { number?: string | number; customer_name?: string; lines?: Array<{ product_name: string }> }
      const parts: string[] = []
      if (d.customer_name) parts.push(d.customer_name)
      if (d.number) parts.push(`#${d.number}`)
      if (d.lines?.length) parts.push(`${d.lines.length} article${d.lines.length > 1 ? 's' : ''}`)
      return parts.length ? parts.join(' · ') : null
    }
  } catch { /* not JSON */ }

  // create_sav_order retourne "✓ SAV order créée (numéro: XXXX) | id: ..."
  if (name === 'create_sav_order' && result.includes('numéro:')) {
    const m = result.match(/numéro:\s*(\S+)\)/)
    return m ? `Order #${m[1]}` : null
  }

  // search_products retourne "Produits trouvés :\n- Nom | id: ... | tracking: ..."
  if (name === 'search_products') {
    const lines = result.split('\n').filter(l => l.startsWith('- '))
    if (lines.length === 0) return result.includes('Aucun') ? 'Aucun résultat' : null
    const firstName = lines[0].split(' | ')[0].replace('- ', '')
    return lines.length === 1 ? firstName : `${firstName} +${lines.length - 1}`
  }

  // get_stock_items retourne "Stock items :\n- ID-1 | uuid: ... | ..."
  if (name === 'get_stock_items') {
    const lines = result.split('\n').filter(l => l.startsWith('- '))
    if (lines.length === 0) return result.includes('Aucun') ? 'Aucun stock item' : null
    const ids = lines.map(l => {
      const m = l.match(/ID-\d+/)
      return m ? m[0] : null
    }).filter(Boolean).join(', ')
    return `${lines.length} exemplaire${lines.length > 1 ? 's' : ''}${ids ? ' : ' + ids : ''}`
  }

  // add_tag → "✓ Tags ajoutés : TO_BE_REPAIRED, LATE"
  if (name === 'add_tag' && result.startsWith('✓')) {
    const m = result.match(/:\s*(.+)$/)
    return m ? m[1].trim() : null
  }

  // add_sav_comment → "✓ Commentaire SAV (order #XXXX) : ..."
  if (name === 'add_sav_comment' && result.startsWith('✓')) {
    const m = result.match(/:\s*(.+)$/)
    return m ? m[1].trim().slice(0, 80) : null
  }

  // add_internal_note → "✓ Note interne : ..."
  if (name === 'add_internal_note' && result.startsWith('✓')) {
    const m = result.match(/:\s*(.+)$/)
    return m ? m[1].trim().slice(0, 80) : null
  }

  // add_sav_line retourne "✓ Ligne produit ajoutée..."
  if (name === 'add_sav_line' && result.startsWith('✓')) {
    return result.replace('✓ ', '').slice(0, 80)
  }

  // log_case retourne "✓ Cas #N loggué..."
  if (name === 'log_case') {
    const m = result.match(/#\d+/)
    return m ? `Cas ${m[0]}` : null
  }

  // send_email retourne "✓ Email envoyé à ..."
  if (name === 'send_email' && result.includes('@')) {
    const m = result.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    return m ? `→ ${m[0]}` : null
  }

  return null
}

// ── Composant Chat ─────────────────────────────────────────────────────────────

function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
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

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text }
    const assistantId = `a-${Date.now()}`

    setMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', toolCalls: [] },
    ])
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
      let finishedCaseId: string | null = null

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
                m.id === assistantId ? { ...m, content: m.content + event.content } : m
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
            if (event.type === 'done') {
              finishedCaseId = event.caseId
              if (event.caseId) setCaseId(event.caseId)
            }
            if (event.type === 'error') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: m.content || `Erreur : ${event.message}` }
                  : m
              ))
            }
          } catch { /* ignore */ }
        }
      }

      // Sauvegarde la conversation dans le cas si on a un caseId
      if (finishedCaseId) {
        setMessages(current => {
          const toSave = current
            .filter(m => m.id !== 'welcome')
            .map(m => ({ role: m.role, content: m.content }))
          fetch('/api/returns/cases', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: finishedCaseId, messages: toSave }),
          }).catch(() => {/* non-bloquant */})
          return current
        })
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  async function quickSend(text: string) {
    setInput(text)
    // Petit délai pour que setInput soit pris en compte, puis on envoie directement
    await new Promise(r => setTimeout(r, 10))
    setInput('')

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text }
    const assistantId = `a-${Date.now()}`
    setMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', toolCalls: [] },
    ])
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
      let finishedCaseId: string | null = null

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
                m.id === assistantId ? { ...m, content: m.content + event.content } : m
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
                  ? { ...m, toolCalls: (m.toolCalls || []).map((tc, i) =>
                      i === (m.toolCalls?.length ?? 1) - 1 && tc.name === event.name
                        ? { ...tc, result: event.result } : tc) }
                  : m
              ))
            }
            if (event.type === 'done') {
              finishedCaseId = event.caseId
              if (event.caseId) setCaseId(event.caseId)
            }
          } catch { /* ignore */ }
        }
      }

      if (finishedCaseId) {
        setMessages(current => {
          const toSave = current.filter(m => m.id !== 'welcome').map(m => ({ role: m.role, content: m.content }))
          fetch('/api/returns/cases', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: finishedCaseId, messages: toSave }),
          }).catch(() => {})
          return current
        })
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

  // Quick replies : affichés quand le dernier message assistant contient une question
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.content)
  const lastContent = lastAssistant?.content || ''
  const hasQuestion = !sending && lastContent.includes('?')

  // Suggestions contextuelles
  const quickReplies: string[] = hasQuestion ? (() => {
    const lower = lastContent.toLowerCase()
    const questionCount = (lastContent.match(/\?/g) || []).length
    if (questionCount >= 2 && (lower.includes('assurance') || lower.includes('caution'))) {
      return ['Oui et oui', 'Non et non', 'Oui mais pas de caution', 'Non mais caution oui']
    }
    return ['Oui', 'Non']
  })() : []

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
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Assistant retours</h2>
          {caseId && <p className="text-xs text-green-600 mt-0.5">Cas actif en cours de traitement</p>}
        </div>
        <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
          Nouveau cas
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%] space-y-1.5">
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="space-y-1">
                  {msg.toolCalls.map((tc, i) => {
                    const status  = toolStatus(tc.result)
                    const summary = toolSummary(tc.name, tc.result)
                    return (
                      <div key={i} className="text-xs bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
                        <div className="flex items-center gap-2 text-gray-400">
                          {status === 'pending' && (
                            <span className="w-3 h-3 rounded-full border-2 border-blue-300 border-t-blue-500 animate-spin flex-shrink-0" />
                          )}
                          {status === 'success' && (
                            <span className="text-green-500 flex-shrink-0 font-medium">✓</span>
                          )}
                          {status === 'error' && (
                            <span className="text-red-400 flex-shrink-0 font-medium">✗</span>
                          )}
                          <span className={status === 'error' ? 'text-red-400' : 'text-gray-500'}>{toolLabel(tc.name)}</span>
                        </div>
                        {summary && (
                          <p className="mt-0.5 pl-5 text-gray-400 truncate">{summary}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
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

      <div className="p-3 border-t border-gray-100 space-y-2">
        {/* Quick replies */}
        {quickReplies.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {quickReplies.map(r => (
              <button
                key={r}
                onClick={() => quickSend(r)}
                disabled={sending}
                className="px-3 py-1 text-xs font-medium rounded-full border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-gray-700 transition-colors disabled:opacity-40"
              >
                {r}
              </button>
            ))}
          </div>
        )}
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

// ── Drawer conversation ────────────────────────────────────────────────────────

function ConversationDrawer({ c, onClose }: { c: ReturnCase; onClose: () => void }) {
  const msgs = c.messages || []
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Cas #{c.case_number} · Order {c.origin_order}</p>
            <h2 className="text-sm font-semibold text-gray-900">{c.problem_description}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Meta */}
        <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(c.status)}`}>
            {statusLabel(c.status)}
          </span>
          <span className="text-xs text-gray-400">{typeLabel(c.problem_type)}</span>
          <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
          {c.sav_order_id && (
            <span className="text-xs text-gray-400">SAV: {c.sav_order_id}</span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {msgs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucune conversation enregistrée</p>
          ) : (
            msgs.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-black text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Table des cas ──────────────────────────────────────────────────────────────

function CasesTable() {
  const { isAdmin } = useUserRole()
  const [cases, setCases] = useState<ReturnCase[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [openCase, setOpenCase] = useState<ReturnCase | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/returns/cases')
      .then(r => r.json())
      .then(d => { setCases(d.cases || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => prev.size === cases.length ? new Set() : new Set(cases.map(c => c.id)))
  }

  async function deleteSelected() {
    if (!selected.size) return
    setDeleting(true)
    await fetch('/api/returns/cases', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected) }),
    })
    setCases(prev => prev.filter(c => !selected.has(c.id)))
    setSelected(new Set())
    setDeleting(false)
  }

  async function openDetail(c: ReturnCase) {
    // Recharge le cas avec les messages complets
    const res = await fetch(`/api/returns/cases?id=${c.id}`)
    const d = await res.json()
    setOpenCase(d.case || c)
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900">Historique des cas</h2>
            {isAdmin && selected.size > 0 && (
              <button
                onClick={deleteSelected}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Supprimer ({selected.size})
              </button>
            )}
          </div>
          <div />
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
                  {isAdmin && (
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === cases.length && cases.length > 0}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Commande SAV</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Problème</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Date</th>
                  {isAdmin && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cases.map(c => (
                  <tr
                    key={c.id}
                    className={`transition-colors ${
                      !isAdmin ? 'cursor-pointer hover:bg-blue-50/40' : 'hover:bg-gray-50/50'
                    } ${isAdmin && selected.has(c.id) ? 'bg-red-50/30' : ''}`}
                    onClick={!isAdmin ? () => openDetail(c) : undefined}
                  >
                    {isAdmin && (
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="rounded"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.case_number}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.origin_order}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {typeLabel(c.problem_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{c.problem_description}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDateTime(c.created_at)}</td>
                    {isAdmin && (
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openDetail(c)}
                            className="text-gray-400 hover:text-gray-700 transition-colors p-1"
                            title="Voir la conversation"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openCase && (
        <ConversationDrawer c={openCase} onClose={() => setOpenCase(null)} />
      )}
    </>
  )
}

// ── Onglets Booqable par tag ───────────────────────────────────────────────────

type BooqableOrderRow = {
  id: string
  number: string | number
  customer_name: string
  order_sav: string
  notes_sav: string
  date_sav: string
  starts_at: string
  stops_at: string
  status: string
  payment_status: string | null
  url: string
  grand_total_in_cents: number | null
}

function BooqableOrdersTable({ tag }: { tag: string }) {
  const [orders, setOrders]     = useState<BooqableOrderRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [synced, setSynced]     = useState(false)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const storageKey = `bq_orders_${tag}`

  // Charger depuis localStorage au montage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as { orders: BooqableOrderRow[]; syncedAt: string }
        setOrders(parsed.orders)
        setSyncedAt(parsed.syncedAt)
        setSynced(true)
      }
    } catch { /* ignore */ }
  }, [storageKey])

  async function sync() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/returns/booqable-orders?tag=${encodeURIComponent(tag)}`)
      const data = await res.json() as { orders?: BooqableOrderRow[]; error?: string }
      if (data.error) { setError(data.error); return }
      const rows = data.orders || []
      const now  = new Date().toISOString()
      setOrders(rows)
      setSyncedAt(now)
      setSynced(true)
      // Persister jusqu'au prochain sync
      localStorage.setItem(storageKey, JSON.stringify({ orders: rows, syncedAt: now }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  function fmtDate(iso: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Tag Booqable : <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">{tag}</code>
          </h2>
          {synced && (
            <span className="text-xs text-gray-400">{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
          )}
          {syncedAt && (
            <span className="text-xs text-gray-400">
              · Sync {new Date(syncedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button
          onClick={sync}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          )}
          Sync
        </button>
      </div>

      {error && (
        <div className="px-5 py-3 bg-red-50 text-red-600 text-xs border-b border-red-100">{error}</div>
      )}

      {!synced && !loading && (
        <div className="p-10 text-center text-sm text-gray-400">
          Cliquez sur Sync pour charger les orders Booqable
        </div>
      )}

      {loading && (
        <div className="p-10 text-center text-sm text-gray-400">Chargement…</div>
      )}

      {synced && !loading && orders.length === 0 && (
        <div className="p-10 text-center text-sm text-gray-400">Aucune order avec le tag {tag}</div>
      )}

      {synced && !loading && orders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Commande SAV</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Client</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Commande d&apos;origine</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Prix</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Notes SAV</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Date suivi SAV</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Période</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <a
                      href={o.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-black hover:underline flex items-center gap-1"
                    >
                      #{o.number}
                      <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{o.customer_name}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{o.order_sav || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700 text-sm font-medium tabular-nums whitespace-nowrap">{formatPrice(o.grand_total_in_cents)}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-xs whitespace-pre-wrap break-words">{o.notes_sav || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{o.date_sav ? fmtDate(o.date_sav) : '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {fmtDate(o.starts_at)} → {fmtDate(o.stops_at)}
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

// ── Table multi-tags (Fermés / Facturés) ──────────────────────────────────────

type TagConfig = {
  tag: string
  label: string
  bgClass: string
  textClass: string
}

type TaggedOrderRow = BooqableOrderRow & { tagConfig: TagConfig }

function paymentStatusDisplay(ps: string | null): { label: string; cls: string } {
  if (ps === 'paid')            return { label: 'Payé',     cls: 'bg-green-50 text-green-700' }
  if (ps === 'payment_due')     return { label: 'À payer',  cls: 'bg-orange-50 text-orange-700' }
  if (ps === 'partially_paid')  return { label: 'Partiel',  cls: 'bg-amber-50 text-amber-700' }
  if (ps === 'overpaid')        return { label: 'Surpayé',  cls: 'bg-blue-50 text-blue-700' }
  return { label: ps || '—', cls: 'bg-gray-100 text-gray-500' }
}

function MultiTagBooqableOrdersTable({ tags, showPaymentStatus = false }: { tags: TagConfig[]; showPaymentStatus?: boolean }) {
  const [rows, setRows]         = useState<TaggedOrderRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [synced, setSynced]     = useState(false)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const storageKey = `bq_multi_${tags.map(t => t.tag).join('_')}`

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as { rows: TaggedOrderRow[]; syncedAt: string }
        setRows(parsed.rows)
        setSyncedAt(parsed.syncedAt)
        setSynced(true)
      }
    } catch { /* ignore */ }
  }, [storageKey])

  async function sync() {
    setLoading(true)
    setError(null)
    try {
      const results = await Promise.all(
        tags.map(tc =>
          fetch(`/api/returns/booqable-orders?tag=${encodeURIComponent(tc.tag)}`)
            .then(r => r.json() as Promise<{ orders?: BooqableOrderRow[]; error?: string }>)
            .then(data => (data.orders || []).map(o => ({ ...o, tagConfig: tc })))
        )
      )
      const merged = results.flat().sort((a, b) => {
        const da = a.date_sav || a.stops_at || ''
        const db = b.date_sav || b.stops_at || ''
        return db.localeCompare(da)
      })
      const now = new Date().toISOString()
      setRows(merged)
      setSyncedAt(now)
      setSynced(true)
      localStorage.setItem(storageKey, JSON.stringify({ rows: merged, syncedAt: now }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  function fmtDate(iso: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Tag Booqable :{' '}
            {tags.map((tc, i) => (
              <span key={tc.tag}>
                {i > 0 && <span className="font-normal text-gray-400"> et </span>}
                <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">{tc.tag}</code>
              </span>
            ))}
          </h2>
          {synced && (
            <span className="text-xs text-gray-400">{rows.length} order{rows.length !== 1 ? 's' : ''}</span>
          )}
          {syncedAt && (
            <span className="text-xs text-gray-400">
              · Sync {new Date(syncedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {/* Légende */}
          <div className="flex items-center gap-2 ml-2">
            {tags.map(tc => (
              <span key={tc.tag} className={`px-2 py-0.5 rounded-full text-xs font-medium ${tc.bgClass} ${tc.textClass}`}>
                {tc.label}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={sync}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          )}
          Sync
        </button>
      </div>

      {error && (
        <div className="px-5 py-3 bg-red-50 text-red-600 text-xs border-b border-red-100">{error}</div>
      )}
      {!synced && !loading && (
        <div className="p-10 text-center text-sm text-gray-400">Cliquez sur Sync pour charger les orders Booqable</div>
      )}
      {loading && (
        <div className="p-10 text-center text-sm text-gray-400">Chargement…</div>
      )}
      {synced && !loading && rows.length === 0 && (
        <div className="p-10 text-center text-sm text-gray-400">Aucune order trouvée</div>
      )}
      {synced && !loading && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Statut</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Commande SAV</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Client</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Commande d&apos;origine</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Prix</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Notes SAV</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Date suivi SAV</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Période</th>
                {showPaymentStatus && <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Paiement</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(o => {
                const ps = showPaymentStatus ? paymentStatusDisplay(o.payment_status) : null
                return (
                  <tr key={`${o.tagConfig.tag}-${o.id}`} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${o.tagConfig.bgClass} ${o.tagConfig.textClass}`}>
                        {o.tagConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={o.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-black hover:underline flex items-center gap-1"
                      >
                        #{o.number}
                        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{o.customer_name}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{o.order_sav || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700 text-sm font-medium tabular-nums whitespace-nowrap">{formatPrice(o.grand_total_in_cents)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-xs whitespace-pre-wrap break-words">{o.notes_sav || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{o.date_sav ? fmtDate(o.date_sav) : '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {fmtDate(o.starts_at)} → {fmtDate(o.stops_at)}
                    </td>
                    {ps && (
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ps.cls}`}>{ps.label}</span>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────

type Tab = 'chat' | 'open' | 'closed' | 'billed' | 'replacement' | 'repair' | 'log'

const CLOSED_TAGS: TagConfig[] = [
  { tag: 'late_returned', label: 'Retournés',  bgClass: 'bg-green-50',  textClass: 'text-green-700' },
  { tag: 'late_waived',   label: 'Offerts',    bgClass: 'bg-purple-50', textClass: 'text-purple-700' },
]

const BILLED_TAGS: TagConfig[] = [
  { tag: 'late_caution',  label: 'Pris sur la caution', bgClass: 'bg-orange-50', textClass: 'text-orange-700' },
  { tag: 'late_billed_d', label: 'Facturé virement',     bgClass: 'bg-blue-50',   textClass: 'text-blue-700' },
  { tag: 'late_billed_w', label: 'Facturé CB',           bgClass: 'bg-indigo-50', textClass: 'text-indigo-700' },
]

export default function ReturnsPage() {
  const [tab, setTab] = useState<Tab>('chat')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat',        label: 'Nouveau cas' },
    { id: 'open',        label: 'Ouverts' },
    { id: 'closed',      label: 'Fermés' },
    { id: 'billed',      label: 'Facturés' },
    { id: 'replacement', label: 'En cours de remplacement' },
    { id: 'repair',      label: 'En cours de réparation' },
    { id: 'log',         label: 'Log' },
  ]

  return (
    <div className="flex flex-col h-full gap-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Assistant retours</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestion des anomalies de retour matériel</p>
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

      <div className="flex-1 min-h-0">
        {tab === 'chat' && (
          <div className="h-full" style={{ minHeight: '600px' }}>
            <ChatPanel />
          </div>
        )}
        {tab === 'open'        && <BooqableOrdersTable tag="LATE" />}
        {tab === 'closed'      && <MultiTagBooqableOrdersTable tags={CLOSED_TAGS} />}
        {tab === 'billed'      && <MultiTagBooqableOrdersTable tags={BILLED_TAGS} showPaymentStatus />}
        {tab === 'replacement' && <BooqableOrdersTable tag="TO_BE_REPLACED" />}
        {tab === 'repair'      && <BooqableOrdersTable tag="TO_BE_REPAIRED" />}
        {tab === 'log'         && <CasesTable />}
      </div>
    </div>
  )
}
