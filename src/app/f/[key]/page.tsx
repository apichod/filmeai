'use client'
import { useState, useRef } from 'react'
import { useParams } from 'next/navigation'

type Status = 'idle' | 'sending' | 'success' | 'error'

const MAX_MB = 20
const MAX_BYTES = MAX_MB * 1024 * 1024

export default function FormPage() {
  const params = useParams()
  const key = params.key as string

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

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
      fd.append('email', email)
      fd.append('phone', phone)
      fd.append('message', message)
      fd.append('website', '') // honeypot — toujours vide pour les humains
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

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '32px 24px', maxWidth: 560, margin: '0 auto', color: '#111' }}>

      {status === 'success' ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>Demande envoyée !</h2>
          <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
            Nous avons bien reçu votre demande de devis et vous recontacterons dans les plus brefs délais.
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>Devis sur liste</h1>
            <p style={{ margin: 0, color: '#555', fontSize: 14, lineHeight: 1.5 }}>
              Votre liste contient des équipements conséquents ? Envoyez-la nous et nous vous fournirons un devis compétitif dans les plus brefs délais.
            </p>
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Honeypot — invisible pour les humains, les bots le remplissent */}
            <input name="website" type="text" tabIndex={-1} autoComplete="off"
              style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0 }} />

            <div>
              <label style={labelStyle}>Prénom et Nom *</label>
              <input required value={name} onChange={e => setName(e.target.value)}
                style={inputStyle} placeholder="Jean Dupont" />
            </div>

            <div>
              <label style={labelStyle}>E-mail *</label>
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                style={inputStyle} placeholder="jean@exemple.fr" />
            </div>

            <div>
              <label style={labelStyle}>Téléphone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                style={inputStyle} placeholder="+33 6 00 00 00 00" />
            </div>

            {/* Fichier */}
            <div>
              <label style={labelStyle}>Joindre un fichier <span style={{ fontWeight: 400, color: '#888' }}>(facultatif)</span></label>
              <div
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#fff',
                  cursor: 'pointer',
                }}
                onClick={() => fileRef.current?.click()}
              >
                <span style={{
                  fontSize: 12, fontWeight: 500,
                  background: '#f3f4f6', border: '1px solid #d1d5db',
                  borderRadius: 6, padding: '4px 10px', whiteSpace: 'nowrap',
                }}>
                  Choisir un fichier
                </span>
                <span style={{ fontSize: 13, color: file ? '#111' : '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file ? `${file.name} (${(file.size / 1024).toFixed(0)} Ko)` : 'Aucun fichier choisi'}
                </span>
                {file && (
                  <button type="button" onClick={e => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, lineHeight: 1 }}>
                    ×
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" onChange={handleFile}
                style={{ display: 'none' }}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.zip" />
              {fileError
                ? <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>{fileError}</p>
                : <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>Vous pouvez ajouter un fichier jusqu&apos;à {MAX_MB} Mo.</p>
              }
            </div>

            <div>
              <label style={labelStyle}>Votre liste / message *</label>
              <textarea required value={message} onChange={e => setMessage(e.target.value)}
                rows={6} style={{ ...inputStyle, resize: 'vertical' }}
                placeholder={"Sony FX3 × 1\nObjectif 24-70mm f/2.8 × 1\nTrépied vidéo × 1\n\nDates : du 20 au 22 juillet 2026"} />
            </div>

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
        </>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: '#333',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 14,
  border: '1px solid #d1d5db', borderRadius: 8, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit', color: '#111', background: '#fff',
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '12px', fontSize: 14, fontWeight: 600,
    background: disabled ? '#555' : '#000', color: '#fff',
    border: 'none', borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
  }
}
