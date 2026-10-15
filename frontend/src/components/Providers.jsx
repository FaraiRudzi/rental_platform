'use client'
import { AuthProvider } from '@/lib/auth'
import { SiteProvider } from '@/lib/site'

export default function Providers({ site, children }) {
  return (
    <SiteProvider initial={site}>
      <AuthProvider>{children}</AuthProvider>
    </SiteProvider>
  )
}
