'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/requests',         label: 'Chat'           },
  { href: '/requests/new',     label: 'Nouveau Devis IA' },
  { href: '/requests/history', label: 'Historique'     },
]

export default function RequestsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Ne pas afficher le layout sur les pages de détail /requests/[id]
  const isDetailPage = /^\/requests\/[^/]+$/.test(pathname) &&
    pathname !== '/requests/new' &&
    pathname !== '/requests/history'

  if (isDetailPage) {
    return <>{children}</>
  }

  return (
    <div className="flex flex-col h-full gap-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Assistant planning</h1>
        <p className="text-sm text-gray-500 mt-0.5">Devis et demandes générés par votre assistant</p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200 -mb-1">
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

      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
