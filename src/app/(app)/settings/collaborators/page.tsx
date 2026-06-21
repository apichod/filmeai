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
  permissions: string[]
}

const NAV_PERMISSIONS = [
  { key: 'dashboard',  label: 'Tableau de bord' },
  { key: 'inbox',      label: 'Inbox' },
  { key: 'contacts',   label: 'Contacts' },
  { key: 'requests',   label: 'Assistant planning' },
  { key: 'assistant',  label: 'Paramètres' },
  { key: 'statistics', label: 'Statistiques' },
]

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

function PermissionToggles({
  member,
  onUpdate,
}: {
  member: Member
  onUpdate: (id: string, permissions: string[]) => Promise<boolean>
}) {
  const [permissions, setPermissions] = useState<string[]>(member.permissions || [])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  function toggle(key: string) {
    setPermissions(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
    setDirty(true)
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError('')
    const ok = await onUpdate(member.id, permissions)
    setSaving(false)
    if (ok) {
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      setError('Erreur lors de la sauvegarde.')
    }
  }

  return (
    <div className="px-6 pb-4 pt-1 border-t border-gray-50 bg-gray-50/50">
      <p className="text-xs text-gray-500 mb-3">Modules accessibles</p>
      <div className="flex flex-wrap gap-2">
        {NAV_PERMISSIONS.map(nav => {
          const active = permissions.includes(nav.key)
          return (
            <button
              key={nav.key}
              onClick={() => toggle(nav.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                active
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-gray-300'}`} />
              {nav.label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3 mt-3">
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="bg-black text-white rounded-lg px-4 py-1.5 text-xs font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
        {saved && !dirty && <span className="text-xs text-green-600">Enregistré ✓</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Mot de passe toujours accessible, indépendamment des modules cochés.
      </p>
    </div>
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
  const [resending, setResending] = useState<string | null>(null)
  const [resendOk, setResendOk] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

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
      setError(data.error || "Erreur lors de l'invitation.")
    } else {
      setSuccess(`Invitation envoyée à ${inviteEmail}.`)
      setInviteEmail('')
      await fetchMembers()
    }
    setInviting(false)
  }

  async function updatePermissions(memberId: string, permissions: string[]): Promise<boolean> {
    const res = await fetch('/api/collaborators', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, permissions }),
    })
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      console.error('Permissions update error:', data.error)
      return false
    }
    setMembers(prev =>
      prev.map(m => m.id === memberId ? { ...m, permissions } : m)
    )
    return true
  }

  async function resendInvite(memberId: string, email: string) {
    setResending(memberId)
    const res = await fetch('/api/collaborators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, resend: true }),
    })
    const data = await res.json() as { error?: string }
    setResending(null)
    if (!res.ok) {
      alert(data.error || "Erreur lors du renvoi.")
    } else {
      setResendOk(memberId)
      setTimeout(() => setResendOk(null), 3000)
    }
  }

  async function remove(memberId: string) {
    if (!confirm("Retirer ce membre de l'équipe ?")) return
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
            Un email d&apos;invitation sera envoyé. Le collaborateur pourra se connecter avec ce compte.
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
              <div key={m.id}>
                <div
                  className={`flex items-center justify-between px-6 py-3.5 ${
                    m.role === 'operator' ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''
                  }`}
                  onClick={() => {
                    if (m.role !== 'operator') return
                    setExpanded(expanded === m.id ? null : m.id)
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name || m.email} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.name || m.email.split('@')[0]}</p>
                      <p className="text-xs text-gray-400">{m.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <RoleBadge role={m.role} />
                    {m.role === 'operator' && (
                      <span className="text-xs text-gray-400">
                        {(m.permissions || []).length}/{NAV_PERMISSIONS.length} modules
                      </span>
                    )}
                    {m.role === 'operator' && (
                      <svg
                        className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded === m.id ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    {m.role !== 'admin' && (
                      <button
                        onClick={e => { e.stopPropagation(); remove(m.id) }}
                        disabled={removing === m.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                      >
                        {removing === m.id ? '…' : 'Retirer'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable permissions panel */}
                {m.role === 'operator' && expanded === m.id && (
                  <PermissionToggles member={m} onUpdate={updatePermissions} />
                )}
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
                    onClick={() => resendInvite(m.id, m.email)}
                    disabled={resending === m.id}
                    className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40"
                  >
                    {resending === m.id ? '…' : resendOk === m.id ? 'Envoyé ✓' : 'Renvoyer'}
                  </button>
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
