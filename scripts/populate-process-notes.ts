/**
 * Script de migration : pré-remplit process_note sur tous les steps de workflows.
 *
 * Usage :
 *   npx ts-node -e "$(cat scripts/populate-process-notes.ts)"
 *   OU
 *   npx ts-node scripts/populate-process-notes.ts
 *
 * Prérequis : .env.local avec NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Charger .env.local manuellement (pas de dépendance dotenv requise)
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

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
  execution?:      'code' | 'ai'
  condition?:      string
  process_note?:   string
}

type Workflow = {
  id:    string
  slug:  string
  name:  string
  steps: WorkflowStep[]
}

// ── Interprétation (copie de process/page.tsx) ────────────────────────────────

const SKIP_ACTIONS = new Set(['send_email', 'search_products'])

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  return String(v)
}

function generateProcessNote(step: WorkflowStep): string | null {
  if (SKIP_ACTIONS.has(step.booqable_action ?? '')) return null
  if (step.type === 'instruction') return null
  if (step.process_note) return null // déjà renseigné, ne pas écraser

  const action = step.booqable_action ?? ''
  const params = step.parameters ?? {}
  const desc   = step.description ?? ''

  if (step.type === 'question') {
    return `Identifie ${step.title.toLowerCase()} dans le dossier ou demande-le au client si nécessaire.`
  }

  switch (action) {
    case 'fetch_order':
      return "Ouvre la commande dans Booqable et relève le numéro, le statut, le client et la liste des articles."

    case 'fetch_order_by_number':
      return "Recherche la commande dans Booqable via son numéro."

    case 'fetch_original_from_field':
      return "Ouvre la commande d'origine en lisant le champ personnalisé « Commande d'origine » de la commande retour."

    case 'fetch_original_amount_HT':
      return "Note le montant HT de la commande d'origine — il servira à calculer l'assurance."

    case 'add_internal_note':
      return desc
        ? `Ajoute une note interne sur la commande avec le contenu suivant : ${desc}`
        : "Ajoute une note interne sur la commande pour tracer l'action avec la date et le contexte."

    case 'add_tag':
      return `Ajoute le tag ${params.tag ? fmtVal(params.tag) : 'approprié'} sur la commande pour l'identifier dans le suivi.`

    case 'create_new_return_order':
      return "Crée une nouvelle commande SAV dans Booqable pour le même client avec remise 100 %, caution à zéro et date de fin au 31 décembre à 23 h 45."

    case 'add_new_product_line':
      return "Ajoute les articles à la commande avec les bons identifiants et quantités."

    case 'add_product_line_by_id': {
      const pid = params.product_group_id ? ` (ID : ${fmtVal(params.product_group_id)})` : ''
      const qty = params.quantity ? `, quantité : ${fmtVal(params.quantity)}` : ''
      return `Ajoute le produit suivant à la commande${pid}${qty}.`
    }

    case 'add_original_order':
    case 'set_original_order':
      return "Dans la commande retour, renseigne le champ « Commande d'origine » avec le numéro de la commande principale."

    case 'add_sav_comment':
      return desc
        ? `Renseigne le commentaire SAV (champ notes_sav) avec le contenu suivant : ${desc}`
        : "Renseigne le commentaire SAV (champ notes_sav) avec les détails du problème constaté."

    case 'add_sav_date':
    case 'set_sav_date':
      return "Renseigne la date d'ouverture du dossier SAV (champ date_sav) avec la date du jour."

    case 'draft_email':
      return params.template_id
        ? `Rédige et envoie l'email au client en t'appuyant sur le modèle « ${fmtVal(params.template_id)} ».`
        : "Rédige et envoie l'email au client."

    case 'log_case':
      return "Enregistre le cas dans le tableau de suivi FilmeAI."

    case 'redirect_url':
      return params.url
        ? `Ouvre le lien suivant dans le navigateur : ${fmtVal(params.url)}`
        : "Ouvre la page indiquée dans le navigateur."

    case 'set_replacement_price':
    case 'add_replacement_price':
      return "Saisis le prix de remplacement HT pour chaque article endommagé ou perdu, article par article."

    case 'apply_replacement_prices':
      return `Applique les prix de remplacement saisis sur la commande retour${params.charge_label ? ` (libellé de ligne : « ${fmtVal(params.charge_label)} »)` : ''}.`

    case 'remove_deposit':
      return "Supprime la caution de la commande."

    case 'remove_discount':
      return "Supprime la remise de la commande."

    case 'remove_other_lines':
      return "Supprime toutes les lignes de la commande sauf l'article sélectionné."

    case 'check_payment_link':
      return "Vérifie s'il existe un lien de paiement actif pour cette commande."

    case 'create_payment_link':
      return "Crée un lien de paiement Stripe et envoie-le au client."

    case 'capture_stripe_deposit':
      return "Procède à l'encaissement de la caution Stripe de la commande."

    case 'check_insurance_request_status':
      return "Vérifie si le client a souscrit l'assurance FILME sur sa commande (résultat : Assuré FILME / Assurance perso / Non renseigné)."

    case 'add_product_insurance_8':
      return "Ajoute la ligne assurance FILME à la commande et fixe son prix à 8 % du montant HT de la commande d'origine."

    case 'read_customer_notes':
      return "Consulte les commentaires et notes du client dans sa fiche Booqable."

    case 'read_delivery_options':
      return "Consulte les options de livraison disponibles pour cette commande."

    default:
      if (!action) return null
      return desc || `Exécute l'action « ${action} ».`
  }
}

// ── Migration ─────────────────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌  Variables NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY manquantes dans .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('id, slug, name, steps')

  if (error) {
    console.error('❌  Erreur Supabase :', error.message)
    process.exit(1)
  }

  let updated = 0
  let skipped = 0

  for (const wf of (workflows as Workflow[]) ?? []) {
    const steps: WorkflowStep[] = wf.steps || []
    let changed = false

    const newSteps = steps.map(step => {
      const note = generateProcessNote(step)
      if (!note) return step
      changed = true
      return { ...step, process_note: note }
    })

    if (!changed) {
      skipped++
      continue
    }

    const { error: updateError } = await supabase
      .from('workflows')
      .update({ steps: newSteps })
      .eq('id', wf.id)

    if (updateError) {
      console.error(`❌  Erreur sur ${wf.slug} :`, updateError.message)
    } else {
      console.log(`✅  ${wf.slug} — ${wf.name}`)
      updated++
    }
  }

  console.log(`\nTerminé : ${updated} workflow(s) mis à jour, ${skipped} ignoré(s).`)
}

main().catch(err => {
  console.error('Erreur inattendue :', err)
  process.exit(1)
})
