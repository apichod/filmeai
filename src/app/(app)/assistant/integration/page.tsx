'use client'
import { useState, useEffect, useCallback } from 'react'

type Settings = { allowed_domains: string[]; organization_id?: string }
type CmsTab = 'html' | 'wordpress' | 'shopify' | 'wix' | 'webflow' | 'squarespace' | 'other'

const CMS_TABS: { key: CmsTab; label: string }[] = [
  { key: 'html', label: 'Site HTML' },
  { key: 'wordpress', label: 'WordPress' },
  { key: 'shopify', label: 'Shopify' },
  { key: 'wix', label: 'Wix' },
  { key: 'webflow', label: 'Webflow' },
  { key: 'squarespace', label: 'Squarespace' },
  { key: 'other', label: 'Autre CMS' },
]

const CMS_INSTRUCTIONS: Record<CmsTab, string[]> = {
  html: [
    'Copiez le code d\'intégration ci-dessus (bouton Copier).',
    'Ouvrez le fichier HTML de votre site, ou le gabarit partagé (footer) si vos pages sont générées à partir d\'un template.',
    'Collez le snippet juste avant la balise de fermeture </body>.',
    'Enregistrez, puis publiez ou déployez votre site.',
    'Rechargez une page de votre site : la bulle de l\'assistant apparaît en bas de page.',
  ],
  wordpress: [
    'Dans l\'admin WordPress, allez dans Apparence → Éditeur de thème.',
    'Ouvrez le fichier footer.php de votre thème actif.',
    'Collez le snippet juste avant la balise </body>.',
    'Enregistrez les modifications.',
    'Videz le cache si vous utilisez un plugin de cache.',
  ],
  shopify: [
    'Dans votre admin Shopify, allez dans Boutique en ligne → Thèmes.',
    'Cliquez sur Actions → Modifier le code.',
    'Ouvrez Layout → theme.liquid.',
    'Collez le snippet juste avant la balise </body>.',
    'Cliquez sur Enregistrer.',
  ],
  wix: [
    'Dans l\'éditeur Wix, allez dans Paramètres → Paramètres avancés.',
    'Cliquez sur Modifier le code personnalisé.',
    'Collez le snippet dans la section « Corps — fin ».',
    'Appliquez à toutes les pages et publiez.',
  ],
  webflow: [
    'Dans les paramètres du projet Webflow, allez dans l\'onglet Code personnalisé.',
    'Collez le snippet dans la section « Pied de page ».',
    'Publiez votre site.',
  ],
  squarespace: [
    'Dans les paramètres Squarespace, allez dans Avancé → Injection de code.',
    'Collez le snippet dans la section Pied de page.',
    'Enregistrez et publiez.',
  ],
  other: [
    'Copiez le snippet ci-dessus.',
    'Dans votre CMS, trouvez la section d\'injection de code personnalisé (généralement dans les paramètres ou le thème).',
    'Collez le code avant la fermeture de la balise </body>.',
    'Publiez vos modifications.',
  ],
}

export default function AssistantIntegrationPage() {
  const [domains, setDomains] = useState<string[]>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [domainInput, setDomainInput] = useState('')
  const [cmsTab, setCmsTab] = useState<CmsTab>('html')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    fetch('/api/assistant-settings')
      .then(r => r.json())
      .then((d: { settings?: Settings }) => {
        if (d.settings?.allowed_domains) setDomains(d.settings.allowed_domains)
        if (d.settings?.organization_id) setOrgId(d.settings.organization_id)
      })
  }, [])

  useEffect(() => { load() }, [load])

  const publicKey = orgId ?? '…'
  const snippet = `<script src="https://cdn.filmeai.fr/widget.js" data-key="${publicKey}" async></script>`

  function copySnippet() {
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function addDomain() {
    const d = domainInput.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!d || domains.includes(d)) return
    setDomains(prev => [...prev, d])
    setDomainInput('')
  }

  function removeDomain(d: string) {
    setDomains(prev => prev.filter(x => x !== d))
  }

  async function save() {
    setSaving(true)
    await fetch('/api/assistant-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed_domains: domains }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-base font-semibold text-gray-900">Intégration</h1>
        <p className="text-xs text-gray-500 mt-0.5">Mettez l&apos;assistant en ligne sur votre site et choisissez les domaines autorisés.</p>
      </div>

      {/* Domaines autorisés */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Domaines autorisés</h2>
          <p className="text-xs text-gray-500 mt-0.5">Limitez l&apos;affichage du widget à ces domaines (anti-abus). Vide = tous les domaines.</p>
        </div>

        {domains.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {domains.map(d => (
              <span key={d} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full font-mono">
                {d}
                <button onClick={() => removeDomain(d)} className="text-gray-400 hover:text-gray-700 leading-none">×</button>
              </span>
            ))}
          </div>
        )}

        <input
          value={domainInput}
          onChange={e => setDomainInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addDomain() }}
          placeholder="exemple.fr, www.exemple.fr… (Entrée pour ajouter)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      {/* Code d'intégration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Code d&apos;intégration</h2>
          <p className="text-xs text-gray-500 mt-0.5">Collez ce snippet juste avant la balise &lt;/body&gt; de votre site pour afficher l&apos;assistant.</p>
        </div>

        <div className="relative">
          <pre className="bg-gray-950 text-gray-100 rounded-xl p-4 text-xs font-mono overflow-x-auto pr-20 leading-relaxed">
            {snippet}
          </pre>
          <button
            onClick={copySnippet}
            className="absolute right-3 top-3 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Copié
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                Copier
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-gray-500">Collez ce code juste avant la balise &lt;/body&gt; de votre site.</p>

        {/* CMS tabs */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex overflow-x-auto border-b border-gray-100 bg-gray-50">
            {CMS_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setCmsTab(t.key)}
                className={`shrink-0 px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  cmsTab === t.key ? 'bg-white text-gray-900 border-b-2 border-black' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <ol className="p-4 space-y-2">
            {CMS_INSTRUCTIONS[cmsTab].map((step, i) => (
              <li key={i} className="flex gap-3 text-xs text-gray-600">
                <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-medium text-xs">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <div className="px-4 pb-4">
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs text-amber-700">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
              Si votre site est servi derrière un cache ou un CDN (Cloudflare…), videz le cache après publication pour voir le widget immédiatement.
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          Une fois le snippet en place, rechargez votre site : l&apos;installation est détectée automatiquement et l&apos;étape « Installer le widget » de votre tableau de bord passe au vert.
        </p>
      </div>

      <button onClick={save} disabled={saving}
        className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
        {saved ? 'Sauvegardé ✓' : saving ? 'Sauvegarde…' : 'Sauvegarder'}
      </button>
    </div>
  )
}
