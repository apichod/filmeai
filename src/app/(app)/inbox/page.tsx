'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface LastMessage {
  content: string
  role: string
  created_at: string
}

interface Conversation {
  id: string
  contact_name: string | null
  contact_email: string | null
  status: string
  booqable_order_id: string | null
  booqable_order_url: string | null
  created_at: string
  updated_at: string
  last_message: LastMessage | null
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Hier ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } else {
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  }
}

function getInitial(name: string | null, email: string | null): string {
  if (name && name.length > 0) return name[0].toUpperCase()
  if (email && email.length > 0) return email[0].toUpperCase()
  return '?'
}

function getDisplayName(name: string | null, email: string | null): string {
  return name || email || 'Visiteur anonyme'
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/conversations')
      .then(r => r.json())
      .then((data: Conversation[]) => {
        setConversations(Array.isArray(data) ? data : [])
      })
      .catch(() => setConversations([]))
      .finally(() => setLoading(false))
  }, [])

  async function deleteConversation(id: string) {
    if (!confirm('Supprimer définitivement cette conversation ?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Suppression impossible')
      setConversations(prev => prev.filter(c => c.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Suppression impossible')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inbox</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? 'Chargement…' : `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4 px-6 py-4">
              <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-gray-200 rounded animate-pulse w-1/3" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-1/4" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
              </div>
            </div>
          ))
        ) : conversations.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            Aucune conversation pour l&apos;instant.
          </div>
        ) : (
          conversations.map(c => (
            <div
              key={c.id}
              className="group flex items-start gap-3 px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <Link href={`/inbox/${c.id}`} className="flex items-start gap-4 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center text-sm font-medium shrink-0 mt-0.5">
                  {getInitial(c.contact_name, c.contact_email)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      {getDisplayName(c.contact_name, c.contact_email)}
                    </span>
                    <span className="text-xs text-gray-400 ml-4 shrink-0">{formatDate(c.updated_at)}</span>
                  </div>
                  {c.contact_email && (
                    <p className="text-xs text-gray-500 mt-0.5">{c.contact_email}</p>
                  )}
                  {c.last_message && (
                    <p className="text-sm text-gray-600 mt-1 truncate">{c.last_message.content}</p>
                  )}
                </div>
              </Link>
              {c.booqable_order_id && (
                <span className="text-xs font-medium text-gray-500 shrink-0 mt-1 bg-gray-100 px-2 py-0.5 rounded-full">
                  Devis
                </span>
              )}
              <button
                type="button"
                onClick={() => deleteConversation(c.id)}
                disabled={deletingId === c.id}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-red-600 hover:text-red-700 disabled:opacity-40 px-2 py-1 rounded-lg hover:bg-red-50"
                title="Supprimer"
              >
                {deletingId === c.id ? '…' : 'Supprimer'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
