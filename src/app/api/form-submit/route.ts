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

const BUCKET = 'form-attachments'
const MAX_BYTES = 20 * 1024 * 1024 // 20 Mo

async function uploadFile(
  supabase: ReturnType<typeof getSupabase>,
  file: File,
  convId: string
): Promise<string | null> {
  if (file.size > MAX_BYTES) return null

  // Crée le bucket s'il n'existe pas encore
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => null)

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${convId}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (error) { console.error('Storage upload error:', error.message); return null }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()

    const key     = formData.get('key') as string
    const name    = formData.get('name') as string
    const email   = formData.get('email') as string
    const phone   = (formData.get('phone') as string) || ''
    const message = formData.get('message') as string
    const file    = formData.get('file') as File | null

    if (!key || !name || !email || !message) {
      return json({ error: 'Champs obligatoires manquants.' }, 400)
    }

    const supabase = getSupabase()
    const orgId = await getOrgId(supabase, key)
    if (!orgId) return json({ error: 'Clé invalide.' }, 400)

    // ── 1. Créer la conversation ───────────────────────────────────────────
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

    // ── 2. Upload fichier (optionnel) ──────────────────────────────────────
    let fileUrl: string | null = null
    let fileInfo = ''
    if (file && file.size > 0) {
      if (file.size > MAX_BYTES) {
        return json({ error: 'Le fichier dépasse 20 Mo.' }, 400)
      }
      fileUrl = await uploadFile(supabase, file, conv.id)
      if (fileUrl) {
        fileInfo = `\n\n📎 Fichier joint : ${file.name} (${(file.size / 1024).toFixed(0)} Ko)\n${fileUrl}`
      }
    }

    // Ajouter le message initial
    await supabase.from('messages').insert({
      conversation_id: conv.id,
      role: 'user',
      content: message + (fileUrl ? `\n\n📎 [${file!.name}](${fileUrl})` : ''),
    })

    // Log activité
    void supabase.from('activity_log').insert({
      organization_id: orgId,
      action: 'Demande reçue via formulaire',
      target_id: conv.id,
    })

    // ── 3. Envoyer l'email ─────────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://filmeai.vercel.app'

    await transporter.sendMail({
      from: `"FilmeAI" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
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
          ${fileUrl ? `
          <div style="margin-top:12px;padding:12px 16px;background:#f0f9ff;border-radius:8px;font-size:13px">
            📎 <strong>${file!.name}</strong> — <a href="${fileUrl}" style="color:#0070f3">Télécharger le fichier →</a>
          </div>` : ''}
          <p style="margin-top:24px;font-size:12px;color:#999">
            Demande reçue via le formulaire FilmeAI ·
            <a href="${appUrl}/inbox/${conv.id}" style="color:#000">Voir dans l&apos;Inbox →</a>
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
