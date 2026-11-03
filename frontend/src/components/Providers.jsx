'use client'
import { AuthProvider } from '@/lib/auth'
import { SiteProvider } from '@/lib/site'
import { ConfirmProvider } from './ConfirmDialog'
import ToastHost from './ToastHost'

export default function Providers({ site, children }) {
  return (
    <SiteProvider initial={site}>
      <AuthProvider><ConfirmProvider>{children}</ConfirmProvider></AuthProvider>
      <ToastHost />
    </SiteProvider>
  )
}
