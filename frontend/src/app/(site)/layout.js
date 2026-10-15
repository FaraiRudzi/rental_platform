import { Suspense } from 'react'
import SiteShell from '@/components/SiteShell'

export default function SiteLayout({ children }) {
  return <SiteShell><Suspense fallback={null}>{children}</Suspense></SiteShell>
}
