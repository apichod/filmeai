'use client'
import { useState } from 'react'

const initialDocs = [
  { name: 'Catalogue matériel 2026.pdf', size: '2.4 Mo', date: '10/06/2026' },
  { name: 'Conditions générales de location.pdf', size: '340 Ko', date: '01/01/2026' },
  { name: 'Tarifs préférentiels partenaires.xlsx', size: '85 Ko', date: '15/05/2026' },
]

export default function AssistantKnowledgePage() {
  const [docs, setDocs] = useState(initialDocs)
  const [context, setContext] = useState(`Filme est une société de location de matériel audiovisuel professionnel basée à Paris. Nous proposons des caméras Sony, des optiques anamorphiques DZOFilm, des trépieds et accessoires. Les tarifs sont à la journée ou à la semaine. Livraison possible en Île-de-France.`)

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Contexte de l&apos;entreprise</h2>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          rows={5}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
          <label className="cursor-pointer text-xs font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
            + Ajouter un fichier
            <input type="file" className="hidden" />
          </label>
        </div>

        <div className="space-y-2">
          {docs.map((d, i) => (
            <div key={i} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center text-xs font-medium text-gray-600">
                  {d.name.split('.').pop()?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{d.name}</p>
                  <p className="text-xs text-gray-500">{d.size} · Ajouté le {d.date}</p>
                </div>
              </div>
              <button
                onClick={() => setDocs(docs.filter((_, j) => j !== i))}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      </div>

      <button className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors">
        Sauvegarder
      </button>
    </div>
  )
}
