'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Général', href: '/settings/general' },
  { label: 'Connexion', href: '/settings/connection' },
  { label: 'Abonnement', href: '/settings/subscription' },
  { label: 'Collaborateurs', href: '/settings/collaborators' },
  { label: 'Sécurité', href: '/settings/security' },
  { label: 'Activité', href: '/settings/activity' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Compte</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gérez votre compte et vos préférences</p>
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
