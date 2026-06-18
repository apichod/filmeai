'use client'
import { useState, useEffect, useCallback } from 'react'

type LogEntry = {
  id: string
  user_email: string | null
  action: string
  target_id: string | null
  created_at: string
}

type ApiResponse = {
  logs: LogEntry[]
  total: number
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function SettingsActivityPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [actions, setActions] = useState<string[]>([])
  const [users, setUsers] = useState<string[]>([])

  const load = useCallback(async (action: string, user: string) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '100' })
    if (action) params.set('action', action)
    if (user) params.set('user', user)
    try {
      const res = await fetch(`/api/activity?${params}`)
      const data = await res.json() as ApiResponse
      setLogs(data.logs ?? [])
      setTotal(data.total ?? 0)

      if (!action && !user) {
        const allActions = Array.from(new Set((data.logs ?? []).map(l => l.action))).sort()
        const allUsers = Array.from(new Set((data.logs ?? []).map(l => l.user_email).filter(Boolean) as string[])).sort()
        setActions(allActions)
        setUsers(allUsers)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(actionFilter, userFilter) }, [load, actionFilter, userFilter])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-base font-semibold text-gray-900">Activité</h1>
        <p className="text-xs text-gray-500 mt-0.5">Le journal des actions importantes réalisées dans votre espace.</p>
      </div>

      {/* Filtres */}
      <div className="flex gap-3">
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black"
        >
          <option value="">Toutes les actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-black"
        >
          <option value="">Tous les utilisateurs</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 w-52">Date</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 w-52">Utilisateur</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Action</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Cible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">
                  Chargement…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">
                  Aucune activité enregistrée.
                </td>
              </tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                  <td className="px-5 py-3 text-xs text-gray-700">{log.user_email ?? '—'}</td>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{log.action}</td>
                  <td className="px-5 py-3 text-xs text-gray-400 font-mono truncate max-w-xs">{log.target_id ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && total > logs.length && (
          <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
            {logs.length} sur {total} entrées
          </div>
        )}
      </div>
    </div>
  )
}
