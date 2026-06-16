'use client'

import { useEffect, useState } from 'react'

interface Conversation {
  id: string
  contact_name: string | null
  contact_email: string | null
  updated_at: string
}

interface Contact {
  email: string
  name: string | null
  conversationCount: number
  lastContact: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getInitial(name: string | null, email: string): string {
  if (name && name.length > 0) return name[0].toUpperCase()
  return email[0].toUpperCase()
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/conversations')
      .then(r => r.json())
      .then((data: Conversation[]) => {
        if (!Array.isArray(data)) { setContacts([]); return }

        // Group by email to get unique contacts
        const emailMap = new Map<string, Contact>()
        for (const conv of data) {
          const email = conv.contact_email || 'anonyme'
          if (emailMap.has(email)) {
            const existing = emailMap.get(email)!
            existing.conversationCount += 1
            // Keep the most recent updated_at
            if (conv.updated_at > existing.lastContact) {
              existing.lastContact = conv.updated_at
            }
          } else {
            emailMap.set(email, {
              email,
              name: conv.contact_name,
              conversationCount: 1,
              lastContact: conv.updated_at,
            })
          }
        }

        setContacts(Array.from(emailMap.values()))
      })
      .catch(() => setContacts([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? 'Chargement…' : `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium">Contact</th>
              <th className="text-left px-6 py-3 font-medium">Conversations</th>
              <th className="text-left px-6 py-3 font-medium">Dernier contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
                      <div className="space-y-1">
                        <div className="h-3.5 bg-gray-200 rounded animate-pulse w-28" />
                        <div className="h-3 bg-gray-100 rounded animate-pulse w-36" />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-6" /></td>
                  <td className="px-6 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-20" /></td>
                </tr>
              ))
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-sm text-gray-400">
                  Aucun contact pour l&apos;instant.
                </td>
              </tr>
            ) : (
              contacts.map(c => (
                <tr key={c.email} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm font-medium shrink-0">
                        {getInitial(c.name, c.email)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.name || 'Visiteur anonyme'}</p>
                        <p className="text-xs text-gray-500">{c.email !== 'anonyme' ? c.email : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600">{c.conversationCount}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{formatDate(c.lastContact)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
