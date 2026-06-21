'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Apparence', href: '/assistant/appearance' },
  { label: 'Comportement', href: '/assistant/behavior' },
  { label: 'Connaissances', href: '/assistant/knowledge' },
  { label: 'Logs', href: '/assistant/corrections' },
  { label: 'Conditions', href: '/assistant/conditions' },
  { label: 'Devis', href: '/assistant/quotes' },
  { label: 'Intégration', href: '/assistant/integration' },
  { label: 'Workflows retours', href: '/assistant/workflows' },
  { label: 'Templates email',  href: '/assistant/emails' },
]

export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Paramètres</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configurez votre assistant FilmeAI</p>
      </div>
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              pathname === t.href
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  )
}
