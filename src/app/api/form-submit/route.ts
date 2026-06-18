import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_ORIGINS = new Set(
  [
    process.env.NEXT_PUBLIC_APP_URL,
    'https://filmeai.vercel.app',
    'https://filme.fr',
    'https://www.filme.fr',
    ...(process.env.FORM_ALLOWED_ORIGINS || '').split(','),
  ]
    .filter(Boolean)
    .map(origin => String(origin).trim().replace(/\/$/, ''))
)

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin')?.replace(/\/$/, '')
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return headers
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { headers: corsHeaders(req) })
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

function cleanHeader(str: string): string {
  return str.replace(/[\r\n]+/g, ' ').trim()
}

class PublicFormError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
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

function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(req) })
}

const BUCKET = 'form-attachments'
const MAX_BYTES = 20 * 1024 * 1024
const MAX_REQUEST_BYTES = MAX_BYTES + 512 * 1024

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY

  // En local uniquement, on évite de bloquer si la clé n'est pas configurée.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') return false
    console.warn('TURNSTILE_SECRET_KEY missing — Turnstile bypassed in local dev only.')
    return true
  }

  if (!token) return false

  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', token)
  if (ip && ip !== 'unknown') body.set('remoteip', ip)

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) return false

  const data = await res.json() as { success?: boolean }
  return data.success === true
}

async function uploadFile(
  supabase: ReturnType<typeof getSupabase>,
  file: File,
  convId: string
): Promise<string | null> {
  // Vérification MIME côté serveur
  if (!ALLOWED_MIME.has(file.type)) {
    throw new PublicFormError(`Type de fichier non autorisé : ${file.type || 'inconnu'}`)
  }
  if (file.size > MAX_BYTES) {
    throw new PublicFormError('Le fichier dépasse 20 Mo.')
  }

  await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => null)
  await supabase.storage.updateBucket(BUCKET, { public: false }).catch(() => null)

  // Nom non prédictible + nom original nettoyé.
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'attachment'
  const path = `${convId}/${Date.now()}_${randomUUID()}_${cleanName}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (error) { console.error('Storage upload error:', error.message); return null }

  const { data, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 30)

  if (signedError) {
    console.error('Storage signed URL error:', signedError.message)
    return null
  }

  return data.signedUrl
}

export async function POST(req: NextRequest) {
  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return json(req, { error: 'Trop de demandes. Réessayez dans une heure.' }, 429)
  }

  try {
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > MAX_REQUEST_BYTES) {
      return json(req, { error: 'La demande est trop volumineuse.' }, 413)
    }

    const formData = await req.formData()

    const key      = (formData.get('key') as string ?? '').trim()
    const name     = (formData.get('name') as string ?? '').trim().slice(0, 200)
    const email    = (formData.get('email') as string ?? '').trim().slice(0, 200)
    const phone    = (formData.get('phone') as string ?? '').trim().slice(0, 50)
    const message  = (formData.get('message') as string ?? '').trim().slice(0, 5000)
    const honeypot = (formData.get('website') as string ?? '').trim() // champ piège
    const turnstileToken = (formData.get('cf-turnstile-response') as string ?? '').trim()
    const file     = formData.get('file') as File | null

    // ── Sécurité 4 : honeypot — les bots remplissent ce champ caché ──────────
    if (honeypot) {
      // Simule un succès pour ne pas alerter le bot
      return json(req, { ok: true })
    }

    const turnstileOk = await verifyTurnstile(turnstileToken, ip)
    if (!turnstileOk) {
      return json(req, { error: 'Vérification anti-spam échouée. Rechargez la page puis réessayez.' }, 400)
    }

    if (!key || !name || !email || !message) {
      return json(req, { error: 'Champs obligatoires manquants.' }, 400)
    }

    // Validation email basique
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(req, { error: 'Adresse e-mail invalide.' }, 400)
    }

    const supabase = getSupabase()
    const orgId = await getOrgId(supabase, key)
    if (!orgId) return json(req, { error: 'Clé invalide.' }, 400)

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
      subject: `Nouvelle demande de devis — ${cleanHeader(name)}`,
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

    return json(req, { ok: true, conversation_id: conv.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('form-submit error:', message)
    if (err instanceof PublicFormError) {
      return json(req, { error: err.message }, err.status)
    }
    return json(req, { error: 'Erreur serveur. Réessayez ou contactez bonjour@filme.fr.' }, 500)
  }
}
