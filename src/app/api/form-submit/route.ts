import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS })
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getOrgId(supabase: ReturnType<typeof getSupabase>, key: string) {
  // key = organization_id UUID
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', key)
    .maybeSingle()
  return data?.id ?? null
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      key: string
      name: string
      email: string
      phone: string
      message: string
    }

    const { key, name, email, phone, message } = body
    if (!key || !name || !email || !message) {
      return json({ error: 'Champs obligatoires manquants.' }, 400)
    }

    const supabase = getSupabase()
    const orgId = await getOrgId(supabase, key)
    if (!orgId) return json({ error: 'Clé invalide.' }, 400)

    // ── 1. Créer la conversation dans l'Inbox ──────────────────────────────
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        organization_id: orgId,
        contact_name: name,
        contact_email: email,
        contact_phone: phone || null,
        status: 'open',
        source: 'form',
        request_context: message,
      })
      .select('id')
      .single()

    if (convErr) throw new Error(convErr.message)

    // Ajouter le message initial
    await supabase.from('messages').insert({
      conversation_id: conv.id,
      role: 'user',
      content: message,
    })

    // Log activité
    void supabase.from('activity_log').insert({
      organization_id: orgId,
      action: 'Demande reçue via formulaire',
      target_id: conv.id,
    })

    // ── 2. Envoyer l'email ─────────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    await transporter.sendMail({
      from: `"FilmeAI" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER, // location@filme.fr
      replyTo: email,
      subject: `Nouvelle demande de devis — ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 16px;font-size:18px">Nouvelle demande de devis sur liste</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 0;color:#666;width:120px">Nom</td><td style="padding:8px 0;font-weight:600">${name}</td></tr>
            <tr><td style="padding:8px 0;color:#666">E-mail</td><td style="padding:8px 0"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:8px 0;color:#666">Téléphone</td><td style="padding:8px 0">${phone || '—'}</td></tr>
          </table>
          <div style="margin-top:16px;padding:16px;background:#f9f9f9;border-radius:8px;font-size:14px;line-height:1.6;white-space:pre-wrap">${message}</div>
          <p style="margin-top:24px;font-size:12px;color:#999">
            Demande reçue via le formulaire FilmeAI ·
            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://filmeai.vercel.app'}/inbox/${conv.id}" style="color:#000">Voir dans l'Inbox →</a>
          </p>
        </div>
      `,
    })

    return json({ ok: true, conversation_id: conv.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('form-submit error:', message)
    return json({ error: message }, 500)
  }
}
