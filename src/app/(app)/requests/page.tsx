'use client'

import { useEffect, useState } from 'react'

interface Conversation {
  id: string
  contact_name: string | null
  contact_email: string | null
  booqable_order_id: string | null
  booqable_order_url: string | null
  updated_at: string
  last_message: { content: string; role: string; created_at: string } | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getDisplayName(name: string | null, email: string | null): string {
  return name || email || 'Visiteur anonyme'
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/conversations')
      .then(r => r.json())
      .then((data: Conversation[]) => {
        if (!Array.isArray(data)) { setRequests([]); return }
        // Only show conversations with a Booqable order
        setRequests(data.filter(c => c.booqable_order_id))
      })
      .catch(() => setRequests([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Demandes &amp; devis</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {loading ? 'Chargement…' : `${requests.length} devis généré${requests.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium">Contact</th>
              <th className="text-left px-6 py-3 font-medium">Dernier message</th>
              <th className="text-left px-6 py-3 font-medium">Date</th>
              <th className="text-left px-6 py-3 font-medium">Lien Booqable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-6 py-3">
                    <div className="h-3.5 bg-gray-200 rounded animate-pulse w-28 mb-1" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-36" />
                  </td>
                  <td className="px-6 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-48" /></td>
                  <td className="px-6 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-20" /></td>
                  <td className="px-6 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-16" /></td>
                </tr>
              ))
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-400">
                  Aucun devis généré pour l&apos;instant.
                </td>
              </tr>
            ) : (
              requests.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3">
                    <p className="text-sm font-medium text-gray-900">
                      {getDisplayName(r.contact_name, r.contact_email)}
                    </p>
                    {r.contact_email && (
                      <p className="text-xs text-gray-500">{r.contact_email}</p>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600 max-w-xs truncate">
                    {r.last_message?.content || '—'}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500">{formatDate(r.updated_at)}</td>
                  <td className="px-6 py-3">
                    {r.booqable_order_url ? (
                      <a
                        href={r.booqable_order_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-500 hover:text-gray-900 underline"
                      >
                        Voir →
                      </a>
                    ) : (
                      <span className="text-xs font-mono text-gray-500">{r.booqable_order_id}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
