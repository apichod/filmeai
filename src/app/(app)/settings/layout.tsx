'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useUserRole } from '@/lib/user-role-context'

const ADMIN_TABS = [
  { label: 'Général',        href: '/settings/general' },
  { label: 'Connexion',      href: '/settings/connection' },
  { label: 'Collaborateurs', href: '/settings/collaborators' },
  { label: 'Sécurité',       href: '/settings/security' },
  { label: 'Activité',       href: '/settings/activity' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isAdmin, loading } = useUserRole()

  // Opérateurs : seul /settings/security est accessible
  useEffect(() => {
    if (loading) return
    if (!isAdmin && pathname !== '/settings/security') {
      router.replace('/settings/security')
    }
  }, [isAdmin, loading, pathname, router])

  // Pendant le chargement → rien (évite le flash)
  if (loading) return null

  // Opérateur → vue simplifiée sans les onglets admin
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Mon profil</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gérez votre mot de passe</p>
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Compte</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gérez votre compte et vos préférences</p>
      </div>
      <div className="flex gap-1 border-b border-gray-200">
        {ADMIN_TABS.map(t => (
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
