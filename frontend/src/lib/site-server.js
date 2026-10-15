// Server-side: fetch branding straight from the backend (not through the browser proxy).
import { SITE_DEFAULTS } from './site-defaults'

export async function loadSite() {
  const base = process.env.API_INTERNAL_URL || 'http://127.0.0.1:8000'
  try {
    const res = await fetch(`${base}/api/site/`, { cache: 'no-store', signal: AbortSignal.timeout(4000) })
    if (!res.ok) throw new Error(`site settings: ${res.status}`)
    return { ...SITE_DEFAULTS, ...(await res.json()) }
  } catch {
    return SITE_DEFAULTS
  }
}
