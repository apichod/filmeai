'use client'
import { useState } from 'react'

export default function AssistantIntegrationPage() {
  const [copied, setCopied] = useState(false)

  const snippet = `<script>
  window.filmeaiConfig = {
    apiKey: "fai_pk_xxxxxxxxxxxxxxxx",
    position: "bottom-right",
    primaryColor: "#000000"
  };
</script>
<script src="https://cdn.filmeai.fr/widget.js" async></script>`

  function copy() {
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Clé API</h2>
        <div className="flex gap-2">
          <input
            readOnly
            value="fai_pk_xxxxxxxxxxxxxxxx"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono bg-gray-50 text-gray-600"
          />
          <button className="border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Régénérer
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Code à intégrer</h2>
          <button
            onClick={copy}
            className="text-xs font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>
        <pre className="bg-gray-950 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto font-mono leading-relaxed">
          {snippet}
        </pre>
        <p className="text-xs text-gray-500">
          Collez ce code avant la balise <code className="font-mono">&lt;/body&gt;</code> de votre site web.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Intégrations</h2>
        {[
          { name: 'Booqable', desc: 'Synchronisation du catalogue et des disponibilités', connected: true },
          { name: 'Slack', desc: 'Notifications des nouvelles demandes', connected: false },
          { name: 'Zapier', desc: 'Automatisations personnalisées', connected: false },
        ].map(int => (
          <div key={int.name} className="flex items-center justify-between py-2 border-t border-gray-50 first:border-0">
            <div>
              <p className="text-sm font-medium text-gray-900">{int.name}</p>
              <p className="text-xs text-gray-500">{int.desc}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${int.connected ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
              {int.connected ? 'Connecté' : 'Non connecté'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
