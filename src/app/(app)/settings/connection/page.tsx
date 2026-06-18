'use client'
import { useState, useEffect, useCallback } from 'react'

type CatalogStatus = {
  count: number
  lastSync: string | null
}

type TestResult = 'idle' | 'testing' | 'ok' | 'error'

function BooqableLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7" aria-label="Booqable">
      <rect width="32" height="32" rx="8" fill="#1a1a2e" />
      <path d="M8 22V10h5.5c2.5 0 4 1.2 4 3.1 0 1.2-.6 2.1-1.6 2.6 1.4.4 2.3 1.5 2.3 3 0 2.1-1.6 3.3-4.3 3.3H8zm2.5-7.2h2.7c1.2 0 1.9-.6 1.9-1.6s-.7-1.5-1.9-1.5h-2.7v3.1zm0 5.1h3c1.4 0 2.1-.6 2.1-1.8s-.8-1.7-2.2-1.7h-2.9v3.5z" fill="white"/>
      <circle cx="22" cy="16" r="4" stroke="white" strokeWidth="2" fill="none"/>
    </svg>
  )
}

export default function SettingsConnectionPage() {
  const [catalog, setCatalog] = useState<CatalogStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncPct, setSyncPct] = useState(0)
  const [syncLabel, setSyncLabel] = useState('')
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testResult, setTestResult] = useState<TestResult>('idle')

  const booqableUrl = `${process.env.NEXT_PUBLIC_BOOQABLE_SUBDOMAIN ?? 'filme'}.booqable.com`

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/catalog-status')
      if (res.ok) {
        const data = await res.json() as CatalogStatus
        setCatalog(data)
      }
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => { void loadCatalog() }, [loadCatalog])

  async function retest() {
    setTestResult('testing')
    try {
      const res = await fetch('/api/booqable-test')
      setTestResult(res.ok ? 'ok' : 'error')
    } catch {
      setTestResult('error')
    }
    setTimeout(() => setTestResult('idle'), 4000)
  }

  async function syncCatalog() {
    if (syncing) return
    setSyncing(true)
    setSyncPct(0)
    setSyncLabel('Démarrage…')
    setSyncResult(null)

    try {
      const res = await fetch('/api/sync-catalog-trigger', { method: 'POST' })
      if (!res.body) throw new Error('Pas de stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''

        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/m)
          const dataMatch = part.match(/^data: (.+)/m)
          if (!dataMatch) continue
          const eventName = eventMatch?.[1] ?? 'message'
          const payload = JSON.parse(dataMatch[1]) as Record<string, unknown>

          if (eventName === 'progress') {
            setSyncPct(payload.pct as number)
            setSyncLabel(payload.label as string)
          } else if (eventName === 'done') {
            const upserted = payload.upserted as number | undefined
            setSyncResult({ ok: true, message: `${upserted ?? '?'} articles synchronisés avec succès.` })
            await loadCatalog()
          } else if (eventName === 'error') {
            setSyncResult({ ok: false, message: (payload.message as string) ?? 'Erreur inconnue.' })
          }
        }
      }
    } catch {
      setSyncResult({ ok: false, message: 'Erreur réseau. Réessayez.' })
    } finally {
      setSyncing(false)
      setSyncPct(0)
      setSyncLabel('')
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return 'Jamais'
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const capabilities = [
    { label: 'Disponibilité', value: 'Stock en temps réel' },
    { label: 'Devis', value: 'Automatique' },
    { label: 'Caution', value: 'Totale' },
    { label: 'API v4', value: 'Bundles' },
  ]

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-base font-semibold text-gray-900">Connexion</h1>
        <p className="text-xs text-gray-500 mt-0.5">Votre logiciel de gestion locative (PMS) connecté à FilmeAI.</p>
      </div>

      {/* ── Booqable card ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <BooqableLogo />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">Booqable</span>
                <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">Connecté</span>
              </div>
              <p className="text-xs text-gray-500 font-mono mt-0.5">{booqableUrl}</p>
            </div>
          </div>
          <button
            onClick={retest}
            disabled={testResult === 'testing'}
            className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-50 shrink-0"
          >
            {testResult === 'testing' ? (
              <>
                <span className="w-3 h-3 border border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                Test…
              </>
            ) : testResult === 'ok' ? (
              <><span className="text-green-600">✓</span> OK</>
            ) : testResult === 'error' ? (
              <><span className="text-red-500">✗</span> Erreur</>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Re-tester
              </>
            )}
          </button>
        </div>

        <div className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">Dernière synchronisation</span>
          <p className="mt-0.5 text-gray-900">{catalog ? formatDate(catalog.lastSync) : '—'}</p>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">Capacités</p>
          <div className="flex flex-wrap gap-2">
            {capabilities.map(cap => (
              <span key={cap.label} className="text-xs bg-gray-50 text-gray-700 border border-gray-200 rounded-full px-3 py-1">
                {cap.label} : <span className="font-medium text-gray-900">{cap.value}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Catalogue ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Catalogue</h2>
          <p className="text-xs text-gray-500 mt-0.5">Réimportez votre catalogue depuis Booqable pour refléter les derniers changements.</p>
        </div>

        {catalog !== null && (
          <p className="text-sm text-gray-700">
            <span className="font-semibold text-gray-900">{catalog.count.toLocaleString('fr-FR')}</span> article{catalog.count > 1 ? 's' : ''} importé{catalog.count > 1 ? 's' : ''}.
          </p>
        )}

        {syncing && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{syncLabel}</span>
              <span>{syncPct}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-black rounded-full transition-all duration-500 ease-out"
                style={{ width: `${syncPct}%` }}
              />
            </div>
          </div>
        )}

        {!syncing && syncResult && (
          <div className={`text-xs px-3 py-2 rounded-lg border ${
            syncResult.ok
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            {syncResult.ok ? '✓ ' : '✗ '}{syncResult.message}
          </div>
        )}

        <button
          onClick={syncCatalog}
          disabled={syncing}
          className="flex items-center gap-2 bg-black text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {syncing ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Synchronisation…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Re-synchroniser le catalogue
            </>
          )}
        </button>
      </div>

      {/* ── Danger zone ── */}
      <div className="bg-white rounded-xl border border-red-200 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Déconnecter</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Supprime la connexion à Booqable ainsi que le catalogue importé. Le chatbot ne pourra plus proposer de devis tant qu&apos;aucun PMS n&apos;est reconnecté.
          </p>
        </div>
        <button
          onClick={() => { if (confirm('Déconnecter Booqable et supprimer le catalogue importé ?')) alert('Fonctionnalité à implémenter.') }}
          className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700 transition-colors"
        >
          Déconnecter le PMS
        </button>
      </div>
    </div>
  )
}
