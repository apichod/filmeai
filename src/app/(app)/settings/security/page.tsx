'use client'
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function SettingsSecurityPage() {
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (newPw.length < 8) {
      setError('8 caractères minimum.')
      return
    }
    if (newPw !== confirmPw) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setSaving(true)
    const supabase = getSupabase()
    const { error: err } = await supabase.auth.updateUser({ password: newPw })
    setSaving(false)
    if (err) {
      setError(err.message)
    } else {
      setSaved(true)
      setNewPw('')
      setConfirmPw('')
      setTimeout(() => setSaved(false), 3000)
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Changer le mot de passe</h2>
          <p className="text-xs text-gray-500 mt-0.5">Les autres appareils connectés seront déconnectés.</p>
        </div>

        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">
            Mot de passe mis à jour ✓
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Nouveau mot de passe</label>
          <input
            type="password"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            required
            minLength={8}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black hover:border-gray-300"
            placeholder="••••••••"
          />
          <p className="text-xs text-gray-400 mt-1">8 caractères minimum.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Confirmer le nouveau mot de passe</label>
          <input
            type="password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black hover:border-gray-300"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="bg-black text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {saving ? 'Modification…' : 'Changer le mot de passe'}
        </button>
      </form>
    </div>
  )
}
