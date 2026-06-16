'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Stats {
  total_conversations: number
  total_quotes: number
  contacts: number
}

interface Conversation {
  id: string
  contact_name: string | null
  contact_email: string | null
  booqable_order_id: string | null
  updated_at: string
  last_message: { content: string; role: string; created_at: string } | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getDisplayName(name: string | null, email: string | null): string {
  return name || email || 'Visiteur anonyme'
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/stats').then(r => r.json()),
      fetch('/api/conversations').then(r => r.json()),
    ])
      .then(([statsData, convsData]: [Stats, Conversation[]]) => {
        setStats(statsData)
        setConversations(Array.isArray(convsData) ? convsData.slice(0, 8) : [])
      })
      .catch(() => {
        setStats({ total_conversations: 0, total_quotes: 0, contacts: 0 })
        setConversations([])
      })
      .finally(() => setLoading(false))
  }, [])

  const statCards = [
    {
      label: 'Conversations',
      value: loading ? '—' : String(stats?.total_conversations ?? 0),
      change: null,
    },
    {
      label: 'Devis générés',
      value: loading ? '—' : String(stats?.total_quotes ?? 0),
      change: null,
    },
    {
      label: 'Taux de conversion',
      value: '—',
      change: null,
      mock: true,
    },
    {
      label: 'Valeur totale devis',
      value: '—',
      change: null,
      mock: true,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Tableau de bord</h1>
        <p className="text-sm text-gray-500 mt-0.5">Bienvenue, voici l&apos;activité de votre assistant FilmeAI.</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {statCards.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-semibold mt-2 ${loading ? 'text-gray-300' : 'text-gray-900'}`}>
              {s.value}
            </p>
            {s.mock && (
              <p className="text-xs text-gray-400 mt-1">Bientôt disponible</p>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Conversations récentes</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium">Contact</th>
              <th className="text-left px-6 py-3 font-medium">Dernier message</th>
              <th className="text-left px-6 py-3 font-medium">Devis</th>
              <th className="text-left px-6 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-6 py-3"><div className="h-3.5 bg-gray-200 rounded animate-pulse w-28" /></td>
                  <td className="px-6 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-48" /></td>
                  <td className="px-6 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-12" /></td>
                  <td className="px-6 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-20" /></td>
                </tr>
              ))
            ) : conversations.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-400">
                  Aucune conversation pour l&apos;instant.
                </td>
              </tr>
            ) : (
              conversations.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3">
                    <Link href={`/inbox/${c.id}`} className="text-sm font-medium text-gray-900 hover:underline">
                      {getDisplayName(c.contact_name, c.contact_email)}
                    </Link>
                    {c.contact_email && (
                      <p className="text-xs text-gray-500">{c.contact_email}</p>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600 max-w-xs truncate">
                    {c.last_message?.content || '—'}
                  </td>
                  <td className="px-6 py-3">
                    {c.booqable_order_id ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                        Oui
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500">{formatDate(c.updated_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
