'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Message {
  id: string
  role: string
  content: string
  created_at: string
}

interface ConversationDetail {
  id: string
  contact_name: string | null
  contact_email: string | null
  status: string
  booqable_order_id: string | null
  booqable_order_url: string | null
  created_at: string
  updated_at: string
  messages: Message[]
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function getDisplayName(name: string | null, email: string | null): string {
  return name || email || 'Visiteur anonyme'
}

function getInitial(name: string | null, email: string | null): string {
  if (name && name.length > 0) return name[0].toUpperCase()
  if (email && email.length > 0) return email[0].toUpperCase()
  return '?'
}

export default function InboxDetailPage({ params }: { params: { id: string } }) {
  const [conv, setConv] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/conversations/${params.id}`)
      .then(r => {
        if (!r.ok) { setNotFound(true); return null }
        return r.json()
      })
      .then((data: ConversationDetail | null) => {
        if (data) setConv(data)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="space-y-4 h-full flex flex-col">
        <div className="flex items-center gap-3">
          <Link href="/inbox" className="text-sm text-gray-500 hover:text-gray-900">← Inbox</Link>
        </div>
        <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm animate-pulse" />
      </div>
    )
  }

  if (notFound || !conv) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/inbox" className="text-sm text-gray-500 hover:text-gray-900">← Inbox</Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-12 text-center text-sm text-gray-400">
          Conversation introuvable.
        </div>
      </div>
    )
  }

  const displayName = getDisplayName(conv.contact_name, conv.contact_email)

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center gap-3">
        <Link href="/inbox" className="text-sm text-gray-500 hover:text-gray-900">← Inbox</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900">{displayName}</span>
      </div>

      <div className="flex gap-4 flex-1">
        <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm font-medium">
              {getInitial(conv.contact_name, conv.contact_email)}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{displayName}</p>
              {conv.contact_email && (
                <p className="text-xs text-gray-500">{conv.contact_email}</p>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
            {conv.messages.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Aucun message.</p>
            ) : (
              conv.messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'assistant' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                    m.role === 'assistant'
                      ? 'bg-black text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                  }`}>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    <div className={`text-xs mt-1 ${m.role === 'assistant' ? 'text-white/50' : 'text-gray-400'}`}>
                      {formatTime(m.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {conv.booqable_order_id && (
          <div className="w-64 bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3 h-fit">
            <h3 className="text-sm font-semibold text-gray-900">Devis généré</h3>
            <div className="text-xs text-gray-500">
              Référence Booqable&nbsp;:
              <span className="font-mono text-gray-900 ml-1">{conv.booqable_order_id}</span>
            </div>
            {conv.booqable_order_url && (
              <a
                href={conv.booqable_order_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-black text-white rounded-lg py-2 text-xs font-medium hover:bg-gray-800 transition-colors text-center"
              >
                Voir le devis →
              </a>
            )}
            <div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
                En attente
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
