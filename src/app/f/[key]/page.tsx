'use client'
import { useCallback, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import TurnstileField from '@/components/TurnstileField'

type Status = 'idle' | 'sending' | 'success' | 'error'

const MAX_MB = 20
const MAX_BYTES = MAX_MB * 1024 * 1024

export default function FormPage() {
  const params = useParams()
  const key = params.key as string

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const handleTurnstile = useCallback((token: string) => setTurnstileToken(token), [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFileError('')
    if (f && f.size > MAX_BYTES) {
      setFileError(`Le fichier dépasse ${MAX_MB} Mo.`)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setFile(f)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (fileError) return
    setStatus('sending')
    setErrorMsg('')
    try {
      const fd = new FormData()
      fd.append('key', key)
      fd.append('name', name)
      fd.append('first_name', name)
      fd.append('email', email)
      fd.append('phone', phone)
      fd.append('company', company)
      fd.append('start_date', startDate)
      fd.append('end_date', endDate)
      fd.append('message', message)
      fd.append('website', '') // honeypot
      fd.append('cf-turnstile-response', turnstileToken)
      if (file) fd.append('file', file)

      const res = await fetch('/api/form-submit', { method: 'POST', body: fd })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? 'Une erreur est survenue.')
        setStatus('error')
      } else {
        setStatus('success')
      }
    } catch {
      setErrorMsg('Erreur réseau. Réessayez.')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700 }}>Demande envoyée !</h2>
          <p style={{ margin: 0, color: '#555', fontSize: 14, lineHeight: 1.6 }}>
            Nous avons bien reçu votre demande et vous recontacterons dans les plus brefs délais.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>Devis sur liste</h1>
        <p style={{ margin: 0, color: '#555', fontSize: 14, lineHeight: 1.6 }}>
          Renseignez vos coordonnées, vos dates et votre liste de matériel : notre équipe revient vers vous avec un devis.
        </p>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Coordonnées */}
        <div>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#888', textTransform: 'uppercase' }}>Vos coordonnées</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Prénom et nom *</label>
              <input required value={name} onChange={e => setName(e.target.value)}
                style={inputStyle} placeholder="Camille Dupont" autoComplete="name" />
            </div>
            <div>
              <label style={labelStyle}>Société</label>
              <input value={company} onChange={e => setCompany(e.target.value)}
                style={inputStyle} placeholder="Nom de votre société" autoComplete="organization" />
            </div>
            <div>
              <label style={labelStyle}>E-mail *</label>
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                style={inputStyle} placeholder="camille@exemple.com" autoComplete="email" />
            </div>
            <div>
              <label style={labelStyle}>Téléphone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                style={inputStyle} placeholder="06 12 34 56 78" autoComplete="tel" />
            </div>
          </div>
        </div>

        {/* Dates */}
        <div>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#888', textTransform: 'uppercase' }}>Dates de location</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Début de location *</label>
              <input required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Fin de location *</label>
              <input required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Liste matériel */}
        <div>
          <label style={labelStyle}>Votre liste de matériel *</label>
          <textarea required value={message} onChange={e => setMessage(e.target.value)}
            rows={7} style={{ ...inputStyle, resize: 'vertical' }}
            placeholder={"Un article par ligne, ex. :\n2x Sony FX6\n1x Sony FE 24-70mm\n3x trépieds\nMicro HF"} />
        </div>

        {/* Fichier joint */}
        <div>
          <input ref={fileRef} type="file" onChange={handleFile} style={{ display: 'none' }}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.zip" />
          <button type="button" onClick={() => fileRef.current?.click()}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#2563eb', fontSize: 14, textDecoration: 'underline' }}>
            {file ? `📎 ${file.name} (${(file.size / 1024).toFixed(0)} Ko)` : 'Joindre un fichier (PDF, TXT, CSV)'}
          </button>
          {file && (
            <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
              style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 13 }}>×</button>
          )}
          {fileError && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>{fileError}</p>}
          {!fileError && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>Jusqu&apos;à {MAX_MB} Mo.</p>}
        </div>

        <TurnstileField onVerify={handleTurnstile} />

        {status === 'error' && (
          <p style={{ margin: 0, fontSize: 13, color: '#dc2626', padding: '10px 12px', background: '#fef2f2', borderRadius: 8 }}>
            {errorMsg}
          </p>
        )}

        <button type="submit" disabled={status === 'sending'} style={btnStyle(status === 'sending')}>
          {status === 'sending' ? 'Envoi en cours…' : 'Envoyer ma demande'}
        </button>

        <p style={{ margin: 0, fontSize: 11, color: '#999', textAlign: 'center' }}>
          Les champs marqués * sont obligatoires.
        </p>
      </form>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  padding: '32px 24px',
  maxWidth: 560,
  margin: '0 auto',
  color: '#111',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#111',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 14,
  border: '1px solid #e5e7eb', borderRadius: 10, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit', color: '#111', background: '#fff',
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '14px', fontSize: 15, fontWeight: 600,
    background: disabled ? '#555' : '#2563eb', color: '#fff',
    border: 'none', borderRadius: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
