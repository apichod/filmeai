'use client'

import { useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderContext = 'parent' | 'original' | 'return' | 'child'

type WorkflowStep = {
  id:              string
  type:            'action' | 'question' | 'check' | 'instruction'
  title:           string
  description?:    string
  booqable_action?: string
  parameters?:     Record<string, unknown>
  order_context?:  OrderContext
  input_context?:  OrderContext
  execution?:      'code' | 'ai'
  condition?:      string
}

type ReturnWorkflow = {
  id:              string
  slug:            string
  name:            string
  chat_label:      string | null
  description:     string
  steps:           WorkflowStep[]
  is_active:       boolean
  category?:       string
  parent_category?: string | null
}

type OldProcess = {
  id:           string
  title:        string
  workflow_slug?: string | null
}

// ── Contexte commande ─────────────────────────────────────────────────────────

const CTX_LABELS: Record<string, string> = {
  parent:   'Commande principale',
  original: 'Commande originale',
  return:   'Commande retour',
  child:    'Commande enfant',
}

const CTX_ICONS: Record<string, string> = {
  parent:   'ti-building-store',
  original: 'ti-file-invoice',
  return:   'ti-refresh',
  child:    'ti-git-branch',
  client:   'ti-user',
  email:    'ti-mail',
}

// ── Actions à masquer ─────────────────────────────────────────────────────────

const SKIP_ACTIONS = new Set(['send_email', 'search_products'])

// ── Interprétation humaine des actions ───────────────────────────────────────

type Interp = {
  title:          string
  instruction:    string
  details:        { key: string; val: string }[]
  ctxLabel?:      string   // override du label contexte
  ctxIcon?:       string   // override de l'icône contexte
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  return String(v)
}

function interpretStep(step: WorkflowStep): Interp | null {
  const action = step.booqable_action ?? ''
  const params = step.parameters ?? {}
  const desc   = step.description ?? ''

  if (SKIP_ACTIONS.has(action)) return null

  // ── Questions (identification) ─────────────────────────────────────────────
  if (step.type === 'question') {
    return {
      title:       step.title,
      instruction: `Identifie ${step.title.toLowerCase()} dans le dossier ou demande-le au client si nécessaire.`,
      details:     [],
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  switch (action) {

    case 'fetch_order':
      return {
        title:       step.title || 'Ouvrir la commande',
        instruction: 'Ouvre la commande dans Booqable et relève le numéro, le statut, le client et la liste des articles.',
        details:     [{ key: 'À noter', val: 'Numéro, statut, nom du client, articles loués' }],
      }

    case 'fetch_order_by_number':
      return {
        title:       step.title || 'Rechercher la commande',
        instruction: 'Recherche la commande dans Booqable via son numéro.',
        details:     [],
      }

    case 'fetch_original_from_field':
      return {
        title:       step.title || 'Ouvrir la commande d\'origine',
        instruction: 'Ouvre la commande d\'origine en lisant le champ personnalisé « Commande d\'origine » de la commande retour.',
        details:     [{ key: 'Champ Booqable', val: 'order_sav' }],
      }

    case 'fetch_original_amount_HT':
      return {
        title:       step.title || 'Relever le montant HT',
        instruction: 'Note le montant HT de la commande d\'origine — il servira à calculer l\'assurance.',
        details:     [],
      }

    case 'add_internal_note':
      return {
        title:       step.title || 'Ajouter une note interne',
        instruction: desc
          ? `Ajoute une note interne sur la commande avec le contenu suivant :`
          : 'Ajoute une note interne sur la commande pour tracer l\'action avec la date et le contexte.',
        details: desc ? [{ key: 'Contenu', val: desc }] : [],
      }

    case 'add_tag':
      return {
        title:       step.title || 'Ajouter un tag',
        instruction: 'Ajoute le tag ci-dessous sur la commande pour l\'identifier dans le suivi.',
        details:     params.tag ? [{ key: 'Tag', val: fmtVal(params.tag) }] : [],
      }

    case 'create_new_return_order':
      return {
        title:       step.title || 'Créer la commande retour',
        instruction: 'Crée une nouvelle commande SAV dans Booqable pour le même client avec les paramètres suivants :',
        details:     [
          { key: 'Remise',     val: '100 %' },
          { key: 'Caution',    val: 'Aucune' },
          { key: 'Date de fin', val: '31 décembre à 23 h 45' },
        ],
        ctxLabel: 'Commande retour',
        ctxIcon:  'ti-refresh',
      }

    case 'add_new_product_line':
      return {
        title:       step.title || 'Ajouter des articles',
        instruction: 'Ajoute les articles à la commande avec les bons identifiants et quantités.',
        details:     [],
      }

    case 'add_product_line_by_id':
      return {
        title:       step.title || 'Ajouter un produit',
        instruction: 'Ajoute le produit suivant à la commande.',
        details: [
          ...(params.product_group_id ? [{ key: 'ID produit', val: fmtVal(params.product_group_id) }] : []),
          ...(params.quantity          ? [{ key: 'Quantité',   val: fmtVal(params.quantity) }]          : []),
        ],
      }

    case 'add_original_order':
    case 'set_original_order':
      return {
        title:       step.title || 'Renseigner la commande d\'origine',
        instruction: 'Dans la commande retour, renseigne le champ « Commande d\'origine » avec le numéro de la commande principale.',
        details:     [{ key: 'Champ Booqable', val: 'order_sav' }],
      }

    case 'add_sav_comment':
      return {
        title:       step.title || 'Ajouter un commentaire SAV',
        instruction: desc
          ? `Renseigne le commentaire SAV avec le contenu suivant :`
          : 'Renseigne le commentaire SAV avec les détails du problème constaté.',
        details: [
          ...(desc ? [{ key: 'Contenu', val: desc }] : []),
          { key: 'Champ Booqable', val: 'notes_sav' },
        ],
      }

    case 'add_sav_date':
    case 'set_sav_date':
      return {
        title:       step.title || 'Renseigner la date SAV',
        instruction: 'Renseigne la date d\'ouverture du dossier SAV avec la date du jour.',
        details:     [{ key: 'Champ Booqable', val: 'date_sav' }],
      }

    case 'draft_email':
      return {
        title:       step.title || 'Envoyer l\'email client',
        instruction: 'Rédige et envoie l\'email au client en t\'appuyant sur le modèle ci-dessous.',
        details:     params.template_id ? [{ key: 'Modèle email', val: fmtVal(params.template_id) }] : [],
        ctxLabel:    'Client',
        ctxIcon:     'ti-mail',
      }

    case 'log_case':
      return {
        title:       step.title || 'Logger le cas',
        instruction: 'Enregistre le cas dans le tableau de suivi FilmeAI.',
        details:     params.problem_type ? [{ key: 'Type de problème', val: fmtVal(params.problem_type) }] : [],
      }

    case 'redirect_url':
      return {
        title:       step.title || 'Ouvrir la page',
        instruction: 'Ouvre le lien suivant dans le navigateur.',
        details:     params.url ? [{ key: 'URL', val: fmtVal(params.url) }] : [],
        ctxLabel:    'Navigation',
        ctxIcon:     'ti-external-link',
      }

    case 'set_replacement_price':
    case 'add_replacement_price':
      return {
        title:       step.title || 'Saisir les prix de remplacement',
        instruction: 'Saisis le prix de remplacement HT pour chaque article endommagé ou perdu, article par article.',
        details:     [],
      }

    case 'apply_replacement_prices':
      return {
        title:       step.title || 'Appliquer les prix de remplacement',
        instruction: 'Applique les prix de remplacement saisis sur la commande retour.',
        details:     params.charge_label ? [{ key: 'Libellé de la ligne', val: fmtVal(params.charge_label) }] : [],
      }

    case 'remove_deposit':
      return {
        title:       step.title || 'Supprimer la caution',
        instruction: 'Supprime la caution de la commande.',
        details:     [],
      }

    case 'remove_discount':
      return {
        title:       step.title || 'Supprimer la remise',
        instruction: 'Supprime la remise de la commande.',
        details:     [],
      }

    case 'remove_other_lines':
      return {
        title:       step.title || 'Supprimer les autres articles',
        instruction: 'Supprime toutes les lignes de la commande sauf l\'article sélectionné.',
        details:     [],
      }

    case 'check_payment_link':
      return {
        title:       step.title || 'Vérifier le lien de paiement',
        instruction: 'Vérifie s\'il existe un lien de paiement actif pour cette commande.',
        details:     [],
      }

    case 'create_payment_link':
      return {
        title:       step.title || 'Créer un lien de paiement',
        instruction: 'Crée un lien de paiement Stripe et envoie-le au client.',
        details:     [],
        ctxLabel:    'Client',
        ctxIcon:     'ti-credit-card',
      }

    case 'capture_stripe_deposit':
      return {
        title:       step.title || 'Encaisser la caution',
        instruction: 'Procède à l\'encaissement de la caution Stripe de la commande.',
        details:     [],
      }

    case 'check_insurance_request_status':
      return {
        title:       step.title || 'Vérifier le statut assurance',
        instruction: 'Vérifie si le client a souscrit l\'assurance FILME sur sa commande.',
        details:     [{ key: 'Résultat possible', val: 'Assuré FILME / Assurance perso / Non renseigné' }],
      }

    case 'add_product_insurance_8':
      return {
        title:       step.title || 'Ajouter l\'assurance FILME',
        instruction: 'Ajoute la ligne assurance FILME à la commande et fixe son prix à 8 % du montant HT de la commande d\'origine.',
        details:     [],
      }

    case 'read_customer_notes':
      return {
        title:       step.title || 'Consulter les notes client',
        instruction: 'Consulte les commentaires et notes du client dans sa fiche Booqable.',
        details:     [],
        ctxLabel:    'Client',
        ctxIcon:     'ti-user',
      }

    case 'read_delivery_options':
      return {
        title:       step.title || 'Consulter les options de livraison',
        instruction: 'Consulte les options de livraison disponibles pour cette commande.',
        details:     [],
      }

    default:
      // Fallback générique pour les actions inconnues
      if (!action) return null
      return {
        title:       step.title || action,
        instruction: desc || `Exécute l'action "${action}".`,
        details:     Object.entries(params).map(([k, v]) => ({ key: k, val: fmtVal(v) })),
      }
  }
}

// ── Formatage de la condition ─────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  grand_total_euros:         'montant total',
  insurance:                 'assurance',
  authorisation_card:        'autorisation carte',
  status:                    'statut',
  tags:                      'tags',
  customer_email:            'email client',
  security_deposit:          'caution',
  notes_sav:                 'commentaire SAV',
  order_sav:                 'commande d\'origine',
}

const CTX_COND_LABELS: Record<string, string> = {
  parent:   'commande principale',
  return:   'commande retour',
  original: 'commande originale',
  child:    'commande enfant',
}

function formatCondition(raw: string): string {
  return raw
    .replace(/(parent|return|original|child)\.(\w+)/g, (_m: string, ctx: string, field: string) => {
      const ctxL   = CTX_COND_LABELS[ctx]   ?? ctx
      const fieldL = FIELD_LABELS[field]     ?? field.replace(/_/g, ' ')
      return `${fieldL} (${ctxL})`
    })
    .replace(/\s*AND\s*/g,       ' et ')
    .replace(/\s*OR\s*/g,        ' ou ')
    .replace(/==\s*'true'/g,     '= oui')
    .replace(/==\s*'false'/g,    '= non')
    .replace(/==\s*'([^']+)'/g,  '= $1')
    .replace(/!=\s*'([^']+)'/g,  '≠ $1')
    .replace(/<=/g,              '≤')
    .replace(/>=/g,              '≥')
    .replace(/'([^']+)'/g,       '$1')
    .trim()
}

// ── Composant ProcessFlow ─────────────────────────────────────────────────────

function ProcessFlow({ workflow }: { workflow: ReturnWorkflow }) {
  const steps = workflow.steps || []

  // Construire la liste des étapes affichables
  const displayed: { step: WorkflowStep; interp: Interp; num: number }[] = []
  let num = 0

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (s.type === 'instruction') continue
    if (s.type === 'action' && SKIP_ACTIONS.has(s.booqable_action ?? '')) continue

    const interp = interpretStep(s)
    if (!interp) continue

    num++
    displayed.push({ step: s, interp, num })
  }

  if (displayed.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-16">
        Aucune étape à afficher pour ce workflow.
      </div>
    )
  }

  return (
    <div className="flex flex-col max-w-[500px] mx-auto">
      {displayed.map(({ step, interp, num: n }, idx) => {
        // Déterminer le contexte commande
        const ctxKey   = step.order_context ?? 'parent'
        const ctxLabel = interp.ctxLabel ?? CTX_LABELS[ctxKey] ?? 'Commande principale'
        const ctxIcon  = interp.ctxIcon  ?? CTX_ICONS[ctxKey]  ?? 'ti-building-store'
        const cond     = step.condition ? formatCondition(step.condition) : null

        return (
          <div key={step.id}>
            {idx > 0 && (
              <div className="w-px h-3 bg-gray-200 mx-auto" />
            )}

            {/* Étape bleue */}
            <div className="bg-[#e8f0fe] border border-[#c5d3f5] rounded-xl px-4 py-3 flex items-start gap-3">
              <div className="min-w-[26px] h-[26px] rounded-full bg-[#4a86e8] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {n}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium text-gray-900 leading-snug mb-1.5">
                  {interp.title}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#1a4fa8]">
                  <i className={`ti ${ctxIcon}`} aria-hidden="true" style={{ fontSize: 13 }} />
                  <span>Contexte : {ctxLabel}</span>
                </div>
              </div>
            </div>

            {/* Connecteur */}
            <div className="w-px h-0.5 bg-gray-200 mx-auto" />

            {/* Carré blanc — instructions */}
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-[13px] text-gray-900 leading-relaxed mb-2">
                {interp.instruction}
              </p>
              {interp.details.length > 0 && (
                <div className="border-t border-gray-100 pt-2 space-y-1">
                  {interp.details.map((d, di) => (
                    <div key={di} className="flex items-baseline gap-3">
                      <span className="text-[11px] text-gray-400 min-w-[120px] flex-shrink-0">
                        {d.key}
                      </span>
                      <span className="text-[12px] text-gray-700">{d.val}</span>
                    </div>
                  ))}
                </div>
              )}
              {cond && (
                <div className="mt-2.5 flex items-start gap-1.5 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
                  <i className="ti ti-filter flex-shrink-0" aria-hidden="true" style={{ fontSize: 12, marginTop: 1 }} />
                  <span><strong>Seulement si</strong> : {cond}</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  retours:        'Retours',
  planning:       'Planning',
  'sous-location': 'Sous-location',
}

const CATEGORY_ORDER = ['retours', 'planning', 'sous-location']

// ── Page principale ───────────────────────────────────────────────────────────

export default function ProcessPage() {
  const [workflows, setWorkflows]   = useState<ReturnWorkflow[]>([])
  const [oldProcs, setOldProcs]     = useState<OldProcess[]>([])
  const [selectedSlug, setSelected] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [deleting, setDeleting]     = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/returns/workflows').then(r => r.json()) as Promise<{ workflows?: ReturnWorkflow[] }>,
      fetch('/api/processes').then(r => r.json())         as Promise<{ processes?: OldProcess[] }>,
    ]).then(([wd, pd]) => {
      const wfs  = (wd.workflows || []).filter(w => w.is_active)
      const prcs = pd.processes || []
      setWorkflows(wfs)
      setOldProcs(prcs)
      if (wfs.length > 0) setSelected(wfs[0].slug)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const selectedWorkflow = workflows.find(w => w.slug === selectedSlug)

  // Grouper par catégorie → parent_category
  const grouped: Record<string, Record<string, ReturnWorkflow[]>> = {}
  for (const wf of workflows) {
    const cat    = wf.category ?? 'retours'
    const parent = wf.parent_category ?? ''
    if (!grouped[cat])        grouped[cat]        = {}
    if (!grouped[cat][parent]) grouped[cat][parent] = []
    grouped[cat][parent].push(wf)
  }

  const deleteOldProc = async (id: string) => {
    setDeleting(id)
    await fetch('/api/processes', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    })
    setOldProcs(prev => prev.filter(p => p.id !== id))
    setDeleting(null)
  }

  if (loading) {
    return <div className="text-sm text-gray-400 py-12 text-center">Chargement…</div>
  }

  return (
    <div className="flex gap-0 min-h-[600px] border border-gray-200 rounded-xl overflow-hidden">

      {/* ── Sidebar ── */}
      <div className="w-52 flex-shrink-0 border-r border-gray-100 overflow-y-auto max-h-[calc(100vh-120px)] bg-gray-50 py-2">

        {CATEGORY_ORDER.filter(cat => grouped[cat]).map(cat => (
          <div key={cat} className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-3 pt-3 pb-1">
              {CATEGORY_LABELS[cat] ?? cat}
            </p>
            {Object.entries(grouped[cat]).map(([parent, wfs]) => (
              <div key={parent}>
                {parent && (
                  <div className="flex items-center gap-1 px-3 py-1">
                    <i className="ti ti-chevron-right text-gray-400" aria-hidden="true" style={{ fontSize: 10 }} />
                    <span className="text-[11px] font-medium text-gray-500">{parent}</span>
                  </div>
                )}
                {wfs.map(wf => (
                  <button
                    key={wf.slug}
                    onClick={() => setSelected(wf.slug)}
                    className={`w-full text-left py-1.5 text-[12.5px] leading-snug transition-colors ${
                      parent ? 'px-5 pl-7' : 'px-3'
                    } ${
                      selectedSlug === wf.slug
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-white hover:text-gray-900'
                    }`}
                  >
                    {wf.chat_label || wf.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* Process archivés (sans workflow actif correspondant) */}
        {oldProcs.length > 0 && (
          <div className="border-t border-gray-200 mt-2 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-3 pb-1">
              Archivés
            </p>
            {oldProcs.map(p => (
              <div key={p.id} className="flex items-center justify-between px-3 py-1.5 group">
                <span className="text-[11.5px] text-gray-400 line-through leading-tight truncate flex-1 mr-2">
                  {p.title}
                </span>
                <button
                  onClick={() => deleteOldProc(p.id)}
                  disabled={deleting === p.id}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity disabled:opacity-30 flex-shrink-0"
                  title="Supprimer définitivement"
                >
                  <i className="ti ti-trash" aria-hidden="true" style={{ fontSize: 14 }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Zone principale ── */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-white p-6">
        {selectedWorkflow ? (
          <>
            {/* En-tête */}
            <div className="mb-7">
              <div className="flex items-baseline gap-2 text-[11px] text-gray-400 mb-1.5">
                <span>
                  {CATEGORY_LABELS[selectedWorkflow.category ?? 'retours'] ?? selectedWorkflow.category}
                  {selectedWorkflow.parent_category && (
                    <> › {selectedWorkflow.parent_category}</>
                  )}
                </span>
                <span className="text-gray-300">·</span>
                <span className="font-mono text-[10px]">{selectedWorkflow.slug}</span>
              </div>
              <h2 className="text-[17px] font-semibold text-gray-900 leading-tight">
                {selectedWorkflow.chat_label || selectedWorkflow.name}
              </h2>
              {selectedWorkflow.description && (
                <p className="text-[12.5px] text-gray-500 mt-1.5 max-w-lg leading-relaxed">
                  {selectedWorkflow.description}
                </p>
              )}
            </div>

            <ProcessFlow workflow={selectedWorkflow} />
          </>
        ) : (
          <p className="text-sm text-gray-400 py-12 text-center">
            Sélectionne un workflow dans la liste.
          </p>
        )}
      </div>
    </div>
  )
}
