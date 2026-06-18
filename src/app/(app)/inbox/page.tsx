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
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Hier ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function getInitial(name: string | null, email: string | null) {
  if (name?.length) return name[0].toUpperCase()
  if (email?.length) return email[0].toUpperCase()
  return '?'
}

function getDisplayName(name: string | null, email: string | null) {
  return name || email || 'Visiteur anonyme'
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    fetch('/api/conversations')
      .then(r => r.json())
      .then((data: Conversation[]) => setConversations(Array.isArray(data) ? data : []))
      .catch(() => setConversations([]))
      .finally(() => setLoading(false))
  }, [])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === conversations.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(conversations.map(c => c.id)))
    }
  }

  async function deleteSelected() {
    if (!selected.size) return
    if (!confirm(`Supprimer définitivement ${selected.size} conversation${selected.size > 1 ? 's' : ''} ?`)) return
    setBulkDeleting(true)
    try {
      await Promise.all(
        Array.from(selected).map(id => fetch(`/api/conversations/${id}`, { method: 'DELETE' }))
      )
      setConversations(prev => prev.filter(c => !selected.has(c.id)))
      setSelected(new Set())
    } finally {
      setBulkDeleting(false)
    }
  }

  const allSelected = conversations.length > 0 && selected.size === conversations.length
  const someSelected = selected.size > 0

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inbox</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? 'Chargement…' : `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Bulk action bar */}
        {someSelected && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</span>
            <button
              onClick={() => void deleteSelected()}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {bulkDeleting ? 'Suppression…' : 'Supprimer'}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Annuler
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Select-all row */}
        {!loading && conversations.length > 0 && (
          <div className="flex items-center gap-3 px-6 py-2.5 border-b border-gray-100 bg-gray-50">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="rounded border-gray-300 accent-gray-900 cursor-pointer"
            />
            <span className="text-xs text-gray-500">
              {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </span>
          </div>
        )}

        <div className="divide-y divide-gray-50">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-4 px-6 py-4">
                <div className="w-4 h-4 bg-gray-100 rounded animate-pulse shrink-0 mt-1" />
                <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-200 rounded animate-pulse w-1/3" />
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
                className={`group flex items-center gap-3 px-6 py-4 hover:bg-gray-50 transition-colors ${selected.has(c.id) ? 'bg-blue-50/40' : ''}`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  onClick={e => e.stopPropagation()}
                  className="rounded border-gray-300 accent-gray-900 cursor-pointer shrink-0"
                />

                {/* Row content */}
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
                  <span className="text-xs font-medium text-gray-500 shrink-0 bg-gray-100 px-2 py-0.5 rounded-full">
                    Devis
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
