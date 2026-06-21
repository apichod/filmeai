'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type UserRoleData = {
  role: 'admin' | 'operator'
  permissions: string[] // clés nav accessibles pour un opérateur
  isAdmin: boolean
  loading: boolean
}

const UserRoleContext = createContext<UserRoleData>({
  role: 'admin',
  permissions: [],
  isAdmin: true,
  loading: true,
})

export function UserRoleProvider({
  email,
  children,
}: {
  email: string
  children: React.ReactNode
}) {
  const [data, setData] = useState<UserRoleData>({
    role: 'admin',
    permissions: [],
    isAdmin: true,
    loading: true,
  })

  useEffect(() => {
    if (!email) return
    fetch(`/api/me?email=${encodeURIComponent(email)}`)
      .then(r => r.json() as Promise<{ role: string; permissions: string[] }>)
      .then(res => {
        setData({
          role: res.role as 'admin' | 'operator',
          permissions: res.permissions || [],
          isAdmin: res.role !== 'operator',
          loading: false,
        })
      })
      .catch(() => {
        // En cas d'erreur réseau → accès admin par défaut (fail-open interne)
        setData(prev => ({ ...prev, loading: false }))
      })
  }, [email])

  return (
    <UserRoleContext.Provider value={data}>
      {children}
    </UserRoleContext.Provider>
  )
}

export function useUserRole(): UserRoleData {
  return useContext(UserRoleContext)
}
