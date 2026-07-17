/**
 * Bibliothèque de templates d'emails Filme.
 *
 * Templates disponibles :
 *   retour_ok           — #10 Contrôle retour tout OK
 *   retour_casse        — #11 Contrôle retour matériel cassé (cas 1–4)
 *   retour_manquant     — #11 Contrôle retour matériel manquant
 *   facturation_casse   — #12 Facturation SAV matériel cassé (cas 1–7)
 *   facturation_perdu   — #12 Facturation SAV matériel perdu (cas 1–5)
 *   facturation_vole    — #12 Facturation SAV matériel volé (cas 1–6)
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type EmailTemplateId =
  | 'retour_ok'
  | 'retour_casse'
  | 'retour_manquant'
  | 'facturation_casse'
  | 'facturation_perdu'
  | 'facturation_vole'

export type EmailTemplateVars = {
  customerName: string
  customerEmail?: string
  /** Numéro de la location d'origine (order_sav) */
  originOrderNumber?: string
  /** Numéro de la location (pour retour_ok) */
  orderNumber?: string
  orderStartsAt?: string
  orderStopsAt?: string
  /** Détail du problème (notes_sav) */
  notesSav?: string
  /** Le client a souscrit à l'assurance */
  insurance?: boolean
  /** Une caution est active */
  caution?: boolean
  /** Montant réparation/remplacement > 500 € (pour cas avec franchise) */
  amountAbove500?: boolean
  /** Retard de paiement (cas spécial facturation) */
  latePayment?: boolean
  /** Lien de paiement CB */
  paymentLink?: string
  /** Numéro de document/facture */
  documentNumber?: string
}

export type RenderedEmail = {
  subject: string
  body: string
  to: string
}

// ── Constantes Filme ───────────────────────────────────────────────────────────

const COMPANY_NAME  = 'filme'
const COMPANY_EMAIL = 'location@filme.fr'
const COMPANY_PHONE = '07 57 83 07 07'
const COMPANY_SIGN  = "L'équipe Filme"

function bankInfo(paymentLink: string | undefined, documentNumber: string | undefined): string {
  const link = paymentLink ? `\nLe règlement peut être effectué directement via le lien suivant :\n${paymentLink}` : ''
  const ref  = documentNumber ? `filme-2025-${documentNumber}` : 'filme-2025-[numéro]'
  return `${link}
Ou par virement bancaire :
Bénéficiaire : Filme
IBAN : FR76 1695 8000 0158 5263 0441 143
BIC : QNTOFRP1XXX
👉 Merci d'indiquer dans l'objet de votre virement : **${ref}**`
}

function footer(): string {
  return `\nNous restons à votre disposition pour toute précision.\n${COMPANY_SIGN}`
}

// ── #10 — Retour OK ────────────────────────────────────────────────────────────

function retour_ok(v: EmailTemplateVars): RenderedEmail {
  const orderNum = v.orderNumber || v.originOrderNumber || ''
  return {
    subject: `${COMPANY_NAME} – Vérification de votre commande ${orderNum}`,
    body: `Hello ${v.customerName},

Nous avons bien réceptionné et vérifié le matériel de votre commande #${orderNum}${v.orderStartsAt && v.orderStopsAt ? `, loué du ${v.orderStartsAt} au ${v.orderStopsAt}` : ''}.

🔍 Aucun problème à signaler, tout roule — merci pour votre soin et votre confiance !

Si vous avez apprécié l'expérience, vous pouvez nous laisser un petit mot ici :
👉 [Laissez-nous un avis sur Google](https://g.page/r/CT4Vc96HRHnpEB0/review)

Et pour rester connecté·e :
📸 [Instagram](https://www.instagram.com/filmemieux)
📬 [Notre Newsletter](https://www.filme.fr/pages/newsletter)

À très bientôt,
${COMPANY_SIGN} 🎬`,
    to: v.customerEmail || '',
  }
}

// ── #11 — Retour cassé ─────────────────────────────────────────────────────────

function retour_casse(v: EmailTemplateVars): RenderedEmail {
  const orderNum = v.originOrderNumber || ''

  let caseBlock: string
  if (v.insurance && !v.caution) {
    caseBlock = `Vous avez souscrit à notre assurance.
Conformément à nos conditions générales, une franchise de 20 % du montant des dommages s'applique, avec un minimum de 500 € HT.
Pour les réparations inférieures à 500 €, le montant total vous sera facturé.
Dès réception du devis, nous vous adresserons la facture correspondante, accompagnée du détail des réparations.`
  } else if (v.insurance && v.caution) {
    caseBlock = `Vous avez souscrit à notre assurance.
Conformément à nos conditions générales, une franchise de 20 % du montant des dommages s'applique, avec un minimum de 500 € HT.
Pour les réparations inférieures à 500 €, le montant total vous sera facturé.
Une caution est actuellement active ; nous la conservons à titre de garantie jusqu'à réception du devis de réparation.
Dès réception du devis, nous vous adresserons la facture correspondante, accompagnée du détail des réparations.`
  } else if (!v.insurance && v.caution) {
    caseBlock = `Vous n'avez pas souscrit à notre assurance.
L'intégralité du coût de la réparation sera donc à votre charge.
Une caution est actuellement active ; nous la conservons à titre de garantie le temps d'obtenir le devis.
Dès réception du devis, nous vous adresserons la facture correspondante, accompagnée du détail des réparations.`
  } else {
    // !insurance && !caution (default)
    caseBlock = `Vous n'avez pas souscrit à notre assurance.
L'intégralité du coût de la réparation sera donc à votre charge.
Dès réception du devis, nous vous adresserons la facture correspondante, accompagnée du détail des réparations.`
  }

  return {
    subject: `${COMPANY_NAME} – Dommage matériel constaté lors du retour de votre commande ${orderNum}`,
    body: `Hello ${v.customerName},

Nous venons de procéder à la vérification du retour de votre commande #${orderNum}.
Lors du contrôle, nous avons relevé les points suivants :
${v.notesSav || ''}

${caseBlock}

N'hésitez pas à nous contacter par retour d'email à ${COMPANY_EMAIL} ou par téléphone au ${COMPANY_PHONE}.
Nous comptons sur votre réactivité et restons à votre disposition.
${COMPANY_SIGN}`,
    to: v.customerEmail || '',
  }
}

// ── #11 — Retour manquant ──────────────────────────────────────────────────────

function retour_manquant(v: EmailTemplateVars): RenderedEmail {
  const orderNum = v.originOrderNumber || ''
  return {
    subject: `${COMPANY_NAME} – Matériel manquant lors du retour de votre commande ${orderNum}`,
    body: `Hello ${v.customerName},

Nous venons de finaliser la vérification du retour de votre commande #${orderNum}.
Lors du contrôle, nous avons relevé les points suivants :
${v.notesSav || ''}

👉 Afin de régulariser rapidement la situation, merci de rapporter le matériel manquant dès que possible dans nos locaux de Montreuil.
Si cela n'est pas possible, merci de nous contacter sans délai afin que nous trouvions ensemble la solution la plus adaptée.

Merci de bien vouloir nous tenir informés par retour d'email à ${COMPANY_EMAIL} ou par téléphone au ${COMPANY_PHONE}.
Nous comptons sur votre réactivité et restons à votre disposition.
${COMPANY_SIGN}`,
    to: v.customerEmail || '',
  }
}

// ── #12 — Facturation cassé ────────────────────────────────────────────────────

function facturation_casse(v: EmailTemplateVars): RenderedEmail {
  const orderNum = v.originOrderNumber || ''
  const bank = bankInfo(v.paymentLink, v.documentNumber)

  let caseBlock: string

  if (v.latePayment) {
    caseBlock = `Nous n'avons toujours pas reçu votre règlement afin de solder ce problème. Merci de procéder au paiement dans les plus brefs délais.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail de la réparation.
${bank}`
  } else if (v.insurance && !v.caution && !v.amountAbove500) {
    caseBlock = `Vous avez souscrit à notre assurance.
Conformément à nos conditions générales, pour les réparations inférieures à 500 €, le montant total de la réparation vous est facturé.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du devis.
${bank}`
  } else if (v.insurance && !v.caution && v.amountAbove500) {
    caseBlock = `Vous avez souscrit à notre assurance.
Conformément à nos conditions générales, une franchise de 20 % du montant des dommages s'applique, avec un minimum de 500 € HT.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du devis de réparation.
${bank}`
  } else if (v.insurance && v.caution && !v.amountAbove500) {
    caseBlock = `Vous avez souscrit à notre assurance.
Conformément à nos conditions générales, pour les réparations dont le montant est inférieur à 500 €, la totalité de la réparation reste à votre charge.
Une caution est actuellement active ; elle sera débitée à hauteur du montant facturé.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail des réparations.`
  } else if (v.insurance && v.caution && v.amountAbove500) {
    caseBlock = `Vous avez souscrit à notre assurance.
Conformément à nos conditions générales, une franchise de 20 % du montant des dommages s'applique, avec un minimum de 500 € HT.
Une caution est actuellement active ; elle sera débitée à hauteur du montant facturé.
Vous trouverez ci-joint la facture correspondante, ainsi que le détail du devis de réparation.`
  } else if (!v.insurance && v.caution) {
    caseBlock = `Vous n'avez pas souscrit à notre assurance.
L'intégralité du coût de la réparation est donc à votre charge.
Une caution est actuellement active ; elle sera débitée à hauteur du montant facturé.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail des réparations.`
  } else {
    // !insurance && !caution
    caseBlock = `Vous n'avez pas souscrit à notre assurance.
L'intégralité du coût de la réparation est donc à votre charge.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du devis de réparation.
${bank}`
  }

  return {
    subject: `${COMPANY_NAME} – Facture suite à anomalie retour matériel (commande ${orderNum})`,
    body: `Bonjour ${v.customerName},

Lors de la vérification du retour de votre commande #${orderNum}, nous avons relevé les points suivants :
${v.notesSav || ''}

${caseBlock}
${footer()}`,
    to: v.customerEmail || '',
  }
}

// ── #12 — Facturation perdu ────────────────────────────────────────────────────

function facturation_perdu(v: EmailTemplateVars): RenderedEmail {
  const orderNum = v.originOrderNumber || ''
  const bank = bankInfo(v.paymentLink, v.documentNumber)

  let caseBlock: string

  if (v.latePayment) {
    caseBlock = `Nous n'avons toujours pas reçu votre règlement afin de solder ce problème. Merci de procéder au paiement dans les plus brefs délais.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du remplacement.
${bank}`
  } else if (v.insurance && !v.caution) {
    caseBlock = `La perte simple du matériel (oubli, disparition inexpliquée ou non-restitution) n'est pas couverte par notre assurance, conformément à nos conditions générales.
L'intégralité du prix de remplacement au coût d'achat est donc à votre charge.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du remplacement.
${bank}`
  } else if (v.insurance && v.caution) {
    caseBlock = `La perte simple du matériel (oubli, disparition inexpliquée ou non-restitution) n'est pas couverte par l'assurance, conformément à nos conditions générales.
L'intégralité du prix de remplacement au coût d'achat est donc à votre charge.
Une caution est actuellement active ; elle sera débitée à hauteur du montant facturé.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du remplacement à notre prix d'achat.`
  } else if (!v.insurance && v.caution) {
    caseBlock = `Conformément à nos conditions générales, dans le cas d'une perte simple du matériel (oubli, disparition inexpliquée ou non-restitution), l'intégralité du prix de remplacement au coût d'achat est à votre charge.
Une caution est actuellement active ; elle sera débitée à hauteur du montant facturé.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du remplacement à notre prix d'achat.`
  } else {
    // !insurance && !caution
    caseBlock = `Conformément à nos conditions générales, dans le cas d'une perte simple du matériel (oubli, disparition inexpliquée ou non-restitution), l'intégralité du prix de remplacement au coût d'achat est à votre charge.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du remplacement.
${bank}`
  }

  return {
    subject: `${COMPANY_NAME} – Facture suite à perte matériel (commande ${orderNum})`,
    body: `Bonjour ${v.customerName},

Lors de la vérification du retour de votre commande #${orderNum}, nous avons relevé les points suivants :
${v.notesSav || ''}

${caseBlock}

Nous restons à votre disposition pour toute précision et vous remercions d'avance pour votre prompt règlement.
${COMPANY_SIGN}`,
    to: v.customerEmail || '',
  }
}

// ── #12 — Facturation volé ─────────────────────────────────────────────────────

function facturation_vole(v: EmailTemplateVars): RenderedEmail {
  const orderNum = v.originOrderNumber || ''
  const bank = bankInfo(v.paymentLink, v.documentNumber)

  let caseBlock: string

  if (v.latePayment) {
    caseBlock = `Nous n'avons toujours pas reçu votre règlement afin de solder ce problème. Merci de procéder au paiement dans les plus brefs délais.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du remplacement.
${bank}`
  } else if (v.insurance && !v.caution && !v.amountAbove500) {
    caseBlock = `Vous avez souscrit à notre assurance.
Conformément à nos conditions générales, pour les vols inférieurs à 500 €, la totalité du prix de remplacement vous est facturée.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du remplacement.
${bank}`
  } else if (v.insurance && !v.caution && v.amountAbove500) {
    caseBlock = `Vous avez souscrit à notre assurance.
Conformément à nos conditions générales, une franchise de 20 % du montant des dommages s'applique, avec un minimum de 500 € HT.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du remplacement au prix d'achat.
${bank}`
  } else if (v.insurance && v.caution && !v.amountAbove500) {
    caseBlock = `Vous avez souscrit à notre assurance.
Conformément à nos conditions générales, pour les vols dont le montant est inférieur à 500 €, la totalité du prix de remplacement reste à votre charge.
Une caution est actuellement active ; elle sera débitée à hauteur du montant facturé.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du remplacement.`
  } else if (v.insurance && v.caution && v.amountAbove500) {
    caseBlock = `Vous avez souscrit à notre assurance.
Conformément à nos conditions générales, une franchise de 20 % du montant des dommages s'applique, avec un minimum de 500 € HT.
Une caution est actuellement active ; elle sera débitée à hauteur du montant facturé.
Vous trouverez ci-joint la facture correspondante, ainsi que le détail du remplacement au prix d'achat.`
  } else if (!v.insurance && v.caution) {
    caseBlock = `Vous n'avez pas souscrit à notre assurance.
L'intégralité du prix de remplacement au coût d'achat est donc à votre charge.
Une caution est actuellement active ; elle sera débitée à hauteur du montant facturé.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du remplacement.`
  } else {
    // !insurance && !caution
    caseBlock = `Vous n'avez pas souscrit à notre assurance.
L'intégralité du prix de remplacement au coût d'achat est donc à votre charge.
Vous trouverez ci-joint la facture correspondante, accompagnée du détail du remplacement.
${bank}`
  }

  return {
    subject: `${COMPANY_NAME} – Facture suite à anomalie retour matériel (commande ${orderNum})`,
    body: `Bonjour ${v.customerName},

Lors de la vérification du retour de votre commande #${orderNum}, nous avons relevé les points suivants :
${v.notesSav || ''}

${caseBlock}
${footer()}`,
    to: v.customerEmail || '',
  }
}

// ── Export principal ───────────────────────────────────────────────────────────

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateId, string> = {
  retour_ok:          '10 – Contrôle retour tout OK',
  retour_manquant:    '11 – Contrôle retour matériel manquant',
  retour_casse:       '12 – Contrôle retour matériel cassé',
  facturation_perdu:  '13 – Facturation matériel perdu',
  facturation_vole:   '14 – Facturation matériel volé',
  facturation_casse:  '15 – Facturation matériel cassé',
}

// ── DB seed rows ───────────────────────────────────────────────────────────────

export type EmailTemplateRow = {
  template_id: EmailTemplateId
  case_key: string
  label: string
  case_label: string
  subject: string
  body: string
  conditions: Record<string, boolean>
  sort_order: number
}

/**
 * Retourne toutes les variantes de templates pour seed DB.
 * Le body est rendu avec des marqueurs {{variable}} comme valeurs.
 */
export function getSeedRows(): EmailTemplateRow[] {
  const P: EmailTemplateVars = {
    customerName:      '{{customerName}}',
    customerEmail:     '{{customerEmail}}',
    orderNumber:       '{{orderNumber}}',
    originOrderNumber: '{{originOrderNumber}}',
    orderStartsAt:     '{{orderStartsAt}}',
    orderStopsAt:      '{{orderStopsAt}}',
    notesSav:          '{{notesSav}}',
    paymentLink:       '{{paymentLink}}',
    documentNumber:    '{{documentNumber}}',
  }

  function row(
    template_id: EmailTemplateId,
    case_key: string,
    case_label: string,
    conditions: Record<string, boolean>,
    sort_order: number,
    extra?: Partial<EmailTemplateVars>
  ): EmailTemplateRow {
    const { subject, body } = renderEmail(template_id, { ...P, ...extra })
    return { template_id, case_key, label: EMAIL_TEMPLATE_LABELS[template_id], case_label, subject, body, conditions, sort_order }
  }

  return [
    // #10 — Retour OK
    row('retour_ok', 'default', '', {}, 0),

    // #11 — Retour cassé (4 cas)
    row('retour_casse', 'no_insurance_no_caution', 'Sans assurance, sans caution',
      { insurance: false, caution: false }, 0, { insurance: false, caution: false }),
    row('retour_casse', 'insurance_no_caution', 'Avec assurance, sans caution',
      { insurance: true, caution: false }, 1, { insurance: true, caution: false }),
    row('retour_casse', 'insurance_caution', 'Avec assurance + caution',
      { insurance: true, caution: true }, 2, { insurance: true, caution: true }),
    row('retour_casse', 'no_insurance_caution', 'Sans assurance + caution',
      { insurance: false, caution: true }, 3, { insurance: false, caution: true }),

    // #11 — Retour manquant
    row('retour_manquant', 'default', '', {}, 0),

    // #12 — Facturation cassé (7 cas)
    row('facturation_casse', 'no_insurance_no_caution', 'Sans assurance, sans caution',
      { insurance: false, caution: false }, 0, { insurance: false, caution: false }),
    row('facturation_casse', 'no_insurance_caution', 'Sans assurance + caution',
      { insurance: false, caution: true }, 1, { insurance: false, caution: true }),
    row('facturation_casse', 'insurance_no_caution_low', 'Avec assurance, sans caution, < 500 €',
      { insurance: true, caution: false, amountAbove500: false }, 2, { insurance: true, caution: false, amountAbove500: false }),
    row('facturation_casse', 'insurance_no_caution_high', 'Avec assurance, sans caution, > 500 €',
      { insurance: true, caution: false, amountAbove500: true }, 3, { insurance: true, caution: false, amountAbove500: true }),
    row('facturation_casse', 'insurance_caution_low', 'Avec assurance + caution, < 500 €',
      { insurance: true, caution: true, amountAbove500: false }, 4, { insurance: true, caution: true, amountAbove500: false }),
    row('facturation_casse', 'insurance_caution_high', 'Avec assurance + caution, > 500 €',
      { insurance: true, caution: true, amountAbove500: true }, 5, { insurance: true, caution: true, amountAbove500: true }),
    row('facturation_casse', 'late_payment', 'Retard de paiement',
      { latePayment: true }, 6, { latePayment: true }),

    // #12 — Facturation perdu (5 cas)
    row('facturation_perdu', 'no_insurance_no_caution', 'Sans assurance, sans caution',
      { insurance: false, caution: false }, 0, { insurance: false, caution: false }),
    row('facturation_perdu', 'no_insurance_caution', 'Sans assurance + caution',
      { insurance: false, caution: true }, 1, { insurance: false, caution: true }),
    row('facturation_perdu', 'insurance_no_caution', 'Avec assurance, sans caution',
      { insurance: true, caution: false }, 2, { insurance: true, caution: false }),
    row('facturation_perdu', 'insurance_caution', 'Avec assurance + caution',
      { insurance: true, caution: true }, 3, { insurance: true, caution: true }),
    row('facturation_perdu', 'late_payment', 'Retard de paiement',
      { latePayment: true }, 4, { latePayment: true }),

    // #12 — Facturation volé (7 cas)
    row('facturation_vole', 'no_insurance_no_caution', 'Sans assurance, sans caution',
      { insurance: false, caution: false }, 0, { insurance: false, caution: false }),
    row('facturation_vole', 'no_insurance_caution', 'Sans assurance + caution',
      { insurance: false, caution: true }, 1, { insurance: false, caution: true }),
    row('facturation_vole', 'insurance_no_caution_low', 'Avec assurance, sans caution, < 500 €',
      { insurance: true, caution: false, amountAbove500: false }, 2, { insurance: true, caution: false, amountAbove500: false }),
    row('facturation_vole', 'insurance_no_caution_high', 'Avec assurance, sans caution, > 500 €',
      { insurance: true, caution: false, amountAbove500: true }, 3, { insurance: true, caution: false, amountAbove500: true }),
    row('facturation_vole', 'insurance_caution_low', 'Avec assurance + caution, < 500 €',
      { insurance: true, caution: true, amountAbove500: false }, 4, { insurance: true, caution: true, amountAbove500: false }),
    row('facturation_vole', 'insurance_caution_high', 'Avec assurance + caution, > 500 €',
      { insurance: true, caution: true, amountAbove500: true }, 5, { insurance: true, caution: true, amountAbove500: true }),
    row('facturation_vole', 'late_payment', 'Retard de paiement',
      { latePayment: true }, 6, { latePayment: true }),
  ]
}

/**
 * Rend un email depuis une ligne DB (remplace les {{variables}}).
 */
export function renderEmailFromRow(
  row: Pick<EmailTemplateRow, 'subject' | 'body'>,
  vars: EmailTemplateVars
): RenderedEmail {
  const replacements: Record<string, string> = {
    customerName:      vars.customerName || '',
    customerEmail:     vars.customerEmail || '',
    orderNumber:       vars.orderNumber || '',
    originOrderNumber: vars.originOrderNumber || '',
    orderStartsAt:     vars.orderStartsAt || '',
    orderStopsAt:      vars.orderStopsAt || '',
    notesSav:          vars.notesSav || '',
    paymentLink:       vars.paymentLink || '',
    documentNumber:    vars.documentNumber || '',
  }
  const replace = (str: string) =>
    str.replace(/\{\{(\w+)\}\}/g, (_, key) => replacements[key] ?? `{{${key}}}`)

  return {
    subject: replace(row.subject),
    body:    replace(row.body),
    to:      vars.customerEmail || '',
  }
}

/**
 * Génère un email à partir du template et des variables fournies.
 */
export function renderEmail(templateId: EmailTemplateId, vars: EmailTemplateVars): RenderedEmail {
  switch (templateId) {
    case 'retour_ok':         return retour_ok(vars)
    case 'retour_casse':      return retour_casse(vars)
    case 'retour_manquant':   return retour_manquant(vars)
    case 'facturation_casse': return facturation_casse(vars)
    case 'facturation_perdu': return facturation_perdu(vars)
    case 'facturation_vole':  return facturation_vole(vars)
    default:
      throw new Error(`Template inconnu : ${templateId as string}`)
  }
}
