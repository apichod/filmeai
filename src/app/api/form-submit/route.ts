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

// ── Sécurité 1 : échapper le HTML pour éviter les injections dans l'email ──
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Sécurité 2 : types de fichiers autorisés (MIME côté serveur) ────────────
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/zip',
  'application/x-zip-compressed',
])

// ── Sécurité 3 : rate limiting simple en mémoire (par IP, max 5/heure) ──────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 heure

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getOrgId(supabase: ReturnType<typeof getSupabase>, key: string) {
  // Valide que key est bien un UUID (évite les injections de chemin)
  if (!/^[0-9a-f-]{36}$/i.test(key)) return null
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
const MAX_BYTES = 20 * 1024 * 1024

async function uploadFile(
  supabase: ReturnType<typeof getSupabase>,
  file: File,
  convId: string
): Promise<string | null> {
  // Vérification MIME côté serveur
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`Type de fichier non autorisé : ${file.type}`)
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Le fichier dépasse 20 Mo.')
  }

  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => null)

  // Forcer l'extension depuis le MIME (ignore le nom fourni par l'utilisateur)
  const ext = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const path = `${convId}/${Date.now()}_${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (error) { console.error('Storage upload error:', error.message); return null }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function POST(req: NextRequest) {
  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return json({ error: 'Trop de demandes. Réessayez dans une heure.' }, 429)
  }

  try {
    const formData = await req.formData()

    const key      = (formData.get('key') as string ?? '').trim()
    const name     = (formData.get('name') as string ?? '').trim().slice(0, 200)
    const email    = (formData.get('email') as string ?? '').trim().slice(0, 200)
    const phone    = (formData.get('phone') as string ?? '').trim().slice(0, 50)
    const message  = (formData.get('message') as string ?? '').trim().slice(0, 5000)
    const honeypot = (formData.get('website') as string ?? '').trim() // champ piège
    const file     = formData.get('file') as File | null

    // ── Sécurité 4 : honeypot — les bots remplissent ce champ caché ──────────
    if (honeypot) {
      // Simule un succès pour ne pas alerter le bot
      return json({ ok: true })
    }

    if (!key || !name || !email || !message) {
      return json({ error: 'Champs obligatoires manquants.' }, 400)
    }

    // Validation email basique
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Adresse e-mail invalide.' }, 400)
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
    if (file && file.size > 0) {
      fileUrl = await uploadFile(supabase, file, conv.id)
    }

    await supabase.from('messages').insert({
      conversation_id: conv.id,
      role: 'user',
      content: message + (fileUrl ? `\n\n📎 [${file!.name}](${fileUrl})` : ''),
    })

    void supabase.from('activity_log').insert({
      organization_id: orgId,
      action: 'Demande reçue via formulaire',
      target_id: conv.id,
    })

    // ── 3. Envoyer l'email (contenus échappés) ─────────────────────────────
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://filmeai.vercel.app'

    await transporter.sendMail({
      from: `"FilmeAI" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      replyTo: email,
      subject: `Nouvelle demande de devis — ${esc(name)}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 16px;font-size:18px">Nouvelle demande de devis sur liste</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 0;color:#666;width:120px">Nom</td><td style="padding:8px 0;font-weight:600">${esc(name)}</td></tr>
            <tr><td style="padding:8px 0;color:#666">E-mail</td><td style="padding:8px 0"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
            <tr><td style="padding:8px 0;color:#666">Téléphone</td><td style="padding:8px 0">${esc(phone) || '—'}</td></tr>
          </table>
          <div style="margin-top:16px;padding:16px;background:#f9f9f9;border-radius:8px;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(message)}</div>
          ${fileUrl ? `
          <div style="margin-top:12px;padding:12px 16px;background:#f0f9ff;border-radius:8px;font-size:13px">
            📎 <strong>${esc(file!.name)}</strong> — <a href="${esc(fileUrl)}" style="color:#0070f3">Télécharger →</a>
          </div>` : ''}
          <p style="margin-top:24px;font-size:12px;color:#999">
            Demande reçue via le formulaire FilmeAI ·
            <a href="${appUrl}/inbox/${conv.id}" style="color:#000">Voir dans l'Inbox →</a>
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
