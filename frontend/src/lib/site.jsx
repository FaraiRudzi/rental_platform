'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { SITE_DEFAULTS } from './site-defaults'

const Ctx = createContext({ ...SITE_DEFAULTS, refresh: () => {} })
export const useSite = () => useContext(Ctx)

// Branding from Admin > Settings. Colours are applied as CSS variables so the whole site re-themes.
export function SiteProvider({ initial, children }) {
  const [site, setSite] = useState({ ...SITE_DEFAULTS, ...initial })
  const refresh = useCallback(() => api('/site/').then((s) => setSite((prev) => ({ ...prev, ...s }))).catch(() => {}), [])

  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--blue', site.color_primary)
    root.setProperty('--navy', site.color_dark)
  }, [site.color_primary, site.color_dark])

  const value = useMemo(() => ({ ...site, refresh }), [site, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
