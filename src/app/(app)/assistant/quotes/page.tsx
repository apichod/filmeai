'use client'
import { useState, useEffect, useCallback } from 'react'

type Settings = {
  quote_mode: string
  out_of_stock: string
  upsell_mode: string
  accessories_mode: string
  list_mode: string
}

const defaults: Settings = {
  quote_mode: 'validation',
  out_of_stock: 'devis_validation',
  upsell_mode: 'disabled',
  accessories_mode: 'disabled',
  list_mode: 'assistant',
}

type Option = { value: string; label: string; desc: string }

function OptionCard({ option, selected, onSelect }: { option: Option; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left p-4 rounded-xl border transition-all ${
        selected ? 'border-black bg-black/5 ring-1 ring-black' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? 'border-black' : 'border-gray-300'}`}>
          {selected && <div className="w-2 h-2 rounded-full bg-black" />}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{option.label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{option.desc}</p>
        </div>
      </div>
    </button>
  )
}

function Section({ title, desc, options, value, onChange }: {
  title: string; desc: string; options: Option[]; value: string; onChange: (v: string) => void
}) {
  const cols = options.length === 3 ? 'grid-cols-3' : options.length === 2 ? 'grid-cols-2' : 'grid-cols-1'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
      <div className={`grid ${cols} gap-3`}>
        {options.map(opt => (
          <OptionCard key={opt.value} option={opt} selected={value === opt.value} onSelect={() => onChange(opt.value)} />
        ))}
      </div>
    </div>
  )
}

export default function AssistantQuotesPage() {
  const [s, setS] = useState<Settings>(defaults)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    fetch('/api/assistant-settings')
      .then(r => r.json())
      .then((d: { settings?: Settings }) => { if (d.settings) setS(prev => ({ ...prev, ...d.settings })) })
  }, [])

  useEffect(() => { load() }, [load])

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setS(prev => ({ ...prev, [key]: val }))
  }

  async function save() {
    setSaving(true)
    await fetch('/api/assistant-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl space-y-5">

      <Section
        title="Mode de génération des devis"
        desc="Quand un visiteur confirme son estimation, choisissez si le devis est créé dans votre PMS et envoyé au client automatiquement, ou s'il attend d'abord votre validation."
        value={s.quote_mode}
        onChange={v => set('quote_mode', v)}
        options={[
          {
            value: 'validation',
            label: 'Validation par le loueur',
            desc: 'Le devis reste en attente dans Booqable. Il n\'est envoyé au client qu\'une fois que vous l\'avez validé.',
          },
          {
            value: 'auto',
            label: 'Envoi automatique',
            desc: 'Le devis est créé directement dans votre PMS (Booqable) et envoyé au client, sans validation de votre part.',
          },
        ]}
      />

      <Section
        title="Rupture de stock"
        desc="Que fait le bot quand la quantité demandée dépasse le stock disponible sur les dates (mesuré via Booqable)."
        value={s.out_of_stock}
        onChange={v => set('out_of_stock', v)}
        options={[
          {
            value: 'devis_validation',
            label: 'Devis + validation',
            desc: 'Le bot chiffre mais force votre validation manuelle, même en mode brouillon automatique.',
          },
          {
            value: 'refuse',
            label: 'Refuser le devis',
            desc: 'Le bot ne chiffre pas en rupture : il propose des alternatives ou vous transmet la demande.',
          },
          {
            value: 'allow',
            label: 'Autoriser quand même',
            desc: 'Le bot chiffre et pousse le devis malgré la rupture (réservation en rupture).',
          },
        ]}
      />

      <Section
        title="Montée en gamme (upsell)"
        desc="Autorisez le bot à proposer un modèle supérieur compatible et disponible, en expliquant les avantages et l'écart de prix par jour."
        value={s.upsell_mode}
        onChange={v => set('upsell_mode', v)}
        options={[
          {
            value: 'disabled',
            label: 'Désactivé',
            desc: 'Le bot ne propose jamais de montée en gamme : il s\'en tient au matériel demandé.',
          },
          {
            value: 'propose',
            label: 'Proposer un upgrade',
            desc: 'Une seule proposition par conversation, jamais d\'insistance après un refus.',
          },
        ]}
      />

      <Section
        title="Suggestions d'accessoires"
        desc="Autorisez le bot à suggérer les accessoires indispensables manquants d'un article clé (batterie, carte mémoire, trépied…), sans jamais re-proposer ce qui est déjà fourni."
        value={s.accessories_mode}
        onChange={v => set('accessories_mode', v)}
        options={[
          {
            value: 'disabled',
            label: 'Désactivé',
            desc: 'Le bot ne suggère jamais d\'accessoire : il s\'en tient au matériel demandé.',
          },
          {
            value: 'suggest',
            label: 'Suggérer les accessoires',
            desc: 'Une seule suggestion par article clé, uniquement les accessoires réellement manquants du catalogue.',
          },
        ]}
      />

      <Section
        title="Devis sur liste"
        desc="Quand un visiteur veut un devis à partir d'une liste de matériel, choisissez comment le parcours se présente dans le widget. Sans PMS connecté, le mode « formulaire » s'applique d'office (le chiffrage automatique est alors impossible)."
        value={s.list_mode}
        onChange={v => set('list_mode', v)}
        options={[
          {
            value: 'assistant',
            label: 'Assistant seul',
            desc: 'La liste passe par l\'assistant : estimation immédiate, chiffrage automatique si le PMS est connecté.',
          },
          {
            value: 'assistant_form',
            label: 'Assistant + formulaire',
            desc: 'Le visiteur choisit : estimation immédiate via l\'assistant, ou formulaire pour transmettre la liste.',
          },
          {
            value: 'form',
            label: 'Formulaire seul',
            desc: 'La liste ouvre directement un formulaire de demande manuelle. Chiffrage automatique impossible.',
          },
        ]}
      />

      <button onClick={save} disabled={saving}
        className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
        {saved ? 'Sauvegardé ✓' : saving ? 'Sauvegarde…' : 'Sauvegarder'}
      </button>
    </div>
  )
}
