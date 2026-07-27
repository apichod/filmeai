'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────────────

type WorkflowState = {
  step_index: number
  vars: Record<string, string | undefined>
  status: 'running' | 'waiting_for_input' | 'completed'
}

type WorkflowStep = {
  id: string
  type: 'action' | 'question' | 'check'
  title: string
  booqable_action?: string
  order_context?: string
  parameters?: Record<string, unknown>
  condition?: string
}

type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; name: string }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'choices'; order_id: string; items: Array<{ label: string; tag: string }>; multiSelect?: boolean }
  | { type: 'text_input'; output_var: string; placeholder: string; unit: string }
  | { type: 'email_editor'; subject: string; body: string }
  | { type: 'email_preview'; document_id: string; subject: string; body: string; name: string }
  | { type: 'done'; caseId: string | null; workflowState?: WorkflowState | null }
  | { type: 'error'; message: string }

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: { name: string; result?: string }[]
  emailEditor?: { subject: string; body: string }
  emailPreview?: { document_id: string; subject: string; body: string; name: string }
  workflowDone?: boolean
}

type Level1Item = { key: string; label: string }

type ActiveWorkflow = {
  slug: string
  name: string
  chat_label: string | null
  description?: string
  category: string
  parent_category: string | null
  welcome: string | null
  is_active: boolean
}

type SubOption = { label: string; scenario: string; welcome: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function toolLabel(name: string) {
  const labels: Record<string, string> = {
    fetch_order:            'Récupération de l\'order',
    duplicate_order:        'Duplication de la commande',
    revert_to_concept:      'Remise en brouillon',
    reserve_order:          'Réservation',
    start_order:            'Démarrage',
    stop_order:             'Arrêt',
    cancel_order:           'Annulation',
    clear_tags:             'Suppression des tags',
    add_tag:                'Tags ajoutés',
    add_sav_comment:        'Commentaire SAV',
    add_internal_note:      'Note interne',
    create_new_return_order:'Création commande de retour',
    zero_out_order_lines:   'Remise à zéro des lignes',
    set_original_order:     'Commande d\'origine liée',
    send_email:             'Envoi email',
    ask_yes_no:             'Question Oui / Non',
    add_discount:                    'Application remise',
    add_discount_with_input_field:   'Saisie remise manuelle',
    remove_deposit:        'Suppression caution',
    read_customer_notes:   'Commentaires client',
    read_delivery_options:   'Options de livraison',
    build_delivery_event:    'Formatage données livraison',
    create_delivery_event:   'Création événement calendrier',
    choose_article:         'Choix de l\'article',
    choose_problem_tag:     'Choix du type de problème',
    remove_other_lines:     'Suppression des autres lignes',
    search_products:        'Recherche produit',
    get_stock_items:        'Identification des unités',
    create_sav_order:       'Création de la SAV order',
    add_sav_line:           'Ajout ligne SAV',
    add_new_product_line:   'Ajout ligne produit',
    log_case:               'Cas enregistré',
    draft_email:            'Rédaction email',
    update_return_date:     'Mise à jour de la date de retour',
    remove_product_line:    'Suppression ligne produit',
    send_webshop_quote:     'Envoi devis webshop',
    create_quote:           'Création devis',
    search_customer:        'Recherche client',
    fetch_customer:         'Récupération client',
  }
  return labels[name] || name
}

function toolStatus(result: string | undefined): 'pending' | 'success' | 'warning' | 'error' | 'skipped' {
  if (!result) return 'pending'
  if (result.startsWith('⏭')) return 'skipped'
  const lower = result.toLowerCase()
  if (lower.startsWith('erreur') || lower.startsWith('impossible') || lower.startsWith('échec')) return 'error'
  try {
    const parsed = JSON.parse(result) as Record<string, unknown>
    if (parsed.success === true) return parsed.warning ? 'warning' : 'success'
    if (parsed.error) return 'error'
    if (typeof parsed.message === 'string' && parsed.message.toLowerCase().includes('error')) return 'error'
  } catch { /* not JSON */ }
  if (lower.includes('shortage') || lower.includes('booqable error') || lower.includes('failed')) return 'error'
  return 'success'
}

function toolErrorMessage(result: string | undefined): string | null {
  if (!result) return null
  try {
    const parsed = JSON.parse(result) as Record<string, unknown>
    if (typeof parsed.error === 'string') return parsed.error
    if (parsed.warning && typeof parsed.warning === 'string') return parsed.warning.slice(0, 120)
    if (typeof parsed.message === 'string' && (parsed.message as string).startsWith('⚠')) return null
    if (typeof parsed.message === 'string') return parsed.message
  } catch { /* not JSON */ }
  const lower = result.toLowerCase()
  if (lower.includes('shortage')) return result.replace(/^.*?(shortage[^\n.]*)/i, '$1').slice(0, 120)
  if (lower.includes('booqable error')) return result.slice(0, 120)
  if (lower.startsWith('erreur') || lower.startsWith('impossible') || lower.startsWith('échec')) return result.slice(0, 120)
  return null
}

function toolSummary(name: string, result: string | undefined): string | null {
  if (!result) return null
  try {
    if (name === 'fetch_order') {
      const d = JSON.parse(result) as { number?: string | number; customer_name?: string; lines?: Array<{ product_name: string }> }
      const parts: string[] = []
      if (d.customer_name) parts.push(d.customer_name)
      if (d.number) parts.push(`#${d.number}`)
      if (d.lines?.length) parts.push(`${d.lines.length} article${d.lines.length > 1 ? 's' : ''}`)
      return parts.length ? parts.join(' · ') : null
    }
  } catch { /* not JSON */ }
  if (name === 'create_sav_order' && result.includes('numéro:')) {
    const m = result.match(/numéro:\s*(\S+)\)/)
    return m ? `Order #${m[1]}` : null
  }
  if (name === 'search_products') {
    const lines = result.split('\n').filter(l => l.startsWith('- '))
    if (lines.length === 0) return result.includes('Aucun') ? 'Aucun résultat' : null
    const firstName = lines[0].split(' | ')[0].replace('- ', '')
    return lines.length === 1 ? firstName : `${firstName} +${lines.length - 1}`
  }
  if (name === 'get_stock_items') {
    const lines = result.split('\n').filter(l => l.startsWith('- '))
    if (lines.length === 0) return result.includes('Aucun') ? 'Aucun stock item' : null
    const ids = lines.map(l => { const m = l.match(/ID-\d+/); return m ? m[0] : null }).filter(Boolean).join(', ')
    return `${lines.length} exemplaire${lines.length > 1 ? 's' : ''}${ids ? ' : ' + ids : ''}`
  }
  if (name === 'add_tag' && result.startsWith('✓')) { const m = result.match(/:\s*(.+)$/); return m ? m[1].trim() : null }
  if (name === 'add_sav_comment' && result.startsWith('✓')) { const m = result.match(/:\s*(.+)$/); return m ? m[1].trim().slice(0, 80) : null }
  if (name === 'add_internal_note' && result.startsWith('✓')) { const m = result.match(/:\s*(.+)$/); return m ? m[1].trim().slice(0, 80) : null }
  if ((name === 'add_sav_line' || name === 'add_new_product_line') && result.startsWith('✓')) return result.replace('✓ ', '').slice(0, 80)
  if (name === 'create_new_return_order' && result.startsWith('✓')) { const m = result.match(/numéro:\s*(\S+)\)/); return m ? `Order #${m[1]}` : null }
  if (name === 'log_case') { const m = result.match(/#\d+/); return m ? `Cas ${m[0]}` : null }
  if (name === 'send_email' && result.includes('@')) { const m = result.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/); return m ? `→ ${m[0]}` : null }
  try {
    const d = JSON.parse(result) as Record<string, unknown>
    if (d.success === true && typeof d.message === 'string') return d.message
    if (!('success' in d) && !('error' in d) && typeof d.message === 'string') return d.message
  } catch { /* not JSON */ }
  return null
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface WorkflowChatPanelProps {
  chatType: 'retours' | 'planning'
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function WorkflowChatPanel({ chatType }: WorkflowChatPanelProps) {
  const isPlanning   = chatType === 'planning'
  const iconColor    = isPlanning ? 'bg-indigo-500' : 'bg-blue-500'
  const defaultTitle = isPlanning ? 'Assistant planning' : 'Assistant retours'
  const backHref     = isPlanning ? '/requests' : '/returns'
  const placeholder  = isPlanning ? 'Décrivez votre demande…' : 'Numéro d\'order et description du problème…'
  const defaultWelcome = isPlanning
    ? 'Bonjour ! Je suis l\'assistant planning. Comment puis-je vous aider ?'
    : 'Bonjour ! Je suis l\'assistant retours. Donnez-moi le numéro d\'order et décrivez le problème.'

  const [messages, setMessages]                   = useState<ChatMessage[]>([{ id: 'welcome', role: 'assistant', content: defaultWelcome }])
  const [input, setInput]                         = useState('')
  const [sending, setSending]                     = useState(false)
  const [pendingChoices, setPendingChoices]        = useState<Array<{ label: string; tag: string }> | null>(null)
  const [pendingChoicesMulti, setPendingChoicesMulti] = useState(false)
  const [selectedChoiceTags, setSelectedChoiceTags]   = useState<Set<string>>(new Set())
  const [pendingTextInput, setPendingTextInput]    = useState<{ placeholder: string; unit: string } | null>(null)
  const [textInputValue, setTextInputValue]        = useState('')
  const [pendingEmail, setPendingEmail]           = useState<{ subject: string; body: string } | null>(null)
  const [emailImproving, setEmailImproving]       = useState(false)
  const [emailInstruction, setEmailInstruction]   = useState('')
  const [caseId, setCaseId]                       = useState<string | null>(null)
  const [scenario, setScenario]                   = useState<string | null>(null)
  const [level1, setLevel1]                       = useState<string | null>(null)
  const [selectedLabel, setSelectedLabel]         = useState<string>('')
  const [fetchedCustomerId, setFetchedCustomerId] = useState<string | null>(null)
  const [fetchedCustomerName, setFetchedCustomerName]   = useState<string | null>(null)
  const [fetchedCustomerEmail, setFetchedCustomerEmail] = useState<string | null>(null)
  const [workflowState, setWorkflowState]         = useState<WorkflowState | null>(null)
  const [activeSteps, setActiveSteps]             = useState<WorkflowStep[]>([])
  const [showSteps, setShowSteps]                 = useState(false)
  const [level1Items, setLevel1Items]             = useState<Level1Item[]>([])
  const [availableWorkflows, setAvailableWorkflows] = useState<ActiveWorkflow[]>([])
  const [workflowsLoaded, setWorkflowsLoaded]     = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Charge les étapes du workflow actif
  useEffect(() => {
    if (!scenario) { setActiveSteps([]); return }
    fetch('/api/returns/workflows')
      .then(r => r.json())
      .then((d: { workflows?: Array<{ slug: string; steps?: WorkflowStep[] }> }) => {
        const wf = (d.workflows || []).find(w => w.slug === scenario)
        setActiveSteps((wf?.steps || []) as WorkflowStep[])
      })
      .catch(() => {})
  }, [scenario])

  // Charge les catégories et workflows
  useEffect(() => {
    Promise.all([
      fetch(`/api/chat-categories?chat_type=${chatType}`).then(r => r.json()),
      fetch('/api/returns/workflows').then(r => r.json()),
    ])
      .then(([cats, wfs]) => {
        const categories = (cats.categories ?? []) as Array<{ key: string; label: string; is_active: boolean }>
        setLevel1Items(categories.filter(c => c.is_active).map(c => ({ key: c.key, label: c.label })))
        const allWfs = (wfs.workflows ?? []) as ActiveWorkflow[]
        setAvailableWorkflows(allWfs.filter(w => w.is_active))
        setWorkflowsLoaded(true)
      })
      .catch(() => setWorkflowsLoaded(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatType])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Streaming helper ─────────────────────────────────────────────────────────

  async function streamChat(apiMessages: { role: string; content: string }[], assistantId: string) {
    const res = await fetch('/api/returns/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: apiMessages,
        caseId,
        scenario,
        customerId: fetchedCustomerId,
        customerName: fetchedCustomerName,
        customerEmail: fetchedCustomerEmail,
        workflowState,
      }),
    })
    if (!res.body) throw new Error('No body')

    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buffer = ''
    let finishedCaseId: string | null = null

    streamLoop: while (true) {
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
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + event.content } : m))
          }
          if (event.type === 'tool_call') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, toolCalls: [...(m.toolCalls || []), { name: event.name }] } : m
            ))
          }
          if (event.type === 'tool_result') {
            if (event.name === 'fetch_order') {
              try {
                const parsed = JSON.parse(event.result) as { customer_id?: string; customer_name?: string; customer_email?: string }
                const cid = parsed.customer_id || ''
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid)) setFetchedCustomerId(cid)
                if (parsed.customer_name) setFetchedCustomerName(parsed.customer_name)
                if (parsed.customer_email) setFetchedCustomerEmail(parsed.customer_email)
              } catch { /* ignore */ }
            }
            setMessages(prev => prev.map(m => {
              if (m.id !== assistantId) return m
              let matched = false
              return {
                ...m,
                toolCalls: (m.toolCalls || []).map(tc => {
                  if (!matched && tc.name === event.name && tc.result === undefined) { matched = true; return { ...tc, result: event.result } }
                  return tc
                }),
              }
            }))
          }
          if (event.type === 'text_input') {
            setPendingTextInput({ placeholder: event.placeholder, unit: event.unit })
            setTextInputValue('')
          }
          if (event.type === 'choices') {
            setPendingChoices(event.items)
            setPendingChoicesMulti(event.multiSelect ?? false)
            setSelectedChoiceTags(new Set())
          }
          if (event.type === 'email_editor') {
            setPendingEmail({ subject: event.subject, body: event.body })
            setEmailInstruction('')
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, emailEditor: { subject: event.subject, body: event.body } } : m
            ))
          }
          if (event.type === 'email_preview') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, emailPreview: { document_id: event.document_id, subject: event.subject, body: event.body, name: event.name } }
                : m
            ))
          }
          if (event.type === 'done') {
            finishedCaseId = event.caseId
            if (event.caseId) setCaseId(event.caseId)
            if (event.workflowState !== undefined) setWorkflowState(event.workflowState ?? null)
            if (event.workflowState?.status === 'completed') {
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, workflowDone: true } : m))
            }
            break streamLoop
          }
          if (event.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: m.content || `Erreur : ${event.message}` } : m
            ))
          }
        } catch { /* ignore */ }
      }
    }

    // Sauvegarde dans le cas (retours uniquement)
    if (finishedCaseId && chatType === 'retours') {
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
  }

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text }
    const assistantId = `a-${Date.now()}`

    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', toolCalls: [] }])
    setSending(true)

    try {
      const apiMessages = [...messages, userMsg]
        .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
        .map(m => ({ role: m.role, content: m.content }))
      await streamChat(apiMessages, assistantId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Erreur : ${msg}` } : m))
    } finally {
      setSending(false)
    }
  }

  async function quickSend(text: string) {
    setInput('')
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text }
    const assistantId = `a-${Date.now()}`
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', toolCalls: [] }])
    setSending(true)
    try {
      const apiMessages = [...messages, userMsg]
        .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
        .map(m => ({ role: m.role, content: m.content }))
      await streamChat(apiMessages, assistantId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Erreur : ${msg}` } : m))
    } finally {
      setSending(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
  }

  function reset() {
    setScenario(null)
    setLevel1(null)
    setSelectedLabel('')
    setMessages([{ id: 'welcome', role: 'assistant', content: defaultWelcome }])
    setCaseId(null)
    setInput('')
    setFetchedCustomerId(null)
    setFetchedCustomerName(null)
    setFetchedCustomerEmail(null)
  }

  function selectSubOption(opt: SubOption, label: string) {
    setScenario(opt.scenario)
    setSelectedLabel(label)
    setMessages([{ id: 'welcome', role: 'assistant', content: opt.welcome || defaultWelcome }])
    setCaseId(null)
    setWorkflowState(null)
    setActiveSteps([])
    setShowSteps(false)
    setInput('')
    setFetchedCustomerId(null)
    setFetchedCustomerName(null)
    setFetchedCustomerEmail(null)
  }

  function selectOtherWorkflow(wf: ActiveWorkflow) {
    setScenario(wf.slug)
    const displayName = wf.chat_label || wf.name
    setSelectedLabel(displayName)
    const welcome = wf.welcome
      || (wf.description ? `${wf.description}\nDonnez-moi le numéro de la commande d'origine.` : `Tâche : ${displayName}.`)
    setMessages([{ id: 'welcome', role: 'assistant', content: welcome }])
    setCaseId(null)
    setWorkflowState(null)
    setActiveSteps([])
    setShowSteps(false)
    setInput('')
    setFetchedCustomerId(null)
    setFetchedCustomerName(null)
    setFetchedCustomerEmail(null)
  }

  // ── Menu piloté par Supabase ───────────────────────────────────────────────

  // Filtre strict : uniquement les workflows de la bonne catégorie
  const chatWorkflows = availableWorkflows.filter(w => w.category === chatType)

  const level2Map: Record<string, SubOption[]> = {}
  for (const wf of chatWorkflows) {
    if (!wf.parent_category) continue
    if (!level2Map[wf.parent_category]) level2Map[wf.parent_category] = []
    level2Map[wf.parent_category].push({
      label:    wf.chat_label || wf.name,
      scenario: wf.slug,
      welcome:  wf.welcome || wf.description || '',
    })
  }

  const otherWorkflows = chatWorkflows.filter(w => !w.parent_category)

  // Catégories DB + fallback depuis parent_category des workflows (filtrés par chatType)
  const effectiveLevel1Items: Level1Item[] = level1Items.length > 0
    ? level1Items
    : Array.from(new Set(chatWorkflows.map(w => w.parent_category).filter(Boolean) as string[]))
        .map(key => ({ key, label: key }))

  const visibleLevel1Items = effectiveLevel1Items.filter(item => (level2Map[item.key]?.length ?? 0) > 0)

  // ── Sélecteur niveau 1 ──────────────────────────────────────────────────────
  if (!scenario && !level1) return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
        <div className={`w-14 h-14 rounded-full ${iconColor} flex items-center justify-center flex-shrink-0`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-base font-bold text-gray-900 text-center">Comment puis-je t&apos;aider&nbsp;?</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {!workflowsLoaded ? (
            <span className="text-xs text-gray-400">Chargement…</span>
          ) : visibleLevel1Items.length === 0 && otherWorkflows.length === 0 ? (
            <div className="text-center space-y-2">
              <p className="text-sm text-gray-500">Aucun workflow {chatType} configuré.</p>
              <Link href="/assistant/chat" className="text-xs text-indigo-600 hover:underline">Configurer les catégories →</Link>
            </div>
          ) : (
            <>
              {visibleLevel1Items.map(item => (
                <button key={item.key} onClick={() => setLevel1(item.key)}
                  className="px-4 py-2 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-all">
                  {item.label}
                </button>
              ))}
              {otherWorkflows.map(wf => (
                <button key={wf.slug} onClick={() => selectOtherWorkflow(wf)}
                  className="px-4 py-2 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-all">
                  {wf.chat_label || wf.name}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )

  // ── Sélecteur niveau 2 ──────────────────────────────────────────────────────
  if (!scenario && level1) {
    const l1Label   = effectiveLevel1Items.find(i => i.key === level1)?.label ?? level1
    const subOptions = level2Map[level1] ?? []
    return (
      <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
          <div className={`w-14 h-14 rounded-full ${iconColor} flex items-center justify-center flex-shrink-0`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-gray-900">Quelle tâche veux-tu exécuter&nbsp;?</p>
            <p className="text-xs text-gray-400 mt-1">{l1Label}</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {subOptions.map(opt => {
              const wfLabel = availableWorkflows.find(w => w.slug === opt.scenario)?.chat_label || opt.label
              return (
                <button key={opt.scenario}
                  onClick={() => selectSubOption(opt, `${l1Label} — ${wfLabel}`)}
                  className="px-4 py-2 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-all">
                  {wfLabel}
                </button>
              )
            })}
          </div>
          <button onClick={() => setLevel1(null)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            ← Retour
          </button>
        </div>
      </div>
    )
  }

  // ── Interface de chat ────────────────────────────────────────────────────────

  const stepContextColor = (ctx?: string) => {
    if (ctx === 'parent')   return 'bg-blue-50 text-blue-600 border-blue-200'
    if (ctx === 'child')    return 'bg-violet-50 text-violet-600 border-violet-200'
    if (ctx === 'original') return 'bg-amber-50 text-amber-600 border-amber-200'
    if (ctx === 'return')   return 'bg-green-50 text-green-600 border-green-200'
    return 'bg-gray-50 text-gray-400 border-gray-200'
  }

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.content)
  const lastContent   = lastAssistant?.content || ''
  const CLOSED_QUESTION_PATTERNS = [
    /est[-\s]ce que/i, /avez[-\s]vous/i, /y a[-\s]t[-\s]il/i, /voulez[-\s]vous/i,
    /souhaitez[-\s]vous/i, /confirmez[-\s]vous/i, /avez vous/i, /êtes[-\s]vous/i,
    /faut[-\s]il/i, /dois[-\s]je/i, /le client a[-\s]t[-\s]il/i, /a[-\s]t[-\s]il/i,
    /confirmer l'envoi/i, /envoyer l'email/i, /procéder/i,
  ]
  const isClosedQuestion = !sending && !pendingChoices && lastContent.includes('?') &&
    CLOSED_QUESTION_PATTERNS.some(p => p.test(lastContent))
  const quickReplies: string[] = isClosedQuestion ? (() => {
    const lower = lastContent.toLowerCase()
    const questionCount = (lastContent.match(/\?/g) || []).length
    if (questionCount >= 2 && (lower.includes('assurance') || lower.includes('caution'))) {
      return ['Oui et oui', 'Non et non', 'Oui mais pas de caution', 'Non mais caution oui']
    }
    return ['Oui', 'Non']
  })() : []

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{selectedLabel || defaultTitle}</h2>
          {caseId && <p className="text-xs text-green-600 mt-0.5">Cas actif en cours de traitement</p>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">← Retour</button>
          {activeSteps.length > 0 && (
            <button onClick={() => setShowSteps(v => !v)}
              className={`text-xs font-medium px-2 py-1 rounded-md border transition-colors ${showSteps ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
              Étapes {workflowState ? `${workflowState.step_index + 1}/${activeSteps.length}` : `0/${activeSteps.length}`}
            </button>
          )}
        </div>
      </div>

      {/* Panel étapes */}
      {showSteps && activeSteps.length > 0 && (
        <div className="border-b border-gray-100 bg-gray-50 overflow-y-auto max-h-64">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Étapes structurées</span>
            {workflowState?.vars && Object.keys(workflowState.vars).filter(k => workflowState.vars[k]).length > 0 && (
              <div className="flex gap-1 flex-wrap justify-end">
                {Object.entries(workflowState.vars).filter(([, v]) => v && !v.startsWith('[')).map(([k, v]) => (
                  <span key={k} className="text-[10px] font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-500">
                    {k.replace(/_order_(id|number)$/, (_, g) => g === 'id' ? ' uuid' : ' #')} = {v!.length > 12 ? v!.slice(0, 8) + '…' : v}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="px-3 pb-3 space-y-1">
            {activeSteps.map((step, i) => {
              const isCurrent = workflowState?.step_index === i
              const isDone    = workflowState ? i < workflowState.step_index : false
              return (
                <div key={step.id}
                  className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all ${isCurrent ? 'bg-white border border-blue-200 shadow-sm' : isDone ? 'opacity-40' : 'opacity-60'}`}>
                  <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${isCurrent ? 'bg-blue-500 text-white' : isDone ? 'bg-gray-300 text-white' : 'bg-gray-100 text-gray-400'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`font-medium ${isCurrent ? 'text-gray-900' : 'text-gray-600'}`}>{step.title}</span>
                    </div>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${step.type === 'action' ? 'bg-orange-50 text-orange-500 border-orange-200' : step.type === 'question' ? 'bg-sky-50 text-sky-500 border-sky-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>{step.type}</span>
                      {step.booqable_action && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-gray-50 text-gray-500 border-gray-200 font-mono">{step.booqable_action}</span>}
                      {step.order_context && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${stepContextColor(step.order_context)}`}>{step.order_context}</span>}
                      {step.condition && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-600 border-amber-200 font-mono">if {step.condition}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Messages */}
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
                      <div key={i} className={`text-xs rounded-lg px-3 py-1.5 border ${status === 'skipped' ? 'bg-white border-gray-100 opacity-50' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex items-center gap-2 text-gray-400">
                          {status === 'pending' && <span className="w-3 h-3 rounded-full border-2 border-blue-300 border-t-blue-500 animate-spin flex-shrink-0" />}
                          {status === 'success' && <span className="text-green-500 flex-shrink-0 font-medium">✓</span>}
                          {status === 'warning' && <span className="text-amber-400 flex-shrink-0 font-medium">⚠</span>}
                          {status === 'error'   && <span className="text-red-400 flex-shrink-0 font-medium">✗</span>}
                          {status === 'skipped' && <span className="text-gray-300 flex-shrink-0 font-medium">–</span>}
                          <span className={status === 'error' ? 'text-red-400' : status === 'warning' ? 'text-amber-500' : status === 'skipped' ? 'text-gray-300' : 'text-gray-500'}>{toolLabel(tc.name)}</span>
                        </div>
                        {status === 'error' && toolErrorMessage(tc.result) && <p className="mt-0.5 pl-5 text-red-400 text-xs">{toolErrorMessage(tc.result)}</p>}
                        {status === 'warning' && toolErrorMessage(tc.result) && <p className="mt-0.5 pl-5 text-amber-400 text-xs">{toolErrorMessage(tc.result)}</p>}
                        {status === 'skipped' && <p className="mt-0.5 pl-5 text-gray-300 text-xs">Condition non remplie</p>}
                        {(status === 'success' || status === 'pending') && summary && <p className="mt-0.5 pl-5 text-gray-400 whitespace-pre-wrap">{summary}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Éditeur email */}
              {msg.emailEditor && (
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm w-full max-w-lg">
                  <div className="flex items-center px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs font-semibold text-gray-600">✉️ Brouillon email — modifiez si besoin</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Objet</label>
                      <input type="text" value={pendingEmail?.subject ?? msg.emailEditor.subject}
                        onChange={e => setPendingEmail(p => ({ subject: e.target.value, body: p?.body ?? msg.emailEditor!.body }))}
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Corps</label>
                      <textarea value={pendingEmail?.body ?? msg.emailEditor.body}
                        onChange={e => setPendingEmail(p => ({ subject: p?.subject ?? msg.emailEditor!.subject, body: e.target.value }))}
                        rows={8}
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 resize-y font-mono" />
                    </div>
                    <div className="flex gap-2 items-center">
                      <input type="text" value={emailInstruction}
                        onChange={e => setEmailInstruction(e.target.value)}
                        placeholder="Ex: Rends plus formel, ajoute une excuse..."
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-400" />
                      <button onClick={async () => {
                        const sub = pendingEmail?.subject ?? msg.emailEditor!.subject
                        const bod = pendingEmail?.body ?? msg.emailEditor!.body
                        if (!emailInstruction.trim()) return
                        setEmailImproving(true)
                        try {
                          const res = await fetch('/api/returns/improve-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction: emailInstruction, subject: sub, body: bod }) })
                          const data = await res.json() as { subject?: string; body?: string }
                          if (data.subject && data.body) setPendingEmail({ subject: data.subject, body: data.body })
                          setEmailInstruction('')
                        } finally { setEmailImproving(false) }
                      }} disabled={emailImproving || !emailInstruction.trim()}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-40 whitespace-nowrap">
                        {emailImproving ? '...' : '✨ Améliorer'}
                      </button>
                    </div>
                    <button onClick={() => {
                      const sub = pendingEmail?.subject ?? msg.emailEditor!.subject
                      const bod = pendingEmail?.body ?? msg.emailEditor!.body
                      const payload = '__email_confirm__:' + JSON.stringify({ subject: sub, body: bod })
                      setPendingEmail(null)
                      setEmailInstruction('')
                      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, emailEditor: undefined } : m))
                      void quickSend(payload)
                    }} disabled={sending}
                      className="w-full py-2 text-xs font-semibold rounded-lg bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-40">
                      Envoyer cet email ✓
                    </button>
                  </div>
                </div>
              )}
              {/* Aperçu template Booqable */}
              {msg.emailPreview && (
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm w-full max-w-lg">
                  <div className="flex items-center px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs font-semibold text-gray-600">📋 Template Booqable — {msg.emailPreview.name || msg.emailPreview.document_id}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {msg.emailPreview.subject && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Objet</label>
                        <div className="w-full text-xs border border-gray-100 rounded-lg px-3 py-1.5 bg-gray-50 text-gray-600">{msg.emailPreview.subject}</div>
                      </div>
                    )}
                    {msg.emailPreview.body && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Corps</label>
                        <div className="w-full text-xs border border-gray-100 rounded-lg px-3 py-2 bg-gray-50 text-gray-600 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">{msg.emailPreview.body}</div>
                      </div>
                    )}
                    <button onClick={() => {
                      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, emailPreview: undefined } : m))
                      void quickSend('__booqable_confirm__')
                    }} disabled={sending}
                      className="w-full py-2 text-xs font-semibold rounded-lg bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-40">
                      Envoyer cette template ✓
                    </button>
                  </div>
                </div>
              )}
              {(msg.content || (msg.role === 'assistant' && !msg.emailEditor && !msg.emailPreview)) && (
                <div className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-black text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                  {msg.workflowDone ? (
                    <div className="flex flex-col gap-2">
                      <span className="font-medium">✅ Workflow terminé !</span>
                      <a href={backHref} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">↩ Retour au sommaire</a>
                    </div>
                  ) : msg.content || (
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

      {/* Input zone */}
      <div className="p-3 border-t border-gray-100 space-y-2">
        {pendingTextInput && (
          <div className="flex items-center gap-2 px-1">
            <div className="flex items-center flex-1 border border-gray-300 rounded-lg overflow-hidden bg-white">
              <input
                type="number"
                min="0"
                max="100"
                value={textInputValue}
                onChange={e => setTextInputValue(e.target.value)}
                placeholder={pendingTextInput.placeholder}
                className="flex-1 px-3 py-1.5 text-xs focus:outline-none"
                onKeyDown={e => {
                  if (e.key === 'Enter' && textInputValue.trim()) {
                    setPendingTextInput(null)
                    void quickSend(textInputValue.trim())
                  }
                }}
              />
              {pendingTextInput.unit && (
                <span className="px-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 py-1.5">{pendingTextInput.unit}</span>
              )}
            </div>
            <button
              onClick={() => {
                if (!textInputValue.trim()) return
                setPendingTextInput(null)
                void quickSend(textInputValue.trim())
              }}
              disabled={sending || !textInputValue.trim()}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              Confirmer
            </button>
          </div>
        )}
        {pendingChoices && !pendingChoicesMulti && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {pendingChoices.map(c => (
              <button key={c.tag} onClick={() => { setPendingChoices(null); void quickSend(c.tag) }} disabled={sending}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white hover:bg-gray-900 hover:text-white hover:border-gray-900 text-gray-800 transition-all disabled:opacity-40">
                {c.label}
              </button>
            ))}
          </div>
        )}
        {pendingChoices && pendingChoicesMulti && (
          <div className="flex flex-col gap-2 px-1">
            <div className="flex flex-wrap gap-1.5">
              {pendingChoices.map(c => {
                const selected = selectedChoiceTags.has(c.tag)
                return (
                  <button key={c.tag}
                    onClick={() => setSelectedChoiceTags(prev => { const next = new Set(prev); if (next.has(c.tag)) next.delete(c.tag); else next.add(c.tag); return next })}
                    disabled={sending}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all disabled:opacity-40 ${selected ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 bg-white text-gray-800 hover:border-gray-500'}`}>
                    {selected && <span className="mr-1">✓</span>}{c.label}
                  </button>
                )
              })}
            </div>
            {selectedChoiceTags.size > 0 && (
              <button onClick={() => { const tags = Array.from(selectedChoiceTags).join(','); setPendingChoices(null); setPendingChoicesMulti(false); setSelectedChoiceTags(new Set()); void quickSend(tags) }}
                disabled={sending}
                className="self-start px-4 py-1.5 text-xs font-semibold rounded-lg bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-40">
                Confirmer ({selectedChoiceTags.size} article{selectedChoiceTags.size > 1 ? 's' : ''})
              </button>
            )}
          </div>
        )}
        {quickReplies.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {quickReplies.map(r => (
              <button key={r} onClick={() => void quickSend(r)} disabled={sending}
                className="px-3 py-1 text-xs font-medium rounded-full border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-gray-700 transition-colors disabled:opacity-40">
                {r}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder={placeholder} rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none text-gray-800 placeholder-gray-400 max-h-32"
            style={{ fieldSizing: 'content' } as React.CSSProperties} />
          <button onClick={() => void send()} disabled={!input.trim() || sending}
            className="shrink-0 w-7 h-7 bg-black text-white rounded-lg flex items-center justify-center disabled:opacity-30 transition-opacity">
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
