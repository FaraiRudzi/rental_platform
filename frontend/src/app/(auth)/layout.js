import { Suspense } from 'react'

export default function AuthLayout({ children }) {
  return <Suspense fallback={null}>{children}</Suspense>
}
