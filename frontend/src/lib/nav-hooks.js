'use client'
import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams as useNextSearchParams } from 'next/navigation'

export function useNavigate() {
  const router = useRouter()
  return useCallback((to, opts) => (opts?.replace ? router.replace(to) : router.push(to)), [router])
}

export function useLocation() {
  return { pathname: usePathname() }
}

// Returns [params, setParams] like the old router did. setParams({a: 1}) updates the URL.
export function useSearchParams() {
  const params = useNextSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const setParams = useCallback((next, opts) => {
    const qs = new URLSearchParams(next).toString()
    const url = `${pathname}${qs ? `?${qs}` : ''}`
    if (opts?.replace) router.replace(url); else router.push(url)
  }, [router, pathname])
  return [params, setParams]
}
