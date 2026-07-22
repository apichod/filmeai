import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const { instruction, subject, body } = await req.json() as {
    instruction: string
    subject: string
    body: string
  }

  if (!instruction || !subject || !body) {
    return NextResponse.json({ error: 'instruction, subject et body requis' }, { status: 400 })
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Tu es un expert en rédaction d'emails professionnels pour une société de location de matériel audiovisuel (Filme).
Ton rôle est de modifier un email selon l'instruction de l'opérateur.
RÈGLES ABSOLUES :
- Conserve les variables Booqable entre doubles accolades {{comme_ça}} EXACTEMENT telles quelles — ne les modifie JAMAIS.
- Conserve la structure générale de l'email.
- Réponds UNIQUEMENT avec un JSON { "subject": "...", "body": "..." }.`,
      },
      {
        role: 'user',
        content: `Instruction : ${instruction}

Email actuel :
Objet : ${subject}
---
${body}`,
      },
    ],
  })

  try {
    const result = JSON.parse(completion.choices[0].message.content ?? '{}') as { subject?: string; body?: string }
    return NextResponse.json({ subject: result.subject ?? subject, body: result.body ?? body })
  } catch {
    return NextResponse.json({ error: 'Réponse IA invalide' }, { status: 500 })
  }
}
