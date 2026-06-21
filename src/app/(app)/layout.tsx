'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { UserRoleProvider, useUserRole } from '@/lib/user-role-context'

// Clés contrôlables par l'admin pour les opérateurs.
// "compte" est volontairement absent : Compte est admin-only.
// Les opérateurs accèdent à leur mot de passe via le lien en bas de sidebar.
const ALL_NAV = [
  { key: 'dashboard', label: 'Tableau de bord', href: '/dashboard' },
  { key: 'inbox',     label: 'Inbox',            href: '/inbox' },
  { key: 'contacts',  label: 'Contacts',          href: '/contacts' },
  { key: 'requests',  label: 'Assistant planning', href: '/requests' },
  { key: 'returns',   label: 'Assistant retours',  href: '/returns' },
  { key: 'assistant', label: 'Paramètres',         href: '/assistant/appearance' },
  { key: 'statistics',label: 'Statistiques',       href: '/statistics' },
  { key: 'compte',    label: 'Compte',             href: '/settings/general', adminOnly: true },
]

function IconLogout() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  )
}

function IconLock() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
}

function Sidebar({ email }: { email: string }) {
  const pathname = usePathname()
  const { isAdmin, permissions, loading } = useUserRole()

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const visibleNav = loading
    ? []
    : ALL_NAV.filter(item => {
        if (item.adminOnly) return isAdmin
        return isAdmin || permissions.includes(item.key)
      })

  return (
    <div className="w-56 bg-black flex flex-col h-full shrink-0">
      <div className="p-5 border-b border-white/10">
        <span className="text-white font-light tracking-wider text-lg">
          filme<span className="font-semibold">AI</span>
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {loading ? (
          // Skeleton pendant le chargement des permissions
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 rounded-lg bg-white/5 animate-pulse mx-0" />
          ))
        ) : (
          visibleNav.map(item => (
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
          ))
        )}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-3">
        {/* Lien mot de passe pour les opérateurs (toujours accessible) */}
        {!loading && !isAdmin && (
          <Link
            href="/settings/security"
            className="flex items-center gap-2 text-white/50 hover:text-white text-xs transition-colors"
          >
            <IconLock />
            Mon mot de passe
          </Link>
        )}
        <div className="text-white/40 text-xs truncate">{email}</div>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-white/50 hover:text-white text-xs transition-colors w-full"
        >
          <IconLogout />
          Se déconnecter
        </button>
      </div>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState('')

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setEmail(data.user?.email || '')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email || '')
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [supabase])

  const displayEmail = email || 'Compte connecté'

  return (
    <div className="flex h-screen bg-gray-50">
      <UserRoleProvider email={email}>
        <Sidebar email={displayEmail} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-14 bg-white border-b border-gray-100 flex items-center px-6 justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-900">Filme</span>
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">Connecté</span>
            </div>
            <span className="text-sm text-gray-500">{displayEmail}</span>
          </div>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </UserRoleProvider>
    </div>
  )
}
