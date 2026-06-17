'use client'

import { useState, useEffect, useCallback } from 'react'

type Member = {
  id: string
  email: string
  name: string
  role: 'admin' | 'operator'
  status: 'pending' | 'active'
  invited_at: string
  joined_at: string | null
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm font-semibold shrink-0">
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
      role === 'admin'
        ? 'bg-gray-100 text-gray-700 border-gray-200'
        : 'bg-blue-50 text-blue-700 border-blue-100'
    }`}>
      {role === 'admin' ? 'Admin' : 'Opérateur'}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return null
  return (
    <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-amber-50 text-amber-700 border-amber-100">
      En attente
    </span>
  )
}

export default function SettingsCollaboratorsPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'operator'>('operator')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/collaborators')
    const data = await res.json() as { members?: Member[] }
    setMembers(data.members || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  async function invite() {
    setError('')
    setSuccess('')
    if (!inviteEmail.includes('@')) { setError('Email invalide.'); return }
    setInviting(true)

    const res = await fetch('/api/collaborators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    })
    const data = await res.json() as { error?: string }

    if (!res.ok) {
      setError(data.error || 'Erreur lors de l'invitation.')
    } else {
      setSuccess(`Invitation envoyée à ${inviteEmail}.`)
      setInviteEmail('')
      await fetchMembers()
    }
    setInviting(false)
  }

  async function remove(memberId: string) {
    if (!confirm('Retirer ce membre de l'équipe ?')) return
    setRemoving(memberId)
    await fetch('/api/collaborators', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    })
    setRemoving(null)
    await fetchMembers()
  }

  const active = members.filter(m => m.status === 'active')
  const pending = members.filter(m => m.status === 'pending')

  return (
    <div className="max-w-2xl space-y-5">

      {/* ── Inviter ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Inviter un collaborateur</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Un email d'invitation sera envoyé. Le collaborateur pourra se connecter avec ce compte.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={e => { setInviteEmail(e.target.value); setError(''); setSuccess('') }}
            onKeyDown={e => e.key === 'Enter' && invite()}
            placeholder="email@entreprise.fr"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />

          {/* Sélecteur de rôle */}
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value as 'admin' | 'operator')}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-black bg-white"
          >
            <option value="operator">Opérateur</option>
            <option value="admin">Admin</option>
          </select>

          <button
            onClick={invite}
            disabled={inviting}
            className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 shrink-0"
          >
            {inviting ? 'Envoi…' : 'Inviter'}
          </button>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
        {success && <p className="text-xs text-green-600">{success}</p>}
      </div>

      {/* ── Membres actifs ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Membres de l&apos;équipe
            {active.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">{active.length}</span>
            )}
          </h2>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">Chargement…</div>
        ) : active.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            Aucun membre actif pour l&apos;instant.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {active.map(m => (
              <div key={m.id} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3">
                  <Avatar name={m.name || m.email} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.name || m.email.split('@')[0]}</p>
                    <p className="text-xs text-gray-400">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <RoleBadge role={m.role} />
                  {m.role !== 'admin' && (
                    <button
                      onClick={() => remove(m.id)}
                      disabled={removing === m.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                    >
                      {removing === m.id ? '…' : 'Retirer'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Invitations en attente ── */}
      {pending.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              Invitations en attente
              <span className="ml-2 text-xs font-normal text-gray-400">{pending.length}</span>
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {pending.map(m => (
              <div key={m.id} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3">
                  <Avatar name={m.email} />
                  <div>
                    <p className="text-sm text-gray-700">{m.email}</p>
                    <p className="text-xs text-gray-400">
                      Invité le {new Date(m.invited_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <RoleBadge role={m.role} />
                  <StatusBadge status={m.status} />
                  <button
                    onClick={() => remove(m.id)}
                    disabled={removing === m.id}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                  >
                    {removing === m.id ? '…' : 'Annuler'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
