'use client'
import { useState } from 'react'

type FaqItem = { id: string; question: string; answer: string; synced?: boolean }

const initialFaq: FaqItem[] = [
  { id: '1', question: 'Quels sont vos délais de livraison ?', answer: 'Nous livrons sous 24h en Île-de-France pour toute commande passée avant 14h.', synced: true },
  { id: '2', question: 'Proposez-vous des tarifs à la semaine ?', answer: 'Oui, nos tarifs semaine correspondent à 5 jours facturés.', synced: true },
]

type Tab = 'faq' | 'files' | 'webpages' | 'signals'

export default function AssistantKnowledgePage() {
  const [activeTab, setActiveTab] = useState<Tab>('faq')
  const [faq, setFaq] = useState<FaqItem[]>(initialFaq)
  const [editing, setEditing] = useState<string | null>(null)
  const [newQ, setNewQ] = useState('')
  const [newA, setNewA] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  function addFaq() {
    if (!newQ.trim()) return
    setFaq(prev => [...prev, { id: Date.now().toString(), question: newQ.trim(), answer: newA.trim() }])
    setNewQ('')
    setNewA('')
    setShowAdd(false)
  }

  function deleteFaq(id: string) {
    setFaq(prev => prev.filter(f => f.id !== id))
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'faq', label: 'FAQ' },
    { key: 'files', label: 'Fichiers' },
    { key: 'webpages', label: 'Pages web' },
    { key: 'signals', label: 'Signaux' },
  ]

  return (
    <div className="max-w-2xl space-y-5">

      {/* Tab bar */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === t.key ? 'border-b-2 border-black text-black' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* FAQ tab */}
        {activeTab === 'faq' && (
          <div>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-900">Questions fréquentes</p>
                <p className="text-xs text-gray-500 mt-0.5">L&apos;assistant utilisera ces réponses en priorité.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {}}
                  className="text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                >
                  Générer depuis mon site
                </button>
                <button
                  onClick={() => setShowAdd(true)}
                  className="text-xs bg-black text-white rounded-lg px-3 py-1.5 hover:bg-gray-800 transition-colors"
                >
                  + Ajouter
                </button>
              </div>
            </div>

            {/* Add form */}
            {showAdd && (
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 space-y-3">
                <input
                  value={newQ}
                  onChange={e => setNewQ(e.target.value)}
                  placeholder="Question"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                />
                <textarea
                  value={newA}
                  onChange={e => setNewA(e.target.value)}
                  placeholder="Réponse"
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={addFaq} className="bg-black text-white text-xs rounded-lg px-3 py-1.5 hover:bg-gray-800">Ajouter</button>
                  <button onClick={() => { setShowAdd(false); setNewQ(''); setNewA('') }} className="text-xs text-gray-500 hover:text-gray-900">Annuler</button>
                </div>
              </div>
            )}

            {/* FAQ list */}
            <div className="divide-y divide-gray-50">
              {faq.map(item => (
                <div key={item.id} className="px-6 py-4">
                  {editing === item.id ? (
                    <div className="space-y-2">
                      <input
                        defaultValue={item.question}
                        onBlur={e => setFaq(prev => prev.map(f => f.id === item.id ? { ...f, question: e.target.value } : f))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                      />
                      <textarea
                        defaultValue={item.answer}
                        rows={2}
                        onBlur={e => setFaq(prev => prev.map(f => f.id === item.id ? { ...f, answer: e.target.value } : f))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
                      />
                      <button onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:text-gray-900">Fermer</button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.question}</p>
                          {item.synced && (
                            <span className="shrink-0 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">Synchronisé</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2">{item.answer}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setEditing(item.id)} className="text-xs text-gray-400 hover:text-gray-700">Modifier</button>
                        <button onClick={() => deleteFaq(item.id)} className="text-xs text-red-400 hover:text-red-700">Suppr.</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {faq.length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-gray-400">
                  Aucune question. Cliquez sur « + Ajouter » pour commencer.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fichiers tab */}
        {activeTab === 'files' && (
          <div className="px-6 py-8 text-center space-y-4">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Glissez vos fichiers ici</p>
              <p className="text-xs text-gray-500 mt-1">PDF, Word, Excel — max 10 Mo par fichier</p>
            </div>
            <label className="cursor-pointer inline-block">
              <input type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xlsx,.csv" />
              <span className="text-xs border border-gray-200 rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                Parcourir les fichiers
              </span>
            </label>
          </div>
        )}

        {/* Pages web tab */}
        {activeTab === 'webpages' && (
          <div className="px-6 py-6 space-y-4">
            <p className="text-xs text-gray-500">Ajoutez des URLs — l&apos;assistant analysera le contenu de ces pages.</p>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://votre-site.fr/a-propos"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
              <button className="bg-black text-white text-xs rounded-lg px-4 py-2 hover:bg-gray-800 transition-colors">
                Ajouter
              </button>
            </div>
            <div className="text-center text-sm text-gray-400 py-4">Aucune page ajoutée.</div>
          </div>
        )}

        {/* Signaux tab */}
        {activeTab === 'signals' && (
          <div className="px-6 py-8 text-center space-y-2">
            <p className="text-sm font-medium text-gray-900">Signaux comportementaux</p>
            <p className="text-xs text-gray-500">Bientôt disponible — l&apos;assistant s&apos;adaptera selon les pages visitées par l&apos;utilisateur.</p>
          </div>
        )}
      </div>

    </div>
  )
}
