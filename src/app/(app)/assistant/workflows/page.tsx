'use client'

import { useEffect, useRef, useState } from 'react'

const BOOQABLE_TOOLS = [
  { value: 'add_new_product_line',               label: 'add_new_product_line — ajouter les articles sélectionnés (produit ou custom si sans ID)' },
  { value: 'add_product_line_by_id',             label: 'add_product_line_by_id — ajouter un produit fixe via son product_group_id (paramètre JSON)' },
  { value: 'add_product_insurance_8',            label: 'add_product_insurance_8 — ajouter l\'assurance FILME à 8% du montant HT (grand_total_euros_HT)' },
  { value: 'add_sav_comment',                    label: 'add_sav_comment — commentaire SAV' },
  { value: 'add_tag',                            label: 'add_tag — ajouter / supprimer des tags' },
  { value: 'cancel_order',                       label: 'cancel_order — annuler la commande' },
  { value: 'capture_stripe_deposit',             label: 'capture_stripe_deposit — débiter l\'autorisation bancaire Stripe (caution)' },
  { value: 'check_deposit',                      label: 'check_deposit — vérifier la caution (dépôt physique + autorisation carte)' },
  { value: 'check_insurance',                    label: 'check_insurance — vérifier si l\'assurance est prise sur la commande' },
  { value: 'check_insurance_request_status',     label: 'check_insurance_request_status — vérifier si l\'assurance a été demandée par le locataire' },
  { value: 'read_customer_notes',                label: 'read_customer_notes — lire et afficher les commentaires clients (champ commentaire)' },
  { value: 'read_delivery_options',              label: 'read_delivery_options — lire et afficher les options de livraison (champ date_et_heure_livraison_si_applicable)' },
  { value: 'choose_article',                     label: 'choose_article — sélectionner les articles de la commande' },
  { value: 'choose_problem_tag',                 label: 'choose_problem_tag — afficher boutons choix de tag (retard/perte/vol/dommage)' },
  { value: 'clear_tags',                         label: 'clear_tags — supprimer tous les tags' },
  { value: 'create_new_return_order',            label: 'create_new_return_order — créer la commande de retour' },
  { value: 'create_payment_link',                label: 'create_payment_link — créer un lien de paiement et le stocker dans lien_paiement' },
  { value: 'draft_email_ia',                     label: 'draft_email_ia — préparer l\'email client (IA)' },
  { value: 'draft_email_booqable',               label: 'draft_email_booqable — aperçu template Booqable (lecture seule)' },
  { value: 'draft_email_with_invoice_booqable',  label: 'draft_email_with_invoice_booqable — aperçu template + facture jointe' },
  { value: 'draft_email_with_quote_booqable',    label: 'draft_email_with_quote_booqable — aperçu template + devis joint' },
  { value: 'duplicate_order',                    label: 'duplicate_order — dupliquer la commande' },
  { value: 'fetch_order',                        label: 'fetch_order — récupérer la commande' },
  { value: 'fetch_order_amount',                 label: 'fetch_order_amount — récupérer le montant total TTC de la commande' },
  { value: 'calculate_customer_score',            label: 'calculate_customer_score — calculer le score client et proposer une remise' },
  { value: 'fetch_original_amount_HT',           label: 'fetch_original_amount_HT — récupérer uniquement le montant HT de la commande' },
  { value: 'round_deposit',                      label: 'round_deposit — arrondir la caution à la centaine la plus proche' },
  { value: 'fetch_original_from_field',          label: 'fetch_original_from_field — lire la commande originale depuis un champ custom (ex: order_sav)' },
  { value: 'finalize_invoice',                   label: 'finalize_invoice — finaliser la facture de la commande' },
  { value: 'finalize_quote',                     label: 'finalize_quote — créer le devis de la commande' },
  { value: 'list_order',                         label: 'list_order — lister les articles de la commande dans le chat' },
  { value: 'log_case',                           label: 'log_case — logger le cas FilmeAI' },
  { value: 'create_delivery_event',               label: 'create_delivery_event — créer un événement livraison dans le calendrier location@filme.fr (IA)' },
  { value: 'add_discount_with_input_field',       label: 'add_discount_with_input_field — saisir une remise % manuellement (champ de saisie)' },
  { value: 'add_discount',                       label: 'add_discount — appliquer une remise % sur la commande (lit discount_proposal)' },
  { value: 'remove_discount',                    label: 'remove_discount — supprimer la remise de la commande' },
  { value: 'remove_deposit',                    label: 'remove_deposit — supprimer la caution de la commande' },
  { value: 'remove_other_lines',                 label: 'remove_other_lines — supprimer toutes les lignes sauf l\'article choisi' },
  { value: 'remove_product_line',                label: 'remove_product_line — supprimer une ligne de la commande' },
  { value: 'reserve_order',                      label: 'reserve_order — réserver la commande (concept → reserved)' },
  { value: 'revert_to_concept',                  label: 'revert_to_concept — repasser en draft (concept)' },
  { value: 'search_products',                    label: 'search_products — identifier les articles (bulk/trackable/custom)' },
  { value: 'send_email_ia',                      label: 'send_email_ia — envoyer l\'email (IA)' },
  { value: 'send_email_booqable',                label: 'send_email_booqable — envoyer via template Booqable (document_id)' },
  { value: 'send_email_with_invoice_booqable',   label: 'send_email_with_invoice_booqable — envoyer email avec facture en pièce jointe' },
  { value: 'send_email_with_quote_booqable',     label: 'send_email_with_quote_booqable — envoyer email avec devis en pièce jointe' },
  { value: 'set_original_order',                 label: 'set_original_order — renseigner la commande d\'origine (original_order)' },
  { value: 'set_replacement_price',              label: 'set_replacement_price — fixer le prix de remplacement d\'une ligne' },
  { value: 'set_sav_date',                       label: 'set_sav_date — inscrire la date du jour dans le champ date_sav' },
  { value: 'start_order',                        label: 'start_order — démarrer la commande (pickup)' },
  { value: 'stop_order',                         label: 'stop_order — retourner le matériel (started → stopped)' },
  { value: 'update_return_date',                 label: 'update_return_date — changer la date de retour à aujourd\'hui' },
]

// ── Types ──────────────────────────────────────────────────────────────────────

type WorkflowStep = {
  id: string
  type: 'action' | 'question' | 'instruction' | 'check'
  title: string
  description: string
  booqable_action?: string
  parameters?: Record<string, unknown>
  input_context?:  'parent' | 'child' | 'original' | 'return'
  order_context?:  'parent' | 'child' | 'original' | 'return'
  output_context?: 'parent' | 'child' | 'original' | 'return'
  execution?: 'code' | 'ai'
  variable?: string
  condition?: string
}

// ── Registre I/O des outils (pour affichage éditeur) ──────────────────────────
// reads  : champs lus depuis vars[order_context.*]
// writes : champs écrits dans vars[output_context.*]
// outputCtx : contexte d'écriture fixe (si différent de order_context)

type ToolIO = { reads: string[]; writes: string[]; outputCtx?: string }

/** Outils qui ne ciblent pas une commande existante (pas de target order) */
const NO_TARGET_ORDER = new Set(['create_new_return_order'])

const TOOL_IO: Record<string, ToolIO> = {
  fetch_order:                  { reads: ['id'],  writes: ['id', 'number', 'status', 'customer_id', 'tags', 'lines'] },
  fetch_original_from_field:    { reads: ['id'],  writes: ['id'] },
  duplicate_order:         { reads: ['id'],           writes: ['id', 'number'], outputCtx: 'child' },
  revert_to_concept:       { reads: ['id'],           writes: [] },
  clear_tags:              { reads: ['id'],           writes: [] },
  add_tag:                 { reads: ['id'],           writes: [] },
  choose_article:          { reads: ['lines'],         writes: ['selected_ids', 'chosen_lines'] },
  add_new_product_line:    { reads: ['selected_ids', 'chosen_lines'],  writes: ['kept_product_names'] },
  remove_other_lines:      { reads: ['lines', 'selected_ids'], writes: [] },
  choose_problem_tag:      { reads: ['id'],           writes: ['sav_tag'] },
  reserve_order:           { reads: ['id'],           writes: [] },
  start_order:             { reads: ['id'],           writes: [] },
  stop_order:              { reads: ['id'],           writes: [] },
  cancel_order:            { reads: ['id'],           writes: [] },
  update_return_date:      { reads: ['id'],           writes: [] },
  list_order:              { reads: ['lines'],         writes: [] },
  remove_product_line:     { reads: [],               writes: [] },
  add_sav_comment:         { reads: ['id', 'number', 'kept_product_names'], writes: [] },
  create_new_return_order: { reads: ['customer_id'],  writes: ['id', 'number'], outputCtx: 'return' },
  zero_out_order_lines:    { reads: ['id'],           writes: [] },
  set_sav_date:            { reads: ['id'],            writes: [] },
  set_original_order:      { reads: ['number'],       writes: [] },   // input_context.number → order_context (return)
  add_internal_note:       { reads: ['id'],           writes: [] },
  draft_email:             { reads: [],               writes: ['subject', 'body'] },
  send_email:              { reads: ['subject', 'body'], writes: [] },
  draft_email_booqable:    { reads: ['id'], writes: ['active_document_id'] },
  send_email_booqable:     { reads: ['id', 'customer_id', 'customer_email', 'active_document_id'], writes: [] },
  add_product_line_by_id:           { reads: ['id'],                              writes: [] },
  add_product_insurance_8:          { reads: ['id', 'grand_total_euros_HT'],      writes: [] },
  check_insurance:                  { reads: ['id', 'lines'], writes: ['insurance'] },
  check_insurance_request_status:   { reads: ['id'],          writes: ['insurance_request_status'] },
  read_customer_notes:              { reads: ['id'],          writes: ['customer_notes'] },
  read_delivery_options:            { reads: ['id'],          writes: ['delivery_options'] },
  check_deposit:                    { reads: ['id'],          writes: ['security_deposit', 'authorisation_card', 'payment_authorization_id', 'provider_id'] },
  create_delivery_event:         { reads: ['delivery_options', 'number'], writes: [] },
  add_discount_with_input_field: { reads: [],    writes: ['discount_proposal'] },
  add_discount:            { reads: ['id', 'discount_proposal'], writes: [] },
  remove_discount:         { reads: ['id'],              writes: [] },
  remove_deposit:         { reads: ['id'],              writes: [] },
  finalize_invoice:                   { reads: ['id'], writes: ['document_id', 'invoice_number'] },
  finalize_quote:                     { reads: ['id'], writes: ['document_id', 'quote_number'] },
  draft_email_with_invoice_booqable:  { reads: ['id', 'document_id'], writes: ['active_document_id'] },
  draft_email_with_quote_booqable:    { reads: ['id', 'document_id'], writes: ['active_document_id'] },
  send_email_with_invoice_booqable:   { reads: ['id', 'customer_id', 'customer_email', 'active_document_id', 'document_id'], writes: [] },
  send_email_with_quote_booqable:     { reads: ['id', 'customer_id', 'customer_email', 'active_document_id', 'document_id'], writes: [] },
  set_replacement_price:    { reads: ['id', 'lines'],    writes: ['kept_product_names'] },
  fetch_order_amount:           { reads: ['id'], writes: ['grand_total_euros', 'deposit_euros'] },
  ask_yes_no:                   { reads: [], writes: ['<output_var>'] },
  calculate_customer_score:     { reads: ['customer_id'], writes: ['discount_proposal', 'customer_score'] },
  fetch_original_amount_HT:     { reads: ['id'], writes: ['grand_total_euros_HT'] },
  round_deposit:                { reads: ['security_deposit'], writes: ['security_deposit_rounded'] },
  create_payment_link:       { reads: ['id', 'grand_total_euros'],                   writes: ['payment_charge_id', 'checkout_url'] },
  capture_stripe_deposit:    { reads: ['provider_id', 'grand_total_euros', 'number'], writes: ['stripe_charge_id', 'payment_charge_id', 'captured_amount'] },
}

/** Exécution par défaut selon l'outil — 'code' = API directe, 'ai' = LLM requis */
const TOOL_DEFAULT_EXECUTION: Record<string, 'code' | 'ai'> = {
  fetch_order:                 'code',
  fetch_original_from_field:   'code',
  duplicate_order:             'code',
  revert_to_concept:       'code',
  clear_tags:              'code',
  add_tag:                 'code',
  ask_yes_no:              'code',
  choose_article:          'code',
  remove_other_lines:      'code',
  choose_problem_tag:      'code',
  reserve_order:           'code',
  start_order:             'code',
  stop_order:              'code',
  cancel_order:            'code',
  update_return_date:      'code',
  list_order:              'code',
  remove_product_line:     'code',
  add_sav_comment:         'code',
  create_new_return_order: 'code',
  zero_out_order_lines:    'code',
  set_sav_date:            'code',
  set_original_order:      'code',
  add_internal_note:       'ai',
  draft_email:             'code',
  send_email:              'code',
  add_product_line_by_id:          'code',
  add_product_insurance_8:         'code',
  check_insurance:                 'code',
  check_insurance_request_status:  'code',
  read_customer_notes:             'code',
  read_delivery_options:           'code',
  check_deposit:                   'code',
  add_discount_with_input_field:   'code',
  add_discount:                    'code',
  remove_discount:                 'code',
  remove_deposit:                  'code',
  finalize_invoice:                  'code',
  finalize_quote:                    'code',
  draft_email_with_invoice_booqable: 'code',
  draft_email_with_quote_booqable:   'code',
  send_email_with_invoice_booqable:  'code',
  send_email_with_quote_booqable:    'code',
  set_replacement_price:             'ai',
  calculate_customer_score:          'code',
  fetch_order_amount:                'code',
  fetch_original_amount_HT:          'code',
  round_deposit:                     'code',
  create_payment_link:               'code',
  capture_stripe_deposit:            'code',
}

/** Compatibilité d'exécution par outil */
type ToolCompat = 'code' | 'ai' | 'both'
const TOOL_COMPAT: Record<string, ToolCompat> = {
  fetch_order:                 'code',
  fetch_original_from_field:   'code',
  search_products:             'ai',
  add_internal_note:       'ai',
  create_new_return_order: 'code',
  add_new_product_line:    'both',
  add_product_line_by_id:  'code',
  add_product_insurance_8: 'code',
  set_sav_date:            'code',
  set_original_order:      'code',
  clear_tags:              'code',
  revert_to_concept:       'code',
  cancel_order:            'code',
  remove_product_line:     'code',
  reserve_order:           'code',
  start_order:             'code',
  update_return_date:      'code',
  list_order:              'code',
  stop_order:              'code',
  add_tag:                 'both',
  add_sav_comment:         'both',
  duplicate_order:         'code',
  ask_yes_no:              'code',
  choose_article:          'both',
  remove_other_lines:      'code',
  choose_problem_tag:      'both',
  draft_email:             'both',
  zero_out_order_lines:    'code',
  send_email:              'both',
  draft_email_booqable:    'code',
  send_email_booqable:     'code',
  log_case:                'ai',
  check_insurance:                 'code',
  check_insurance_request_status:  'code',
  read_customer_notes:             'code',
  read_delivery_options:           'code',
  check_deposit:                   'code',
  add_discount_with_input_field:   'code',
  add_discount:                    'code',
  remove_discount:                 'code',
  remove_deposit:                  'code',
  finalize_invoice:                  'code',
  finalize_quote:                    'code',
  draft_email_with_invoice_booqable: 'code',
  draft_email_with_quote_booqable:   'code',
  send_email_with_invoice_booqable:  'code',
  send_email_with_quote_booqable:    'code',
  set_replacement_price:             'ai',
  calculate_customer_score:          'code',
  fetch_order_amount:                'code',
  fetch_original_amount_HT:          'code',
  round_deposit:                     'code',
  create_payment_link:               'code',
  capture_stripe_deposit:            'code',
}

/** Description comportement par mode (pour les outils 'both') */
const TOOL_MODE_DESC: Record<string, { code: string; ai: string }> = {
  fetch_order:        { code: 'Exécution directe via UUID ou numéro depuis les vars', ai: 'L\'IA extrait le numéro depuis la conversation' },
  choose_article:     { code: 'Affiche des boutons multi-select', ai: 'Liste les articles, l\'opérateur saisit sa sélection par texte' },
  choose_problem_tag: { code: 'Affiche des boutons de choix', ai: 'L\'IA extrait le tag depuis la conversation' },
  add_tag:            { code: 'Tags définis dans les paramètres du step', ai: 'L\'IA détermine les tags selon le contexte' },
  add_sav_comment:        { code: 'Commentaire défini dans les paramètres', ai: 'L\'IA rédige le commentaire' },
  add_new_product_line:   { code: 'Ajoute chaque article choisi (produit si product_group_id, sinon custom)', ai: 'L\'IA détermine les articles depuis la conversation' },
}

// Hint JSON par outil
const PARAMETERS_HINT: Record<string, string> = {
  clear_tags:              '{}',
  revert_to_concept:       '{}',
  cancel_order:            '{}',
  remove_product_line:     '{}',
  reserve_order:           '{}',
  start_order:             '{}',
  update_return_date:      '{}',
  stop_order:              '{}',
  add_tag:                 '{"tags_add": ["R22_WAIVED"], "tags_remove": ["R21_OPEN"]}',
  duplicate_order:         '{}',
  ask_yes_no:              '{"question": "Souhaites-tu conserver la caution ?", "output_var": "deposit_confirmed"}',
  choose_problem_tag:      '{"options": [{"label": "Retard", "tag": "r21_open"}, {"label": "Perte", "tag": "r22_waived"}, {"label": "Dommage", "tag": "r23_security"}, {"label": "Facturé", "tag": "r24_billed"}]}',
  create_new_return_order: '{}',
  zero_out_order_lines:    '{}',
  set_original_order:      '{}',
  add_internal_note:       '{"note": "Note interne à rédiger par l\'IA"}',
  add_sav_comment:         '{"comment": "Commentaire SAV à rédiger par l\'IA"}',
  send_email:              '{"subject": "Objet de l\'email", "body": "Corps de l\'email"}',
  draft_email_booqable:              '{"document_id": "5b83576b-a0bd-4be4-ad43-08cb2cbb26b8"}',
  send_email_booqable:               '{"document_id": "5b83576b-a0bd-4be4-ad43-08cb2cbb26b8"}',
  draft_email_with_invoice_booqable: '{"document_id": "uuid-du-template-email"}',
  send_email_with_invoice_booqable:  '{"document_id": "uuid-du-template-email"}',
  draft_email_with_quote_booqable:   '{"document_id": "uuid-du-template-email"}',
  send_email_with_quote_booqable:    '{"document_id": "uuid-du-template-email"}',
  draft_email:             '{"template_id": "retour_ok"}',
  log_case:                '{"problem_type": "manquant"}',
  add_product_line_by_id:  '{"product_group_id": "uuid-du-produit", "quantity": 1}',
}

/** Documentation textuelle de chaque outil */
const TOOL_DOC: Record<string, string> = {
  ask_yes_no:                        'Pose une question fermée (Oui/Non) à l\'opérateur. La réponse ("true" ou "false") est écrite dans {output_context}.{output_var}. Paramètres : question (texte affiché) et output_var (nom de la variable, défaut: "question_yes_no"). Condition dans le step suivant : "{output_context}.{output_var} == \'true\'".',
  add_new_product_line:              'Ajoute les articles sélectionnés (via choose_article) à la commande cible. Si l\'article a un product_group_id, crée une ligne produit Booqable ; sinon crée une ligne custom.',
  add_sav_comment:                   'Renseigne les champs SAV : order_sav (commande d\'origine) et notes_sav (commentaire). En mode Code, le commentaire est défini dans les paramètres ; en mode IA, il est rédigé par l\'IA.',
  add_tag:                           'Ajoute et/ou supprime des tags sur la commande cible. Les tags sont définis dans les paramètres (tags_add, tags_remove) ou déterminés par l\'IA.',
  cancel_order:                      'Annule la commande Booqable (statut → cancelled).',
  capture_stripe_deposit:            'Débite l\'autorisation bancaire Stripe (caution) du montant indiqué. Requiert provider_id (ID de l\'autorisation) et grand_total_euros.',
  check_deposit:                     'Vérifie la caution sur la commande d\'origine : détecte si un dépôt physique et/ou une autorisation carte Stripe sont présents. Écrit security_deposit, authorisation_card, payment_authorization_id, provider_id.',
  check_insurance:                   'Vérifie si l\'assurance Filme est souscrite sur la commande. Écrit insurance (true / false).',
  choose_article:                    'Affiche la liste des articles de la commande pour que l\'opérateur sélectionne ceux concernés. En mode Code : boutons multi-select ; en mode IA : sélection par texte. Écrit selected_ids et chosen_lines.',
  choose_problem_tag:                'Affiche des boutons de choix de type de problème (retard, perte, vol, dommage…). Les options sont configurables dans les paramètres.',
  clear_tags:                        'Supprime tous les tags de la commande.',
  create_new_return_order:           'Crée une nouvelle commande Booqable au nom du client avec remise 100 %, sans caution, date de fin fixée au 31/12. L\'ID et le numéro sont écrits dans les vars du contexte return (return.id / return.number).',
  create_payment_link:               'Crée un lien de paiement Stripe pour le montant de la commande et stocke l\'URL dans le champ lien_paiement de Booqable.',
  draft_email_ia:                    'Génère un brouillon d\'email via l\'IA (objet + corps). L\'opérateur peut le modifier avant envoi.',
  draft_email_booqable:              'Charge et affiche l\'aperçu d\'un template email Booqable (lecture seule). Le document_id doit être renseigné dans les paramètres.',
  draft_email_with_invoice_booqable: 'Charge un template Booqable avec la facture finalisée en pièce jointe. Requiert document_id (template) et s\'appuie sur la facture générée par finalize_invoice.',
  draft_email_with_quote_booqable:   'Charge un template Booqable avec le devis en pièce jointe. Requiert document_id (template) et s\'appuie sur le devis généré par finalize_quote.',
  duplicate_order:                   'Duplique la commande cible et stocke l\'ID et le numéro de la copie dans les vars du contexte child (child.id / child.number).',
  fetch_order:                       'Charge une commande Booqable depuis son UUID ou numéro. Écrit id, number, status, customer_id, tags et lines dans les vars du contexte.',
  fetch_order_amount:                'Récupère le montant total TTC de la commande. Écrit grand_total_euros (TTC) et deposit_euros. Pour le HT, utiliser fetch_original_amount_HT.',
  calculate_customer_score:          'Calcule le score de fidélité du client et propose une remise (0, 10, 15 ou 20 %). Analyse les commandes sur 24 mois : fréquence (+35 max), CA HT (+40 max), récence (+10 max), malus incidents r11/r12/r13/r14 (−50 max). Lit customer_id depuis input_context (écrit par fetch_order). Écrit discount_proposal et customer_score.',
  fetch_original_amount_HT:          'Récupère uniquement le montant HT de la commande (price_in_cents Booqable). Écrit grand_total_euros_HT. Utile pour calculer un pourcentage (ex: assurance 8%) sur le montant hors taxes.',
  round_deposit:                     'Arrondit la caution à la centaine la plus proche (ex: 1850 → 1900, 2000 → 2000). Lit security_deposit depuis input_context (écrit par check_deposit). Écrit security_deposit_rounded dans output_context.',
  fetch_original_from_field:         'Lit le numéro de commande d\'origine depuis le champ custom order_sav de la commande courante, puis charge cette commande. Écrit les données dans le contexte original.',
  finalize_invoice:                  'Finalise la facture de la commande (statut draft → finalized). Écrit document_id et invoice_number.',
  finalize_quote:                    'Crée le devis de la commande via POST /documents (document_type: quote). Écrit document_id et quote_number.',
  list_order:                        'Liste tous les articles de la commande dans le chat (lecture seule, aucune modification).',
  log_case:                          'Enregistre le cas dans la base FilmeAI (Supabase). Le problem_type doit être renseigné dans les paramètres.',
  remove_discount:                   'Supprime la remise (discount) de la commande.',
  remove_other_lines:                'Supprime toutes les lignes de la commande sauf l\'article sélectionné (via choose_article).',
  remove_product_line:               'Supprime une ligne spécifique de la commande.',
  reserve_order:                     'Passe la commande de concept à réservé (concept → reserved).',
  revert_to_concept:                 'Repasse la commande en statut draft/concept.',
  search_products:                   'Recherche des articles dans le catalogue Booqable (mode IA uniquement). Identifie les articles bulk, trackable ou custom correspondant à la demande.',
  send_email_ia:                     'Envoie l\'email préparé par draft_email_ia. Lit subject et body depuis les vars.',
  send_email_booqable:               'Envoie le template Booqable via le moteur d\'emailing intégré. Requiert document_id (depuis les paramètres ou active_document_id).',
  send_email_with_invoice_booqable:  'Envoie le template Booqable avec la facture en pièce jointe. S\'appuie sur finalize_invoice + draft_email_with_invoice_booqable.',
  send_email_with_quote_booqable:    'Envoie le template Booqable avec le devis en pièce jointe. S\'appuie sur finalize_quote + draft_email_with_quote_booqable.',
  set_original_order:                'Renseigne le numéro de la commande d\'origine dans le champ order_sav de la commande de retour. Lit number depuis le contexte input.',
  set_replacement_price:             'Fixe le prix de remplacement d\'une ligne de la commande. En mode IA, l\'opérateur est invité à saisir le montant.',
  set_sav_date:                      'Inscrit la date du jour dans le champ date_sav de la commande.',
  start_order:                       'Démarre la commande (statut → started / pickup).',
  stop_order:                        'Retourne le matériel (statut started → stopped).',
  update_return_date:                'Met à jour la date de retour de la commande à aujourd\'hui.',
  check_insurance_request_status:   'Vérifie si le locataire a demandé l\'assurance FILME sur sa commande. Retourne YES (assuré par FILME), NO (assurance personnelle multirisques), ou NOT_SET (non renseigné). Appeler après fetch_order avec l\'UUID de la commande.',
  add_product_line_by_id:           'Ajoute une ligne produit à la commande en utilisant un product_group_id fixe défini dans les paramètres du step. Utile pour ajouter automatiquement un produit standard. Requiert product_group_id dans les paramètres JSON.',
  add_product_insurance_8:          'Ajoute la ligne assurance FILME (product_group_id fixe) et fixe automatiquement son prix à 8% du montant HT. Lire grand_total_euros_HT depuis fetch_original_amount_HT avant d\'appeler ce step.',
}

type WorkflowCategory = 'retours' | 'planning'

type Workflow = {
  id: string
  slug: string
  name: string
  chat_label: string | null
  description: string
  prompt: string
  steps: WorkflowStep[]
  is_active: boolean
  category: WorkflowCategory
  parent_category: string | null
  welcome: string | null
}

// ── Composant Step ─────────────────────────────────────────────────────────────

function StepBadge({ type }: { type: string }) {
  if (type === 'action')      return <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 font-medium">Action</span>
  if (type === 'question')    return <span className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 font-medium">Question</span>
  if (type === 'instruction') return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 font-medium">Instruction</span>
  if (type === 'check')       return <span className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-600 font-medium">⚠ Vérification IA</span>
  return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{type}</span>
}

// ── Éditeur de parameters JSON ────────────────────────────────────────────────

function ParametersEditor({
  value,
  hint,
  onChange,
}: {
  value?: Record<string, unknown>
  hint?: string
  onChange: (params: Record<string, unknown> | undefined) => void
}) {
  const [raw, setRaw] = useState(value ? JSON.stringify(value, null, 2) : '')
  const [error, setError] = useState(false)

  // Resynchronise quand la valeur externe change (ex: changement de workflow)
  const prevValueRef = useRef<string>('')
  useEffect(() => {
    const serialized = value !== undefined ? JSON.stringify(value) : ''
    if (serialized !== prevValueRef.current) {
      prevValueRef.current = serialized
      setRaw(value ? JSON.stringify(value, null, 2) : '')
      setError(false)
    }
  }, [value])

  function handleChange(text: string) {
    setRaw(text)
    if (text.trim() === '') {
      setError(false)
      onChange(undefined)
      return
    }
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      setError(false)
      onChange(parsed)
    } catch {
      setError(true)
    }
  }

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">
        Paramètres <span className="text-gray-300">(JSON)</span>
      </label>
      <textarea
        value={raw}
        onChange={e => handleChange(e.target.value)}
        rows={3}
        placeholder={hint ? `ex: ${hint}` : '{}'}
        className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 resize-y bg-white ${
          error
            ? 'border-red-300 focus:ring-red-200 text-red-700'
            : 'border-gray-200 focus:ring-gray-300 text-gray-700'
        }`}
      />
      {error && <p className="text-xs text-red-500 mt-0.5">JSON invalide</p>}
    </div>
  )
}

// ── Composant StepList avec drag-and-drop ─────────────────────────────────────

function StepList({
  steps,
  onChange,
  onRemove,
}: {
  steps: WorkflowStep[]
  onChange: (steps: WorkflowStep[]) => void
  onRemove: (idx: number) => void
}) {
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [docOpen, setDocOpen]   = useState<string | null>(null) // step.id ayant le popup ouvert

  function onDragStart(idx: number) {
    dragIdx.current = idx
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOver(idx)
  }

  function onDrop(targetIdx: number) {
    const from = dragIdx.current
    if (from === null || from === targetIdx) { setDragOver(null); return }
    const next = [...steps]
    const [moved] = next.splice(from, 1)
    next.splice(targetIdx, 0, moved)
    onChange(next)
    dragIdx.current = null
    setDragOver(null)
  }

  function updateStep(idx: number, patch: Partial<WorkflowStep>) {
    const next = steps.map((s, i) => i === idx ? { ...s, ...patch } : s)
    onChange(next)
  }

  if (steps.length === 0) {
    return <div className="text-center text-xs text-gray-400 py-6">Aucune étape — cliquez sur Ajouter</div>
  }

  return (
    <div className="space-y-2">
      {steps.map((step, idx) => (
        <div
          key={step.id}
          draggable
          onDragStart={() => onDragStart(idx)}
          onDragOver={e => onDragOver(e, idx)}
          onDrop={() => onDrop(idx)}
          onDragEnd={() => setDragOver(null)}
          className={`border rounded-lg p-3 space-y-2 transition-colors ${
            dragOver === idx
              ? 'border-blue-300 bg-blue-50/50'
              : 'border-gray-100 bg-gray-50/50'
          }`}
        >
          <div className="flex items-center gap-2">
            {/* Drag handle */}
            <span className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0" title="Déplacer">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 2a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zM13 2a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2z" />
              </svg>
            </span>

            <span className="text-xs text-gray-300 font-mono w-4 shrink-0">{idx + 1}</span>

            <select
              value={step.type}
              onChange={e => updateStep(idx, { type: e.target.value as WorkflowStep['type'] })}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
            >
              <option value="action">Action</option>
              <option value="question">Question</option>
              <option value="instruction">Instruction</option>
              <option value="check">⚠ Vérification IA</option>
            </select>

            <StepBadge type={step.type} />

            <div className="flex-1" />

            <button
              onClick={() => onRemove(idx)}
              className="text-gray-300 hover:text-red-500 p-0.5 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Titre + description */}
          <div className="grid grid-cols-2 gap-2 pl-7">
            <input
              value={step.title}
              onChange={e => updateStep(idx, { title: e.target.value })}
              placeholder="Titre de l'étape"
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
            />
            <input
              value={step.description}
              onChange={e => updateStep(idx, { description: e.target.value })}
              placeholder="Description"
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
            />
          </div>

          {/* input_context + order_context + output_context + reads/writes */}
          <div className="pl-7 space-y-2">
            <div className="flex gap-3 flex-wrap">
              {/* input_context — visible si l'outil a des reads */}
              {step.type === 'action' && step.booqable_action && (TOOL_IO[step.booqable_action]?.reads.length ?? 0) > 0 && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    input_context <span className="text-gray-300">(source)</span>
                  </label>
                  <select
                    value={step.input_context || step.order_context || ''}
                    onChange={e => updateStep(idx, { input_context: (e.target.value as WorkflowStep['input_context']) || undefined })}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
                  >
                    <option value="">— même que target order —</option>
                    <option value="parent">parent</option>
                    <option value="child">child</option>
                    <option value="original">original</option>
                    <option value="return">return</option>
                  </select>
                </div>
              )}
              {/* order_context — caché pour les tools qui ne ciblent pas une commande existante */}
              {(!step.booqable_action || !NO_TARGET_ORDER.has(step.booqable_action)) && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    order_context <span className="text-gray-300">(target order)</span>
                  </label>
                  <select
                    value={step.order_context || ''}
                    onChange={e => updateStep(idx, { order_context: (e.target.value as WorkflowStep['order_context']) || undefined })}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
                  >
                    <option value="">— non défini —</option>
                    <option value="parent">parent</option>
                    <option value="child">child</option>
                    <option value="original">original</option>
                    <option value="return">return</option>
                  </select>
                </div>
              )}
              {/* output_context — visible seulement si l'outil écrit des vars */}
              {step.type === 'action' && step.booqable_action && (TOOL_IO[step.booqable_action]?.writes.length ?? 0) > 0 && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    output_context <span className="text-gray-300">(destination)</span>
                  </label>
                  <select
                    value={step.output_context || TOOL_IO[step.booqable_action]?.outputCtx || step.order_context || ''}
                    onChange={e => updateStep(idx, { output_context: (e.target.value as WorkflowStep['output_context']) || undefined })}
                    className="border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-300 bg-blue-50"
                  >
                    <option value="">— même que target order —</option>
                    <option value="parent">parent</option>
                    <option value="child">child</option>
                    <option value="original">original</option>
                    <option value="return">return</option>
                  </select>
                </div>
              )}
            </div>

            {/* Read / Write badges */}
            {step.type === 'action' && step.booqable_action && TOOL_IO[step.booqable_action] && (() => {
              const io       = TOOL_IO[step.booqable_action!]!
              const readCtx  = step.input_context ?? step.order_context ?? '?'
              const writeCtx = step.output_context ?? io.outputCtx ?? step.order_context ?? '?'
              return (
                <div className="flex gap-3 flex-wrap text-[10px]">
                  {io.reads.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">📥 Read :</span>
                      {io.reads.map(f => (
                        <span key={f} className="font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {readCtx}.{f}
                        </span>
                      ))}
                    </div>
                  )}
                  {io.writes.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">📤 Write :</span>
                      {io.writes.map(f => (
                        <span key={f} className="font-mono bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                          {writeCtx}.{f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Write badge for ask_yes_no (question + code) */}
            {step.type === 'question' && step.execution === 'code' && (() => {
              const ctx    = step.output_context ?? step.order_context ?? 'return'
              const outVar = (step.parameters as Record<string, string> | undefined)?.output_var ?? 'question_yes_no'
              return (
                <div className="flex gap-3 flex-wrap text-[10px]">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400">📤 Write :</span>
                    <span className="font-mono bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{ctx}.{outVar}</span>
                    <span className="text-gray-400">→ <span className="font-mono">&apos;true&apos;</span> / <span className="font-mono">&apos;false&apos;</span></span>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* condition — optionnelle, step sauté si non satisfaite */}
          <div className="pl-7">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 shrink-0">Condition</label>
              <input
                value={step.condition ?? ''}
                onChange={e => updateStep(idx, { condition: e.target.value || undefined })}
                placeholder="ex: original.insurance == 'true' AND original.security_deposit == 'true'"
                className={`flex-1 border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-300 ${
                  step.condition
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-gray-200 bg-white text-gray-400'
                }`}
              />
            </div>
            {step.condition && (
              <p className="mt-0.5 ml-[4.5rem] text-[10px] text-amber-600">
                ⚡ Step sauté si condition fausse — variables disponibles : <span className="font-mono">original.insurance</span>, <span className="font-mono">original.security_deposit</span>, <span className="font-mono">original.authorisation_card</span>
              </p>
            )}
          </div>

          {/* execution — mode d'exécution */}
          {((step.type === 'action' && !!step.booqable_action) || step.type === 'question' || step.type === 'instruction') && (
            <div className="pl-7 flex items-center gap-3">
              <label className="text-xs text-gray-400">Exécution</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                <button
                  onClick={() => updateStep(idx, {
                    execution: 'ai',
                    // Pour les questions en mode IA → retirer ask_yes_no
                    ...(step.type === 'question' ? { booqable_action: undefined } : {}),
                  })}
                  className={`px-3 py-1.5 transition-colors ${
                    (!step.execution || step.execution === 'ai')
                      ? 'bg-purple-500 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  🤖 IA
                </button>
                <button
                  onClick={() => updateStep(idx, {
                    execution: 'code',
                    // Pour les questions en mode code → force ask_yes_no
                    ...(step.type === 'question' ? { booqable_action: 'ask_yes_no' } : {}),
                  })}
                  className={`px-3 py-1.5 transition-colors border-l border-gray-200 ${
                    step.execution === 'code'
                      ? 'bg-green-500 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  ⚡ Code
                </button>
              </div>
              {step.execution === 'code' && (
                <span className="text-[10px] text-green-600 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                  Exécuté sans LLM — rapide et fiable
                </span>
              )}
            </div>
          )}

          {/* Paramètres ask_yes_no — visibles pour les questions en mode code */}
          {step.type === 'question' && step.execution === 'code' && (
            <div className="pl-7">
              <ParametersEditor
                value={step.parameters}
                hint={PARAMETERS_HINT['ask_yes_no']}
                onChange={params => updateStep(idx, { parameters: params })}
              />
            </div>
          )}

          {/* Outil Booqable — affiché pour les actions */}
          {step.type === 'action' && (
            <div className="pl-7 space-y-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Appel API Booqable</label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={step.booqable_action || ''}
                    onChange={e => {
                      const action = e.target.value || undefined
                      const defaultExec = action ? (TOOL_DEFAULT_EXECUTION[action] ?? 'ai') : undefined
                      updateStep(idx, { booqable_action: action, execution: defaultExec })
                    }}
                    className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
                  >
                    <option value="">— aucun —</option>
                    {BOOQABLE_TOOLS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {step.booqable_action && (
                    <button
                      type="button"
                      onClick={() => setDocOpen(docOpen === step.id ? null : step.id)}
                      title="Documentation de l'outil"
                      className={`shrink-0 w-6 h-6 rounded-full border text-xs font-semibold transition-colors ${
                        docOpen === step.id
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600'
                      }`}
                    >
                      ℹ
                    </button>
                  )}
                </div>
                {/* Popup documentation */}
                {docOpen === step.id && step.booqable_action && (() => {
                  const tool   = step.booqable_action!
                  const doc    = TOOL_DOC[tool]
                  const io     = TOOL_IO[tool]
                  const compat = TOOL_COMPAT[tool]
                  return (
                    <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-2 text-xs shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-blue-800 font-mono">{tool}</span>
                        <button
                          type="button"
                          onClick={() => setDocOpen(null)}
                          className="text-blue-300 hover:text-blue-600 text-xs shrink-0"
                        >✕</button>
                      </div>
                      {doc && <p className="text-gray-600 leading-relaxed">{doc}</p>}
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {(compat === 'code' || compat === 'both') && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">⚡ Code</span>
                        )}
                        {(compat === 'ai' || compat === 'both') && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">🤖 IA</span>
                        )}
                      </div>
                      {io && (
                        <div className="grid grid-cols-2 gap-2 pt-0.5">
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">Lit</p>
                            {io.reads.length > 0
                              ? io.reads.map(r => (
                                  <span key={r} className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">{r}</span>
                                ))
                              : <span className="text-gray-300 text-[10px] italic">rien</span>
                            }
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">Écrit</p>
                            {io.writes.length > 0
                              ? io.writes.map(w => (
                                  <span key={w} className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-mono text-[10px]">{w}</span>
                                ))
                              : <span className="text-gray-300 text-[10px] italic">rien</span>
                            }
                            {io.outputCtx && (
                              <span className="inline-block mt-0.5 text-[10px] text-blue-500 italic">→ contexte {io.outputCtx}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Badges compatibilité + description mode */}
              {step.booqable_action && (() => {
                const compat = TOOL_COMPAT[step.booqable_action] ?? 'both'
                const modeDesc = TOOL_MODE_DESC[step.booqable_action]
                const activeMode = step.execution ?? 'ai'
                const desc = modeDesc?.[activeMode]
                return (
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {(compat === 'code' || compat === 'both') && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                        ⚡ Code
                      </span>
                    )}
                    {(compat === 'ai' || compat === 'both') && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                        🤖 IA
                      </span>
                    )}
                    {compat === 'code' && activeMode === 'ai' && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        ⚠ Cet outil n&apos;est pas prévu pour le mode IA
                      </span>
                    )}
                    {compat === 'ai' && activeMode === 'code' && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        ⚠ Cet outil n&apos;est pas prévu pour le mode Code
                      </span>
                    )}
                    {desc && (
                      <span className="text-[10px] text-gray-400 italic">{desc}</span>
                    )}
                  </div>
                )
              })()}

              {/* Paramètres structurés — visibles quand booqable_action est sélectionné */}
              {step.booqable_action && (
                <ParametersEditor
                  value={step.parameters}
                  hint={PARAMETERS_HINT[step.booqable_action]}
                  onChange={params => updateStep(idx, { parameters: params })}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Workflow | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [creating, setCreating] = useState(false)

  // Champs en cours d'édition
  const [editSlug, setEditSlug] = useState('')
  const [editName, setEditName] = useState('')
  const [editChatLabel, setEditChatLabel] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editSteps, setEditSteps] = useState<WorkflowStep[]>([])
  const [editActive, setEditActive] = useState(true)
  const [editCategory, setEditCategory] = useState<WorkflowCategory>('retours')
  const [editParentCategory, setEditParentCategory] = useState<string>('')
  const [editWelcome, setEditWelcome] = useState<string>('')
  const [activeTab, setActiveTab] = useState<WorkflowCategory>('retours')
  const [chatCategories, setChatCategories] = useState<{ key: string; label: string; chat_type: string }[]>([])
  const [exportModal, setExportModal] = useState(false)
  const [exportCopied, setExportCopied] = useState(false)

  function exportJson() {
    const normalizedSteps = editSteps.map(s => {
      const step: Record<string, unknown> = {
        id:          s.id,
        type:        s.type,
        title:       s.title,
        description: s.description,
        execution:   s.execution ?? 'ai',
      }
      const effectiveOrder  = (!s.booqable_action || !NO_TARGET_ORDER.has(s.booqable_action)) ? (s.order_context ?? null) : null
      step.input_context  = s.input_context  ?? effectiveOrder
      step.order_context  = effectiveOrder
      step.output_context = s.output_context ?? (s.booqable_action ? (TOOL_IO[s.booqable_action]?.outputCtx ?? null) : null) ?? effectiveOrder
      if (s.booqable_action) step.booqable_action  = s.booqable_action
      if (s.parameters && Object.keys(s.parameters).length > 0) step.parameters = s.parameters
      if (s.condition)  step.condition = s.condition
      return step
    })
    return JSON.stringify({
      name:        editName,
      slug:        editSlug,
      description: editDescription,
      is_active:   editActive,
      prompt_ia:   editPrompt,
      steps:       normalizedSteps,
    }, null, 2)
  }

  function copyExport() {
    navigator.clipboard.writeText(exportJson()).then(() => {
      setExportCopied(true)
      setTimeout(() => setExportCopied(false), 2000)
    })
  }

  useEffect(() => {
    fetch('/api/returns/workflows')
      .then(r => r.json())
      .then(d => {
        const wfs = (d.workflows || []).sort((a: Workflow, b: Workflow) => a.name.localeCompare(b.name, 'fr'))
        setWorkflows(wfs)
        if (wfs.length > 0) select(wfs[0])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetch('/api/chat-categories')
      .then(r => r.json())
      .then(d => setChatCategories(d.categories || []))
      .catch(() => {})
  }, [])

  function select(wf: Workflow) {
    setSelected(wf)
    setEditing(false)
    setEditSlug(wf.slug)
    setEditName(wf.name)
    setEditChatLabel(wf.chat_label ?? '')
    setEditDescription(wf.description)
    setEditPrompt(wf.prompt)
    setEditSteps(wf.steps || [])
    setEditActive(wf.is_active)
    setEditCategory(wf.category ?? 'retours')
    setEditParentCategory(wf.parent_category ?? '')
    setEditWelcome(wf.welcome ?? '')
    setSaved(false)
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/returns/workflows', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          slug: editSlug,
          name: editName,
          chat_label: editChatLabel.trim() || null,
          description: editDescription,
          prompt: editPrompt,
          steps: editSteps,
          is_active: editActive,
          category: editCategory,
          parent_category: editParentCategory.trim() || null,
          welcome: editWelcome.trim() || null,
        }),
      })
      if (!res.ok) throw new Error('Erreur serveur')

      const updated = { ...selected, slug: editSlug, name: editName, chat_label: editChatLabel.trim() || null, description: editDescription, prompt: editPrompt, steps: editSteps, is_active: editActive, category: editCategory, parent_category: editParentCategory.trim() || null, welcome: editWelcome.trim() || null }
      setWorkflows(prev => prev.map(w => w.id === selected.id ? updated : w))
      setSelected(updated)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function deleteWorkflow(wf: Workflow) {
    if (!confirm(`Supprimer le workflow "${wf.name}" ?`)) return
    await fetch('/api/returns/workflows', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: wf.id }),
    })
    const remaining = workflows.filter(w => w.id !== wf.id)
    setWorkflows(remaining)
    if (selected?.id === wf.id) {
      if (remaining.length > 0) select(remaining[0])
      else setSelected(null)
    }
  }

  async function duplicateWorkflow(wf: Workflow) {
    setCreating(true)
    try {
      const res = await fetch('/api/returns/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug:            `${wf.slug}_copy_${Date.now()}`,
          name:            `${wf.name} (copie)`,
          chat_label:      wf.chat_label ?? null,
          description:     wf.description,
          prompt:          wf.prompt,
          steps:           wf.steps,
          is_active:       false,
          category:        wf.category ?? 'retours',
          parent_category: wf.parent_category ?? null,
          welcome:         wf.welcome ?? null,
        }),
      })
      const d = await res.json() as { workflow?: Workflow; error?: string }
      if (d.workflow) {
        setWorkflows(prev => [...prev, d.workflow!].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
        select(d.workflow!)
        setEditing(true)
      }
    } finally {
      setCreating(false)
    }
  }

  async function createNew() {
    setCreating(true)
    try {
      const res = await fetch('/api/returns/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: `workflow-${Date.now()}`, name: 'Nouveau workflow', description: '', prompt: '', steps: [], is_active: false, category: activeTab }),
      })
      const d = await res.json() as { workflow?: Workflow; error?: string }
      if (d.workflow) {
        setWorkflows(prev => [...prev, d.workflow!].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
        select(d.workflow!)
        setEditing(true)
      }
    } finally {
      setCreating(false)
    }
  }

  function addStep() {
    const newStep: WorkflowStep = {
      id: String(Date.now()),
      type: 'instruction',
      title: 'Nouvelle étape',
      description: '',
    }
    setEditSteps(prev => [...prev, newStep])
  }

  function removeStep(idx: number) {
    setEditSteps(prev => prev.filter((_, i) => i !== idx))
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-400">Chargement…</div>
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Workflows</h1>
          <p className="text-sm text-gray-500 mt-0.5">Éditez les procédures utilisées par l&apos;assistant</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-green-600 font-medium flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Sauvegardé
            </span>
          )}
          <button
            onClick={() => selected && duplicateWorkflow(selected)}
            disabled={creating || !selected}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Dupliquer
          </button>
          <button
            onClick={createNew}
            disabled={creating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nouveau workflow
          </button>
          <button
            onClick={() => selected && deleteWorkflow(selected)}
            disabled={!selected}
            title="Supprimer ce workflow"
            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Liste des workflows */}
        <div className="w-52 shrink-0">
          {/* Tabs Retours / Planning */}
          <div className="flex mb-3 border border-gray-200 rounded-lg overflow-hidden text-xs font-medium">
            {(['retours', 'planning'] as WorkflowCategory[]).map(tab => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab)
                  const first = workflows.find(w => (w.category ?? 'retours') === tab)
                  if (first) select(first)
                  else setSelected(null)
                }}
                className={`flex-1 py-1.5 transition-colors ${
                  activeTab === tab
                    ? 'bg-black text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {tab === 'retours' ? 'Retours' : 'Planning'}
              </button>
            ))}
          </div>

          {/* Liste filtrée */}
          <div className="space-y-1">
            {workflows.filter(w => (w.category ?? 'retours') === activeTab).map(wf => (
              <button
                key={wf.id}
                onClick={() => select(wf)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm ${
                  selected?.id === wf.id
                    ? 'bg-black text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <div className="font-medium">{wf.name}</div>
                <div className={`text-xs mt-0.5 font-mono ${selected?.id === wf.id ? 'text-white/50' : 'text-gray-400'}`}>
                  {wf.slug} · {wf.steps?.length || 0} étapes
                </div>
              </button>
            ))}
            {workflows.filter(w => (w.category ?? 'retours') === activeTab).length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Aucun workflow</p>
            )}
          </div>
        </div>

        {/* Éditeur */}
        {selected && (
          <div className="flex-1 space-y-4">
            {/* Infos générales */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Informations</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExportModal(true)}
                    className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Exporter
                  </button>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={e => { setEditActive(e.target.checked); setEditing(true) }}
                      className="rounded"
                    />
                    Actif
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
                  <input
                    value={editName}
                    onChange={e => { setEditName(e.target.value); setEditing(true) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description courte</label>
                  <input
                    value={editDescription}
                    onChange={e => { setEditDescription(e.target.value); setEditing(true) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Nom dans le chat <span className="text-gray-400 font-normal">(bouton affiché dans /returns — si vide, utilise le Nom)</span>
                  </label>
                  <input
                    value={editChatLabel}
                    onChange={e => { setEditChatLabel(e.target.value); setEditing(true) }}
                    placeholder={editName || 'ex: Retard — créer un dossier'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
                <div className="shrink-0">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Catégorie</label>
                  <select
                    value={editCategory}
                    onChange={e => { setEditCategory(e.target.value as WorkflowCategory); setEditing(true) }}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
                  >
                    <option value="retours">Retours</option>
                    <option value="planning">Planning</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Slug <span className="text-gray-400 font-normal">(doit correspondre au scénario sélectionné dans le chat)</span>
                </label>
                <input
                  value={editSlug}
                  onChange={e => { setEditSlug(e.target.value); setEditing(true) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-300"
                  placeholder="ex: r11_21_late_open"
                />
                <select
                  value={editSlug}
                  onChange={e => { if (e.target.value) { setEditSlug(e.target.value); setEditing(true) } }}
                  className="mt-1.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
                >
                  <option value="">— choisir un slug prédéfini —</option>
                  <optgroup label="R00 – Retour">
                    <option value="r00_return_ok">r00_return_ok</option>
                  </optgroup>
                  <optgroup label="R11 – Retard">
                    <option value="r11_21_late_open">r11_21_late_open</option>
                    <option value="r11_22_late_waived">r11_22_late_waived</option>
                    <option value="r11_23_late_deposit">r11_23_late_deposit</option>
                    <option value="r11_24_late_billed">r11_24_late_billed</option>
                  </optgroup>
                  <optgroup label="R12 – Perte">
                    <option value="r12_21_missing_open">r12_21_missing_open</option>
                    <option value="r12_22_missing_waived">r12_22_missing_waived</option>
                    <option value="r12_23_missing_deposit">r12_23_missing_deposit</option>
                    <option value="r12_24_missing_billed">r12_24_missing_billed</option>
                  </optgroup>
                  <optgroup label="R13 – Vol">
                    <option value="r13_21_theft_open">r13_21_theft_open</option>
                    <option value="r13_22_theft_waived">r13_22_theft_waived</option>
                    <option value="r13_23_theft_deposit">r13_23_theft_deposit</option>
                    <option value="r13_24_theft_billed">r13_24_theft_billed</option>
                  </optgroup>
                  <optgroup label="R14 – Dommage">
                    <option value="r14_21_damage_open">r14_21_damage_open</option>
                    <option value="r14_22_damage_waived">r14_22_damage_waived</option>
                    <option value="r14_23_damage_deposit">r14_23_damage_deposit</option>
                    <option value="r14_24_damage_billed">r14_24_damage_billed</option>
                  </optgroup>
                  <optgroup label="U – Utilitaires">
                    <option value="u01_split_return_order">u01_split_return_order</option>
                  </optgroup>
                  {(() => {
                    const predefined = new Set([
                      'r00_return_ok',
                      'r11_21_late_open', 'r11_22_late_waived', 'r11_23_late_deposit', 'r11_24_late_billed',
                      'r12_21_missing_open', 'r12_22_missing_waived', 'r12_23_missing_deposit', 'r12_24_missing_billed',
                      'r13_21_theft_open', 'r13_22_theft_waived', 'r13_23_theft_deposit', 'r13_24_theft_billed',
                      'r14_21_damage_open', 'r14_22_damage_waived', 'r14_23_damage_deposit', 'r14_24_damage_billed',
                      'u01_split_return_order',
                    ])
                    const custom = workflows.filter(w => !predefined.has(w.slug))
                    if (custom.length === 0) return null
                    return (
                      <optgroup label="Personnalisés">
                        {custom.map(w => (
                          <option key={w.slug} value={w.slug}>{w.slug}</option>
                        ))}
                      </optgroup>
                    )
                  })()}
                </select>
              </div>
            </div>

            {/* Catégorie parent + Message d'accueil */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Chat</h2>
                <p className="text-xs text-gray-400 mt-0.5">Rattachement dans le menu et message affiché au lancement</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Catégorie parent <span className="text-gray-400 font-normal">(niveau 1 du menu chat)</span>
                  </label>
                  <select
                    value={editParentCategory}
                    onChange={e => { setEditParentCategory(e.target.value); setEditing(true) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
                  >
                    <option value="">— aucune —</option>
                    {chatCategories
                      .filter(c => c.chat_type === editCategory)
                      .map(c => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))
                    }
                  </select>
                </div>
                <div className="text-xs text-gray-400 flex items-end pb-1">
                  {editParentCategory
                    ? <span>Ce workflow apparaîtra sous <strong className="text-gray-600">{chatCategories.find(c => c.key === editParentCategory)?.label ?? editParentCategory}</strong> dans le chat.</span>
                    : <span>Sans catégorie → affiché directement en niveau 1.</span>
                  }
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Message d&apos;accueil <span className="text-gray-400 font-normal">(affiché au démarrage du chat)</span>
                </label>
                <textarea
                  value={editWelcome}
                  onChange={e => { setEditWelcome(e.target.value); setEditing(true) }}
                  rows={3}
                  placeholder="ex: Tâche : Créer un dossier de retard (R11-21).&#10;Donnez-moi le numéro de la commande d'origine."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 resize-y"
                />
              </div>
            </div>

            {/* Prompt IA */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Prompt IA</h2>
                <p className="text-xs text-gray-400 mt-0.5">Instructions libres chargées dans le système de l&apos;assistant</p>
              </div>
              <textarea
                value={editPrompt}
                onChange={e => { setEditPrompt(e.target.value); setEditing(true) }}
                rows={12}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-300 resize-y"
                placeholder="Instructions pour l'IA…"
              />
            </div>

            {/* Étapes structurées */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Étapes structurées</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Référence visuelle de la procédure (affichée en admin)</p>
                </div>
                <button
                  onClick={() => { addStep(); setEditing(true) }}
                  className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Ajouter
                </button>
              </div>

              <StepList
                steps={editSteps}
                onChange={steps => { setEditSteps(steps); setEditing(true) }}
                onRemove={idx => { removeStep(idx); setEditing(true) }}
              />
            </div>

            {/* Actions */}
            {editing && (
              <div className="flex justify-end gap-3 pb-6">
                <button
                  onClick={() => select(selected)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-5 py-2 bg-black text-white text-sm rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal export JSON ── */}
      {exportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setExportModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Export workflow</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{editName} <span className="font-mono font-normal text-gray-400">· {editSlug}</span></p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyExport}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${exportCopied ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-black text-white hover:bg-gray-800'}`}
                >
                  {exportCopied ? (
                    <>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      Copié !
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                      Copier
                    </>
                  )}
                </button>
                <button onClick={() => setExportModal(false)} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="px-6 py-4 max-h-[65vh] overflow-y-auto">
              <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-words leading-relaxed">{exportJson()}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
