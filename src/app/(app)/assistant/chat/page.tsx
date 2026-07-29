'use client'

import { useEffect, useRef, useState } from 'react'

type ChatType = 'retours' | 'planning' | 'sous-location'

type Category = {
  id: string
  chat_type: ChatType
  label: string
  key: string
  sort_order: number
  is_active: boolean
}

export default function ChatPage() {
  const [activeTab, setActiveTab] = useState<ChatType>('retours')
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // État local pour le drag-and-drop
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  // Formulaire nouvelle catégorie
  const [newLabel, setNewLabel] = useState('')
  const [newKey, setNewKey] = useState('')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Edition inline
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editKey, setEditKey] = useState('')

  const visibleCats = categories.filter(c => c.chat_type === activeTab)

  useEffect(() => {
    setLoading(true)
    fetch('/api/chat-categories')
      .then(r => r.json())
      .then(d => {
        setCategories(d.categories || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // ── Drag-and-drop reorder ──────────────────────────────────────────────────
  function onDragStart(idx: number) { dragIdx.current = idx }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOver(idx)
  }

  async function onDrop(targetIdx: number) {
    if (dragIdx.current === null || dragIdx.current === targetIdx) {
      dragIdx.current = null; setDragOver(null); return
    }
    const from = dragIdx.current

    // Reconstruit l'ordre uniquement pour le tab actif
    const otherCats = categories.filter(c => c.chat_type !== activeTab)
    const tabCats   = [...visibleCats]
    const [moved]   = tabCats.splice(from, 1)
    tabCats.splice(targetIdx, 0, moved)

    // Réassigne sort_order
    const reordered = tabCats.map((c, i) => ({ ...c, sort_order: i + 1 }))
    setCategories([...otherCats, ...reordered])
    dragIdx.current = null
    setDragOver(null)

    // Persist
    setSaving(true)
    try {
      await fetch('/api/chat-categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reordered.map(c => ({ id: c.id, sort_order: c.sort_order }))),
      })
      flashSaved()
    } finally { setSaving(false) }
  }

  function flashSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // ── Toggle is_active ────────────────────────────────────────────────────────
  async function toggleActive(cat: Category) {
    const updated = { ...cat, is_active: !cat.is_active }
    setCategories(prev => prev.map(c => c.id === cat.id ? updated : c))
    await fetch('/api/chat-categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cat.id, is_active: !cat.is_active }),
    })
  }

  // ── Edition inline ──────────────────────────────────────────────────────────
  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setEditLabel(cat.label)
    setEditKey(cat.key)
  }

  async function saveEdit(cat: Category) {
    if (!editLabel.trim()) { setEditingId(null); return }
    const updated = { ...cat, label: editLabel.trim(), key: editKey.trim() || cat.key }
    setCategories(prev => prev.map(c => c.id === cat.id ? updated : c))
    setEditingId(null)
    await fetch('/api/chat-categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cat.id, label: updated.label, key: updated.key }),
    })
    flashSaved()
  }

  // ── Supprimer ───────────────────────────────────────────────────────────────
  async function deleteCategory(cat: Category) {
    if (!confirm(`Supprimer la catégorie "${cat.label}" ?`)) return
    setCategories(prev => prev.filter(c => c.id !== cat.id))
    await fetch('/api/chat-categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cat.id }),
    })
  }

  // ── Ajouter ─────────────────────────────────────────────────────────────────
  async function addCategory() {
    if (!newLabel.trim() || !newKey.trim()) return
    setAdding(true)
    try {
      const maxOrder = Math.max(0, ...visibleCats.map(c => c.sort_order))
      const res = await fetch('/api/chat-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_type: activeTab,
          label: newLabel.trim(),
          key: newKey.trim().toLowerCase().replace(/\s+/g, '_'),
          sort_order: maxOrder + 1,
        }),
      })
      const d = await res.json() as { category?: Category }
      if (d.category) {
        setCategories(prev => [...prev, d.category!])
        setNewLabel(''); setNewKey(''); setShowForm(false)
      }
    } finally { setAdding(false) }
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Chargement…</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Chat — Catégories</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Définissez les boutons de niveau 1 affichés au démarrage de chaque chat
          </p>
        </div>
        {saving && <span className="text-xs text-gray-400">Sauvegarde…</span>}
        {saved && !saving && (
          <span className="text-sm text-green-600 font-medium flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Sauvegardé
          </span>
        )}
      </div>

      {/* Tabs Retours / Planning */}
      <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm font-medium w-fit">
        {(['retours', 'planning', 'sous-location'] as ChatType[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setShowForm(false); setEditingId(null) }}
            className={`px-5 py-2 transition-colors ${
              activeTab === tab ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {tab === 'retours' ? 'Assistant retours' : tab === 'planning' ? 'Assistant planning' : 'Sous-location'}
          </button>
        ))}
      </div>

      {/* Liste des catégories */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {visibleCats.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Aucune catégorie</p>
        )}

        {visibleCats.map((cat, idx) => (
          <div
            key={cat.id}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={e => onDragOver(e, idx)}
            onDrop={() => onDrop(idx)}
            onDragEnd={() => setDragOver(null)}
            className={`flex items-center gap-3 px-4 py-3 transition-colors ${
              dragOver === idx ? 'bg-blue-50' : 'hover:bg-gray-50/50'
            } ${!cat.is_active ? 'opacity-40' : ''}`}
          >
            {/* Drag handle */}
            <span className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 2a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zM13 2a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2zm0 4a1 1 0 000 2 1 1 0 000-2z" />
              </svg>
            </span>

            <span className="text-xs text-gray-300 font-mono w-4 shrink-0">{idx + 1}</span>

            {/* Edition ou affichage */}
            {editingId === cat.id ? (
              <div className="flex-1 flex gap-2 items-center">
                <input
                  autoFocus
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat); if (e.key === 'Escape') setEditingId(null) }}
                  placeholder="Label affiché"
                  className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
                <input
                  value={editKey}
                  onChange={e => setEditKey(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat); if (e.key === 'Escape') setEditingId(null) }}
                  placeholder="key (slug)"
                  className="w-32 border border-gray-200 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-500"
                />
                <button onClick={() => saveEdit(cat)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">OK</button>
                <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
              </div>
            ) : (
              <div className="flex-1 flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{cat.label}</span>
                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{cat.key}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Toggle actif */}
              <button
                onClick={() => toggleActive(cat)}
                title={cat.is_active ? 'Désactiver' : 'Activer'}
                className={`w-8 h-5 rounded-full transition-colors relative ${cat.is_active ? 'bg-black' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${cat.is_active ? 'left-3.5' : 'left-0.5'}`} />
              </button>

              {/* Éditer */}
              {editingId !== cat.id && (
                <button
                  onClick={() => startEdit(cat)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded transition-colors"
                  title="Renommer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}

              {/* Supprimer */}
              <button
                onClick={() => deleteCategory(cat)}
                className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors"
                title="Supprimer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {/* Formulaire d'ajout */}
        {showForm ? (
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50/70">
            <span className="w-4 shrink-0" />
            <span className="w-4 shrink-0" />
            <input
              autoFocus
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCategory(); if (e.key === 'Escape') setShowForm(false) }}
              placeholder="Label affiché (ex: Devis)"
              className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white"
            />
            <input
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCategory(); if (e.key === 'Escape') setShowForm(false) }}
              placeholder="key (ex: devis)"
              className="w-32 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white text-gray-500"
            />
            <button
              onClick={addCategory}
              disabled={adding || !newLabel.trim() || !newKey.trim()}
              className="px-3 py-1.5 text-xs bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {adding ? '…' : 'Ajouter'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50/50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nouvelle catégorie
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Glissez-déposez pour réordonner · Les catégories désactivées n&apos;apparaissent pas dans le chat
      </p>
    </div>
  )
}
