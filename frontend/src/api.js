// Thin fetch wrapper: JWT auth, automatic token refresh, readable errors.
const BASE = (import.meta.env.VITE_API_URL || '') + '/api'
const KEY = 'rp_tokens'

export const tokens = {
  get: () => { try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null } },
  set: (t) => localStorage.setItem(KEY, JSON.stringify(t)),
  clear: () => localStorage.removeItem(KEY),
}

function errorMessage(data, status) {
  if (!data) return `Request failed (${status})`
  if (typeof data === 'string') return data
  if (data.detail) return data.detail
  const first = Object.entries(data)[0]
  if (first) {
    const [field, msg] = first
    return `${field}: ${Array.isArray(msg) ? msg[0] : typeof msg === 'object' ? JSON.stringify(msg) : msg}`
  }
  return `Request failed (${status})`
}

let refreshing = null
async function refreshAccess() {
  const t = tokens.get()
  if (!t?.refresh) return false
  refreshing ??= fetch(`${BASE}/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: t.refresh }),
  })
    .then(async (r) => {
      if (!r.ok) return false
      const d = await r.json()
      tokens.set({ ...t, access: d.access, refresh: d.refresh || t.refresh })
      return true
    })
    .catch(() => false)
    .finally(() => { refreshing = null })
  return refreshing
}

export async function api(path, { method = 'GET', body, params, form } = {}, retry = true) {
  const url = new URL(BASE + path, window.location.origin)
  if (params) Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) url.searchParams.set(k, v) })
  const headers = { 'X-Channel': 'web' }
  const t = tokens.get()
  if (t?.access) headers.Authorization = `Bearer ${t.access}`
  let payload
  if (form) payload = form
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }

  const res = await fetch(url, { method, headers, body: payload })
  if (res.status === 401 && retry && t?.refresh && (await refreshAccess())) return api(path, { method, body, params, form }, false)
  if (res.status === 401 && t) { tokens.clear(); window.dispatchEvent(new Event('rp:logout')) }
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) { const e = new Error(errorMessage(data, res.status)); e.data = data; e.status = res.status; throw e }
  return data
}

export const money = (amount, currency = 'USD') => {
  const n = Number(amount)
  return Number.isNaN(n) ? '' : `${currency} ${n.toFixed(2).replace(/\.00$/, '')}`
}
export const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')
