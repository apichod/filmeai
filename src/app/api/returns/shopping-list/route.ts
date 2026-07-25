import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * POST /api/returns/shopping-list
 * Body: { orders: Array<{ number: string|number; customer_name: string; notes_sav: string }> }
 * Retourne une liste d'achats synthétisée par IA à partir des Notes SAV.
 */
export async function POST(req: NextRequest) {
  const { orders } = await req.json() as {
    orders: Array<{ number: string | number; customer_name: string; notes_sav: string }>
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: 'Aucune order fournie' }, { status: 400 })
  }

  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  const notesBlock = orders
    .filter(o => o.notes_sav?.trim())
    .map(o => `- Order #${o.number} (${o.customer_name}) : ${o.notes_sav.trim()}`)
    .join('\n')

  if (!notesBlock) {
    return NextResponse.json({ list: 'Aucune note SAV renseignée sur ces orders.' })
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: `Tu es un assistant pour Filme, société de location de matériel audiovisuel.
Tu reçois les notes SAV d'orders en attente de remplacement de matériel (tag R33).
Ton rôle : synthétiser une liste d'achats claire et actionnable pour l'équipe, à la date du jour.

RÈGLES :
- Regroupe les articles similaires (même produit mentionné plusieurs fois = 1 ligne avec quantité)
- Indique le numéro d'order et le client en référence pour chaque ligne
- Format : liste à puces, courte et lisible
- Si une note est vague, note-le
- Commence par un résumé en une phrase (ex: "3 articles à racheter au total")
- Réponds en français`,
      },
      {
        role: 'user',
        content: `Date du jour : ${today}

Notes SAV des orders R33 (À remplacer) :
${notesBlock}`,
      },
    ],
  })

  const list = completion.choices[0].message.content ?? 'Erreur lors de la génération.'
  return NextResponse.json({ list })
}
