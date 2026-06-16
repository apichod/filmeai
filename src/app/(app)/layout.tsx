'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { label: 'Tableau de bord', href: '/dashboard' },
  { label: 'Inbox', href: '/inbox' },
  { label: 'Contacts', href: '/contacts' },
  { label: 'Demandes & devis', href: '/requests' },
  { label: 'Mon assistant', href: '/assistant/appearance' },
  { label: 'Statistiques', href: '/statistics' },
  { label: 'Réglages', href: '/settings/general' },
]

function Sidebar() {
  const pathname = usePathname()
  return (
    <div className="w-56 bg-black flex flex-col h-full shrink-0">
      <div className="p-5 border-b border-white/10">
        <span className="text-white font-light tracking-wider text-lg">filme<span className="font-semibold">AI</span></span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname.startsWith(item.href.split('/').slice(0, 2).join('/'))
                ? 'bg-white text-black font-medium'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10">
        <div className="text-white/40 text-xs">aurelien@filme.fr</div>
      </div>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 bg-white border-b border-gray-100 flex items-center px-6 justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-900">Filme</span>
            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">Connecté</span>
          </div>
          <span className="text-sm text-gray-500">aurelien@filme.fr</span>
        </div>
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
