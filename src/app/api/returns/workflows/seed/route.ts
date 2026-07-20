import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const DEFAULT_WORKFLOWS = [
  {
    slug: 'late',
    name: 'En retard',
    description: 'Matériel non rendu à la date prévue',
    is_active: true,
    steps: [
      { id: '1', type: 'action',      title: 'Récupérer la commande',        description: 'fetch_order — identifier les articles non rendus',                              booqable_action: 'fetch_order' },
      { id: '2', type: 'instruction', title: 'Retour manuel dans Booqable',   description: 'Demander à l\'opérateur de retourner les articles dans l\'order d\'origine'   },
      { id: '3', type: 'action',      title: 'Créer la SAV order',           description: 'create_sav_order(customer_id, return_days=30)',                                 booqable_action: 'create_sav_order' },
      { id: '4', type: 'action',      title: 'Ajouter les articles',         description: 'add_sav_line pour chaque article non rendu',                                   booqable_action: 'add_sav_line' },
      { id: '5', type: 'action',      title: 'Tagger la commande',           description: 'add_tag : ["late"]',                                                           booqable_action: 'add_tag' },
      { id: '6', type: 'action',      title: 'Commenter',                    description: 'add_sav_comment avec le détail du retard',                                     booqable_action: 'add_sav_comment' },
      { id: '7', type: 'action',      title: 'Logger le cas',                description: 'log_case(problem_type="manquant")',                                            booqable_action: 'log_case' },
    ],
    prompt: `WORKFLOW : EN RETARD
Le client n'a pas rendu le matériel à la date prévue. Le matériel est toujours chez lui.

Règles :
- Ne pas envoyer d'email automatiquement sauf si l'opérateur le demande explicitement.
- Créer la SAV order avec return_days=30 (délai de relance).
- Tag à utiliser : "late".
- Si certains articles ont été rendus mais pas tous, ne mettre en SAV que les articles non rendus.`,
  },
  {
    slug: 'late_returned',
    name: 'R11-22A – Retard – Régularisé',
    description: 'Tout le matériel a été rendu, avec du retard',
    is_active: true,
    steps: [
      { id: '1784532402923', type: 'instruction', title: 'Identifier la commande return_order',    description: 'Identifier la commande return_order à régulariser (numéro fourni par l\'opérateur)' },
      { id: '1',             type: 'action',      title: 'Récupérer les données de la commande',   description: 'Récupère les détails complets de la commande depuis Booqable.',                       booqable_action: 'fetch_order' },
      { id: '2',             type: 'action',      title: 'Changer la date de retour',              description: '⚠️ Dans Booqable : changer la date de retour de la commande d\'origine par celle du jour' },
      { id: '3',             type: 'action',      title: 'Retourner le matériel',                  description: 'Dans Booqable : retourner tous les articles de la commande'                          },
      { id: '4',             type: 'action',      title: 'Remplacer le tag',                       description: 'add_tag : supprimer R21_OPEN, ajouter R22_WAIVED',                                   booqable_action: 'add_tag' },
      { id: '1784532590048', type: 'action',      title: 'Proposer un brouillon d\'email',         description: 'draft_email template=r11_22a_retard_regularise → présenter le brouillon à l\'opérateur', booqable_action: 'draft_email' },
      { id: '1784532617339', type: 'action',      title: 'Envoyer l\'email validé via Booqable',   description: 'Envoie l\'email après confirmation de l\'opérateur',                                 booqable_action: 'send_email' },
    ],
    prompt: `WORKFLOW : RETARD – RÉGULARISÉ (R11-22A)
Tout le matériel a été rendu, mais avec du retard.
Ce workflow régularise la commande de retour return_order directement.

Règles :
- Ne pas créer de nouvel order.
- Ne pas facturer de pénalités.
- Pour les étapes manuelles (changer la date, retourner le matériel), demander confirmation à l'opérateur avant de continuer.
- Utiliser le template r11_22a_retard_regularise pour le brouillon email.
- Envoyer l'email uniquement après validation explicite de l'opérateur.`,
  },
  {
    slug: 'late_partial',
    name: 'Rendu en retard partiel',
    description: 'Une partie seulement du matériel a été rendue',
    is_active: true,
    steps: [
      { id: '1', type: 'action',      title: 'Récupérer la commande',        description: 'fetch_order — afficher tous les articles',                                     booqable_action: 'fetch_order' },
      { id: '2', type: 'question',    title: 'Identifier les articles',      description: 'Quels articles ont été rendus ? Lesquels sont encore manquants ?'             },
      { id: '3', type: 'instruction', title: 'Retour manuel dans Booqable',   description: 'Retourner dans Booqable uniquement les articles effectivement rendus'         },
      { id: '4', type: 'action',      title: 'Créer la SAV order',           description: 'create_sav_order(customer_id)',                                                booqable_action: 'create_sav_order' },
      { id: '5', type: 'action',      title: 'Ajouter les articles manquants', description: 'add_sav_line uniquement pour les articles ENCORE manquants',                booqable_action: 'add_sav_line' },
      { id: '6', type: 'action',      title: 'Tagger',                       description: 'add_tag : ["late"]',                                                           booqable_action: 'add_tag' },
      { id: '7', type: 'action',      title: 'Commenter',                    description: 'add_sav_comment avec liste rendus vs manquants',                              booqable_action: 'add_sav_comment' },
      { id: '8', type: 'action',      title: 'Logger',                       description: 'log_case(problem_type="manquant")',                                            booqable_action: 'log_case' },
    ],
    prompt: `WORKFLOW : RENDU EN RETARD PARTIEL
Une partie du matériel a été rendue (avec retard), mais certains articles sont encore manquants.

Règles :
- Demander explicitement quels articles ont été rendus et lesquels manquent encore.
- Ne créer des lignes SAV que pour les articles ENCORE manquants (pas ceux rendus).
- Tag à utiliser : "late" (les articles manquants restent en attente).
- Le commentaire SAV doit lister clairement : articles rendus / articles encore manquants.`,
  },
  {
    slug: 'missing',
    name: 'Perte',
    description: 'Matériel perdu ou volé, non rendu',
    is_active: true,
    steps: [
      { id: '1', type: 'action',      title: 'Récupérer la commande',        description: 'fetch_order — identifier les articles perdus',                                 booqable_action: 'fetch_order' },
      { id: '2', type: 'question',    title: 'Assurance & caution',          description: 'Le client a-t-il une assurance ? Y a-t-il une caution active ?'              },
      { id: '3', type: 'instruction', title: 'Retour manuel dans Booqable',   description: 'Retourner les articles dans Booqable pour clore la commande d\'origine'      },
      { id: '4', type: 'action',      title: 'Créer la SAV order',           description: 'create_sav_order(customer_id, full_discount=true)',                            booqable_action: 'create_sav_order' },
      { id: '5', type: 'action',      title: 'Ajouter les articles perdus',  description: 'add_sav_line pour chaque article perdu',                                      booqable_action: 'add_sav_line' },
      { id: '6', type: 'action',      title: 'Tagger',                       description: 'add_tag : ["missing"]',                                                        booqable_action: 'add_tag' },
      { id: '7', type: 'action',      title: 'Commenter',                    description: 'add_sav_comment avec détail de la perte',                                     booqable_action: 'add_sav_comment' },
      { id: '8', type: 'action',      title: 'Logger',                       description: 'log_case(problem_type="manquant", metadata={insurance, caution})',             booqable_action: 'log_case' },
      { id: '9', type: 'action',      title: 'Email client',                 description: 'draft_email template=retour_manquant → proposer envoi',                       booqable_action: 'add_sav_comment' },
    ],
    prompt: `WORKFLOW : PERTE
Le matériel est perdu ou volé. Non rendu, confirmé définitivement perdu.

Règles :
- Toujours demander : assurance souscrite ? caution active ?
- Créer la SAV order avec full_discount=true (le matériel est perdu, pas de caution sur la SAV).
- Tag à utiliser : "missing".
- Email : template retour_manquant (annonce la perte, initie la procédure d'indemnisation).
- Si facturation ensuite : templates facturation_perdu ou facturation_vole selon le cas.`,
  },
  {
    slug: 'damage',
    name: 'Dommage',
    description: 'Matériel endommagé à son retour',
    is_active: true,
    steps: [
      { id: '1', type: 'action',      title: 'Récupérer la commande',        description: 'fetch_order — identifier les articles endommagés',                            booqable_action: 'fetch_order' },
      { id: '2', type: 'question',    title: 'Assurance & caution',          description: 'Le client a-t-il une assurance ? Y a-t-il une caution active ?'             },
      { id: '3', type: 'instruction', title: 'Déterminer le cas',            description: 'Cas 1: assurance+caution / 2: assurance seule / 3: caution seule / 4: aucun' },
      { id: '4', type: 'instruction', title: 'Retour manuel dans Booqable',  description: 'Retourner les articles endommagés dans Booqable'                              },
      { id: '5', type: 'action',      title: 'Créer la SAV order',          description: 'create_sav_order(customer_id)',                                               booqable_action: 'create_sav_order' },
      { id: '6', type: 'action',      title: 'Ajouter les articles',        description: 'add_sav_line avec stock_item_id si trackable',                                booqable_action: 'add_sav_line' },
      { id: '7', type: 'action',      title: 'Tagger',                      description: 'add_tag : ["damage"]',                                                        booqable_action: 'add_tag' },
      { id: '8', type: 'action',      title: 'Commenter',                   description: 'add_sav_comment avec détail + cas (1/2/3/4)',                                 booqable_action: 'add_sav_comment' },
      { id: '9', type: 'action',      title: 'Logger',                      description: 'log_case(problem_type="casse", metadata={insurance, caution, cas})',           booqable_action: 'log_case' },
      { id: '10', type: 'action',     title: 'Email client',                description: 'draft_email template=retour_casse → proposer envoi',                          booqable_action: 'add_sav_comment' },
    ],
    prompt: `WORKFLOW : DOMMAGE
Du matériel a été endommagé à son retour.

Règles :
- Toujours demander : assurance souscrite ? caution active ?
- Déterminer le cas avant de créer la SAV :
  Cas 1 : assurance + caution → franchise appliquée
  Cas 2 : assurance seule → procédure assurance
  Cas 3 : caution seule → prélèvement sur caution
  Cas 4 : aucun → facturation directe
- Tag à utiliser : "damage". Si réparation nécessaire : aussi "TO_BE_REPAIRED".
- Pour les articles trackables (caméras, etc.) : toujours utiliser stock_item_id dans add_sav_line.
- Email initial : template retour_casse. Si facturation : template facturation_casse.`,
  },
]

// ── GET /api/returns/workflows/seed — seed les 5 workflows par défaut ─────────
export async function GET() {
  const supabase = getSupabaseAdmin()

  // Récupérer les slugs existants
  const { data: existing } = await supabase
    .from('return_workflows')
    .select('slug')

  const existingSlugs = new Set((existing || []).map(w => w.slug))
  const toInsert = DEFAULT_WORKFLOWS.filter(w => !existingSlugs.has(w.slug))

  if (toInsert.length === 0) {
    return NextResponse.json({ message: 'Tous les workflows existent déjà', created: 0 })
  }

  const { data, error } = await supabase
    .from('return_workflows')
    .insert(toInsert)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: `${data?.length} workflow(s) créé(s)`, created: data?.length, workflows: data })
}
