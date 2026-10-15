'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

// Wraps pages that need a login (and a particular role).
export default function Require({ roles, children }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const key = roles.join(',')

  useEffect(() => {
    if (loading) return
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
    else if (!roles.includes(user.role)) router.replace('/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, key, router, pathname])

  if (loading || !user || !roles.includes(user.role)) return <p className="muted">Loading…</p>
  return children
}
