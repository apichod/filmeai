'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'

type Status = 'idle' | 'sending' | 'success' | 'error'

export default function FormPage() {
  const params = useParams()
  const key = params.key as string

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/form-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, name, email, phone, message }),
      })
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

            <div>
              <label style={labelStyle}>Prénom et Nom *</label>
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                style={inputStyle}
                placeholder="Jean Dupont"
              />
            </div>

            <div>
              <label style={labelStyle}>E-mail *</label>
              <input
                required
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inputStyle}
                placeholder="jean@exemple.fr"
              />
            </div>

            <div>
              <label style={labelStyle}>Téléphone</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                style={inputStyle}
                placeholder="+33 6 00 00 00 00"
              />
            </div>

            <div>
              <label style={labelStyle}>Votre liste / message *</label>
              <textarea
                required
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={6}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder={"Sony FX3 × 1\nObjectif 24-70mm f/2.8 × 1\nTrépied vidéo × 1\n\nDates : du 20 au 22 juillet 2026"}
              />
            </div>

            {status === 'error' && (
              <p style={{ margin: 0, fontSize: 13, color: '#dc2626', padding: '10px 12px', background: '#fef2f2', borderRadius: 8 }}>
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              style={btnStyle(status === 'sending')}
            >
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
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
  color: '#333',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  border: '1px solid #d1d5db',
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  color: '#111',
  background: '#fff',
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '12px',
    fontSize: 14,
    fontWeight: 600,
    background: disabled ? '#555' : '#000',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s',
  }
}
